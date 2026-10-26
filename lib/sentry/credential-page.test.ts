import { expect, it } from "vitest";
import { isRecoveryCredentialPage } from "./credential-page";

it("excludes emailed recovery credentials from client telemetry", () => {
  expect(
    isRecoveryCredentialPage(
      "https://dealerhunt.vercel.app/reset-password#token_hash=secret",
    ),
  ).toBe(true);
  expect(
    isRecoveryCredentialPage(
      "https://dealerhunt.vercel.app/reset-password#token_hash=",
    ),
  ).toBe(true);
});
it("restores monitoring after the credential is removed", () => {
  expect(
    isRecoveryCredentialPage("https://dealerhunt.vercel.app/reset-password"),
  ).toBe(false);
  expect(
    isRecoveryCredentialPage("https://dealerhunt.vercel.app/market?states=MO"),
  ).toBe(false);
  expect(isRecoveryCredentialPage("not a URL")).toBe(false);
});
