import { test } from "@playwright/test";
import { isLocalE2ETarget } from "./is-local-target";

/** Where the suite points. Anything that is not localhost is treated as production. */
export const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
export const IS_LOCAL = isLocalE2ETarget(BASE_URL);
export const IS_PROD = !IS_LOCAL;

export const LOCAL_ONLY_REASON =
  "Signed-in / write flow: runs only against a local build with local or mocked Supabase auth (never prod).";

/** Call at the top of any describe that signs in, signs up, saves, or submits a form. */
export function localOnly() {
  test.skip(IS_PROD, LOCAL_ONLY_REASON);
}

/** Hard guard used by every helper that creates accounts or writes data. */
export function assertLocalTarget(action: string) {
  if (!IS_LOCAL) {
    throw new Error(
      `Refusing to ${action} against ${BASE_URL}: write flows are local-only.`,
    );
  }
}
