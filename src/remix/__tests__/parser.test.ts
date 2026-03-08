import { describe, it, expect } from "vitest";
import { parseGeneratedFiles, mergeFiles } from "../codegen/parser.js";

describe("parseGeneratedFiles", () => {
    it("parses tsx blocks with file= attribute", () => {
        const output = `Here's the component:

\`\`\`tsx file="src/components/Hero.tsx"
import React from "react";

export function Hero() {
  return <div>Hero</div>;
}
\`\`\`

And the page:

\`\`\`tsx file="src/App.tsx"
import { Hero } from "./components/Hero";

export default function App() {
  return <Hero />;
}
\`\`\``;

        const files = parseGeneratedFiles(output);
        expect(files.length).toBe(2);
        expect(files[0].path).toBe("src/components/Hero.tsx");
        expect(files[0].content).toContain("export function Hero");
        expect(files[1].path).toBe("src/App.tsx");
        expect(files[1].content).toContain("import { Hero }");
    });

    it("parses css blocks with file= attribute", () => {
        const output = `\`\`\`css file="src/index.css"
@tailwind base;
@tailwind components;
@tailwind utilities;
\`\`\``;

        const files = parseGeneratedFiles(output);
        expect(files.length).toBe(1);
        expect(files[0].path).toBe("src/index.css");
        expect(files[0].content).toContain("@tailwind base");
    });

    it("parses ts blocks", () => {
        const output = `\`\`\`ts file="src/lib/utils.ts"
export function cn() { return ""; }
\`\`\``;

        const files = parseGeneratedFiles(output);
        expect(files.length).toBe(1);
        expect(files[0].path).toBe("src/lib/utils.ts");
    });

    it("returns empty array for no matches", () => {
        const files = parseGeneratedFiles("No code blocks here.");
        expect(files.length).toBe(0);
    });

    it("ignores code blocks without file= attribute", () => {
        const output = `\`\`\`tsx
const x = 1;
\`\`\``;

        const files = parseGeneratedFiles(output);
        expect(files.length).toBe(0);
    });

    it("handles multiple blocks of same type", () => {
        const output = `\`\`\`tsx file="src/A.tsx"
export function A() { return null; }
\`\`\`

\`\`\`tsx file="src/B.tsx"
export function B() { return null; }
\`\`\`

\`\`\`tsx file="src/C.tsx"
export function C() { return null; }
\`\`\``;

        const files = parseGeneratedFiles(output);
        expect(files.length).toBe(3);
        expect(files.map((f) => f.path)).toEqual(["src/A.tsx", "src/B.tsx", "src/C.tsx"]);
    });
});

describe("mergeFiles", () => {
    it("combines files from two arrays", () => {
        const existing = [{ path: "src/A.tsx", content: "a" }];
        const updates = [{ path: "src/B.tsx", content: "b" }];
        const result = mergeFiles(existing, updates);
        expect(result.length).toBe(2);
    });

    it("overwrites existing files with same path", () => {
        const existing = [{ path: "src/A.tsx", content: "old" }];
        const updates = [{ path: "src/A.tsx", content: "new" }];
        const result = mergeFiles(existing, updates);
        expect(result.length).toBe(1);
        expect(result[0].content).toBe("new");
    });

    it("preserves order: existing first, then new", () => {
        const existing = [
            { path: "src/A.tsx", content: "a" },
            { path: "src/B.tsx", content: "b" },
        ];
        const updates = [
            { path: "src/C.tsx", content: "c" },
            { path: "src/A.tsx", content: "a-updated" },
        ];
        const result = mergeFiles(existing, updates);
        expect(result.length).toBe(3);
        expect(result.find((f) => f.path === "src/A.tsx")?.content).toBe("a-updated");
    });
});
