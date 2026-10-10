/**
 * True only when the file's FIRST statement is the "use client" directive. Leading whitespace,
 * line comments, block comments, and a BOM are skipped. A "use client" string that appears later
 * (e.g. inside a template or after an import) does not count, so the guard can't be dodged that way.
 */
export function hasUseClientDirective(src: string): boolean {
  let s = src.replace(/^\uFEFF/, "");
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, "");
    s = s.replace(/^\/\/[^\n]*(\n|$)/, "");
    s = s.replace(/^\/\*[\s\S]*?\*\//, "");
    if (s === before) break;
  }
  return /^(["'])use client\1\s*(;|\n|$)/.test(s);
}
