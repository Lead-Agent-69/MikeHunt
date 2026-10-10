const crypto = require("crypto");
const SECRET = "local-only-jwt-secret-for-mikehunt-e2e-0123456789";
const b64 = (o) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString(
    "base64url",
  );
function sign(payload) {
  const h = b64({ alg: "HS256", typ: "JWT" }),
    p = b64(payload);
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
function verify(tok) {
  const [h, p, s] = String(tok || "").split(".");
  if (!s) return null;
  const want = crypto
    .createHmac("sha256", SECRET)
    .update(`${h}.${p}`)
    .digest("base64url");
  if (want !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  if (c.exp && c.exp < Date.now() / 1000) return null;
  return c;
}
const far = 2000000000;
module.exports = {
  SECRET,
  sign,
  verify,
  ANON: sign({ role: "anon", iss: "supabase", exp: far }),
  SERVICE: sign({ role: "service_role", iss: "supabase", exp: far }),
};
if (require.main === module) {
  const k = module.exports;
  console.log(`ANON=${k.ANON}\nSERVICE=${k.SERVICE}`);
}
