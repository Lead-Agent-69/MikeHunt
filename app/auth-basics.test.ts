import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("account and touch basics", () => {
  it("keeps password controls accessible on both auth forms", () => {
    const field = readFileSync("components/shared/Field.tsx", "utf8");
    const login = readFileSync("app/(auth)/login/page.tsx", "utf8");
    const register = readFileSync("app/(auth)/register/page.tsx", "utf8");

    expect(field).toContain("export function PasswordField");
    expect(field).toContain(
      'aria-label={visible ? "Hide password" : "Show password"}',
    );
    expect(login).toContain("<PasswordField");
    expect(register).toContain("<PasswordField");
  });

  it("uses a durable browser session and leaves touch scrolling native", () => {
    const supabase = readFileSync("lib/supabase.ts", "utf8");
    const smoothScroll = readFileSync(
      "components/ui/framer-components.tsx",
      "utf8",
    );

    expect(supabase).toContain("persistSession: true");
    expect(supabase).toContain("autoRefreshToken: true");
    expect(smoothScroll).toContain("(pointer: fine) and (min-width: 769px)");
    expect(smoothScroll).toContain(
      "if (!finePointer.matches || reducedMotion.matches) return",
    );
  });
});
