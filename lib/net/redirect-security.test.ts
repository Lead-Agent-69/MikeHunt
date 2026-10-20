import * as http from "node:http";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const redirectHttp = createRequire(import.meta.url)("follow-redirects")
  .http as typeof http;
const servers: http.Server[] = [];

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return address.port;
}

async function redirectedHeaders(
  headers: http.OutgoingHttpHeaders | string[],
  sensitiveHeaders: string[] = [],
) {
  let received: http.IncomingHttpHeaders = {};
  const target = await listen((request, response) => {
    received = request.headers;
    response.end("ok");
  });
  const origin = await listen((_request, response) => {
    response.writeHead(302, { Location: `http://127.0.0.1:${target}/` });
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    const request = redirectHttp.get(
      {
        hostname: "127.0.0.1",
        port: origin,
        path: "/",
        headers,
        sensitiveHeaders,
      } as http.RequestOptions,
      (response) => {
        response.on("error", reject);
        response.on("end", resolve);
        response.resume();
      },
    );
    request.once("error", reject);
    request.setTimeout(2_000, () => request.destroy(new Error("Test timeout")));
  });
  return received;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("cross-origin redirect credential protection", () => {
  it("strips credential headers supplied in Node's alternating array format", async () => {
    const received = await redirectedHeaders([
      "Authorization",
      "Bearer synthetic-test-token",
      "Cookie",
      "synthetic=session",
      "Proxy-Authorization",
      "Basic synthetic",
      "X-Public",
      "retained",
    ]);
    expect(received.authorization).toBeUndefined();
    expect(received.cookie).toBeUndefined();
    expect(received["proxy-authorization"]).toBeUndefined();
    expect(received["x-public"]).toBe("retained");
  });

  it("escapes metacharacters in caller-declared sensitive header names", async () => {
    const received = await redirectedHeaders(
      {
        "X^Secret": "synthetic",
        "X|Token": "synthetic",
        "X-Public": "retained",
      },
      ["X^Secret", "X|Token"],
    );
    expect(received["x^secret"]).toBeUndefined();
    expect(received["x|token"]).toBeUndefined();
    expect(received["x-public"]).toBe("retained");
  });
});
