// LOCAL-ONLY Supabase stand-in: /rest/v1 -> PostgREST, /auth/v1 -> a tiny mock GoTrue backed by
// auth.users in the local Postgres. Never points at prod.
const http = require("http");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const { sign, verify } = require("./keys.cjs");
const DB =
  process.env.DB_URL || "postgresql://postgres@127.0.0.1:55491/mikehunt";
const PGRST = { host: "127.0.0.1", port: 54330 };
const psql = (sql, vars = {}) =>
  execFileSync(
    "psql",
    [
      DB,
      "-qAtX",
      "-v",
      "ON_ERROR_STOP=1",
      ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]),
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
const refresh = new Map();
function userRow(where, vars) {
  const out = psql(
    `SELECT row_to_json(u) FROM (SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at FROM auth.users WHERE ${where}) u;`,
    vars,
  );
  return out ? JSON.parse(out.split("\n")[0]) : null;
}
const toUser = (r) => ({
  id: r.id,
  aud: "authenticated",
  role: "authenticated",
  email: r.email,
  email_confirmed_at: r.email_confirmed_at,
  phone: "",
  confirmed_at: r.email_confirmed_at,
  app_metadata: {
    provider: "email",
    providers: ["email"],
    ...(r.raw_app_meta_data || {}),
  },
  user_metadata: r.raw_user_meta_data || {},
  identities: [],
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_anonymous: false,
});
function session(r) {
  const now = Math.floor(Date.now() / 1000),
    user = toUser(r);
  const access_token = sign({
    sub: r.id,
    email: r.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: crypto.randomUUID(),
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    is_anonymous: false,
    aal: "aal1",
  });
  const refresh_token = crypto.randomBytes(16).toString("hex");
  refresh.set(refresh_token, r.id);
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token,
    user,
  };
}
const send = (res, code, body) => {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const err = (res, code, msg, error_code) =>
  send(res, code, {
    code,
    error_code,
    msg,
    message: msg,
    error: error_code,
    error_description: msg,
  });
function readBody(req) {
  return new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        r(b ? JSON.parse(b) : {});
      } catch {
        r({});
      }
    });
  });
}
async function auth(req, res, path, q) {
  if (req.method === "OPTIONS") return send(res, 204);
  if (path === "/settings")
    return send(res, 200, {
      external: { email: true, google: true },
      disable_signup: false,
      mailer_autoconfirm: true,
    });
  if (path === "/health") return send(res, 200, { name: "mock-gotrue" });
  const body = ["POST", "PUT"].includes(req.method) ? await readBody(req) : {};
  if (path === "/signup" && req.method === "POST") {
    if (!body.email || !body.password)
      return err(res, 400, "Email and password required", "validation_failed");
    if (String(body.password).length < 6)
      return err(
        res,
        422,
        "Password should be at least 6 characters.",
        "weak_password",
      );
    if (userRow(`lower(email) = lower(:'e')`, { e: body.email }))
      return err(res, 422, "User already registered", "user_already_exists");
    psql(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES (:'e', crypt(:'p', gen_salt('bf', 4)), :'m'::jsonb);`,
      { e: body.email, p: body.password, m: JSON.stringify(body.data || {}) },
    );
    return send(
      res,
      200,
      session(userRow(`lower(email) = lower(:'e')`, { e: body.email })),
    );
  }
  if (path === "/token" && req.method === "POST") {
    if (q.get("grant_type") === "password") {
      const r = userRow(
        `lower(email) = lower(:'e') AND encrypted_password = crypt(:'p', encrypted_password)`,
        { e: body.email || "", p: body.password || "" },
      );
      return r
        ? send(res, 200, session(r))
        : err(res, 400, "Invalid login credentials", "invalid_credentials");
    }
    if (q.get("grant_type") === "refresh_token") {
      const id = refresh.get(body.refresh_token);
      if (!id)
        return err(
          res,
          400,
          "Invalid Refresh Token",
          "refresh_token_not_found",
        );
      return send(res, 200, session(userRow(`id = :'i'`, { i: id })));
    }
    return err(res, 400, "unsupported grant", "unsupported_grant_type");
  }
  const claims = verify(
    String(req.headers.authorization || "").replace(/^Bearer /i, ""),
  );
  if (path === "/user") {
    if (!claims || claims.role !== "authenticated")
      return err(res, 401, "Invalid JWT", "bad_jwt");
    if (req.method === "PUT" && body.data)
      psql(
        `UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || :'m'::jsonb WHERE id = :'i';`,
        { m: JSON.stringify(body.data), i: claims.sub },
      );
    const r = userRow(`id = :'i'`, { i: claims.sub });
    return r
      ? send(res, 200, toUser(r))
      : err(res, 404, "User not found", "user_not_found");
  }
  if (path === "/logout") return send(res, 204);
  if (path === "/recover" || path === "/otp" || path === "/resend")
    return send(res, 200, {});
  return err(
    res,
    404,
    `mock gotrue: ${req.method} ${path} not implemented`,
    "not_found",
  );
}
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    try {
      if (u.pathname.startsWith("/auth/v1"))
        return await auth(req, res, u.pathname.slice(8), u.searchParams);
      if (u.pathname.startsWith("/rest/v1")) {
        const p = http.request(
          {
            ...PGRST,
            method: req.method,
            path: u.pathname.slice(8) + u.search,
            headers: { ...req.headers, host: "127.0.0.1:54330" },
          },
          (r) => {
            res.writeHead(r.statusCode, r.headers);
            r.pipe(res);
          },
        );
        p.on("error", (e) => err(res, 502, e.message, "bad_gateway"));
        req.pipe(p);
        return;
      }
      return err(
        res,
        404,
        `mock: ${u.pathname} not available locally`,
        "not_found",
      );
    } catch (e) {
      return err(res, 500, e.message, "mock_error");
    }
  })
  .listen(54321, "127.0.0.1", () => console.log("gateway on 54321"));
