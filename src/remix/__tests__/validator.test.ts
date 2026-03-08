import { describe, it, expect } from "vitest";
import { validateAndRepair } from "../codegen/validator.js";

describe("validateAndRepair", () => {
    it("passes through valid code unchanged", () => {
        const code = `import React from "react";

export function Hero() {
  return <div>Hero</div>;
}
`;
        const result = validateAndRepair(code, "src/Hero.tsx");
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(result.repaired).toBe(code);
    });

    it("closes unterminated template literal", () => {
        const code = 'const msg = `Hello world\n';
        const result = validateAndRepair(code, "src/test.ts");
        expect(result.valid).toBe(false);
        expect(result.repaired).toContain("`");
        expect(result.issues.some(i => i.includes("template literal"))).toBe(true);
    });

    it("closes missing braces", () => {
        const code = `export function App() {
  return (
    <div>
      <h1>Hello</h1>
`;
        const result = validateAndRepair(code, "src/App.tsx");
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes("brace") || i.includes("parenthes"))).toBe(true);
        // Should have added closing ) and }
        const closingBraces = (result.repaired.match(/\}/g) || []).length;
        const openingBraces = (result.repaired.match(/\{/g) || []).length;
        expect(closingBraces).toBe(openingBraces);
    });

    it("closes unterminated double-quote string", () => {
        const code = 'const name = "Hello world\n';
        const result = validateAndRepair(code, "src/test.ts");
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes("string"))).toBe(true);
        expect(result.repaired).toContain('"Hello world"');
    });

    it("closes unterminated single-quote string", () => {
        const code = "const name = 'Hello world\n";
        const result = validateAndRepair(code, "src/test.ts");
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes("string"))).toBe(true);
        expect(result.repaired).toContain("'Hello world'");
    });

    it("removes truncated trailing line", () => {
        const code = `export function App() {
  return <div>Hello</div>;
}
const partialVaria`;
        const result = validateAndRepair(code, "src/App.tsx");
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes("truncated"))).toBe(true);
        expect(result.repaired).not.toContain("partialVaria");
    });

    it("handles multiple issues in one file", () => {
        const code = `export function App() {
  const msg = \`Hello
  return (
    <div>{msg}</div>
`;
        const result = validateAndRepair(code, "src/App.tsx");
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });

    it("does not break already-valid complex JSX", () => {
        const code = `import React from "react";

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg bg-gray-100">
      <h2 className="text-xl font-bold">{title}</h2>
      <div>{children}</div>
    </div>
  );
}
`;
        const result = validateAndRepair(code, "src/Card.tsx");
        expect(result.valid).toBe(true);
        expect(result.repaired).toBe(code);
    });

    it("handles CSS files without false positives", () => {
        const code = `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --primary: #3b82f6;
  --background: #0a0a0a;
}
`;
        const result = validateAndRepair(code, "src/index.css");
        expect(result.valid).toBe(true);
    });
});
