import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { Ico } from "@/components/shared/Ico";

const source = ts.createSourceFile(
  "Ico.tsx",
  readFileSync("components/shared/Ico.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declaration = source.statements.find(
  (node): node is ts.TypeAliasDeclaration =>
    ts.isTypeAliasDeclaration(node) && node.name.text === "IconName",
);
if (!declaration || !ts.isUnionTypeNode(declaration.type)) {
  throw new Error("The shared icon names must remain an explicit union.");
}
const names = declaration.type.types.map((node) => {
  if (!ts.isLiteralTypeNode(node) || !ts.isStringLiteral(node.literal)) {
    throw new Error("Every shared icon name must be a string literal.");
  }
  return node.literal.text as ComponentProps<typeof Ico>["name"];
});

describe("Shared icon completeness", () => {
  it.each(names)("renders %s with the requested dimensions", (name) => {
    const markup = renderToStaticMarkup(
      React.createElement(Ico, { name, size: 27, className: "shared-icon" }),
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain('width="27"');
    expect(markup).toContain('height="27"');
    expect(markup).toContain("shared-icon");
  });
});
