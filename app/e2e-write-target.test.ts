import { expect, it } from "vitest";
import { isLocalE2ETarget } from "../e2e/support/is-local-target";

it.each([
  "http://localhost:3007",
  "https://localhost/scan",
  "http://127.0.0.1:3000",
  "http://[::1]:3000",
  "http://LOCALHOST:3000",
])("accepts exact loopback test target %s", (url) => {
  expect(isLocalE2ETarget(url)).toBe(true);
});

it.each([
  "https://localhost.example.com",
  "https://localhost@production.example.com",
  "https://127.0.0.1.example.com",
  "https://production.example.com/localhost",
  "https://dealerhunt.vercel.app",
  "ftp://localhost",
  "http://user:password@localhost",
  "not a URL",
])("rejects remote, deceptive or invalid test target %s", (url) => {
  expect(isLocalE2ETarget(url)).toBe(false);
});
