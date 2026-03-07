import { GeminiClient } from "../gemini-client.js";
import fs from "fs";
import path from "path";

export class MemoryGenerator {
  private ai: GeminiClient;
  private rawData: any;
  private outDir: string;

  constructor(ai: GeminiClient, rawData: any, outputRoot: string) {
    this.ai = ai;
    this.rawData = rawData;
    this.outDir = path.join(outputRoot, "memory");
    if (!fs.existsSync(this.outDir)) {
      fs.mkdirSync(this.outDir, { recursive: true });
    }
  }

  async generateAll() {
    console.log("    ↳ Generating tokens.md...");
    await this.generateTokens();
    
    console.log("    ↳ Generating components.md...");
    await this.generateComponents();
    
    console.log("    ↳ Generating patterns.md...");
    await this.generatePatterns();
    
    console.log("    ↳ Generating doctrine.md...");
    await this.generateDoctrine();
    
    console.log("    ↳ Generating remix-guide.md...");
    await this.generateRemixGuide();
    
    return { success: true, dir: this.outDir };
  }

  private async generateTokens() {
    const prompt = `
Analyze the following raw design tokens and generate a comprehensive markdown documentation file (tokens.md) for them.
The markdown should be structured clearly with headings for Colors, Typography, Spacing, Shadows, Radii, etc.
Include CSS variables or hex codes directly in the output. Provide brief semantic descriptions where possible based on the raw values.

Raw Tokens:
${JSON.stringify(this.rawData.tokens, null, 2)}
`;
    const result = await this.ai.chat(prompt, "You are an expert design system engineer creating a tokens.md file.");
    fs.writeFileSync(path.join(this.outDir, "tokens.md"), result);
  }

  private async generateComponents() {
    // Only pass a summary to avoid token limits
    const compSummary = this.rawData.components.slice(0, 50).map((c: any) => ({
      id: c.id,
      type: c.type,
      subType: c.subType,
      confidence: c.confidence,
      cssContext: Object.keys(c.cssContext || {}).length + " classes"
    }));

    const prompt = `
Analyze the following extracted components and generate a markdown documentation file (components.md).
Group them by type (e.g., button, card, navigation). Describe the observed component library.

Raw Components (Sample):
${JSON.stringify(compSummary, null, 2)}
`;
    const result = await this.ai.chat(prompt, "You are an expert design system engineer creating a components.md file.");
    fs.writeFileSync(path.join(this.outDir, "components.md"), result);
  }

  private async generatePatterns() {
    const patternSummary = this.rawData.patterns.map((p: any) => ({
      id: p.id,
      instances: p.instances.length,
      exampleType: p.instances[0]?.type
    }));

    const prompt = `
Analyze the following observed design patterns and generate a markdown documentation file (patterns.md).
Discuss recurring structural compositions.

Raw Patterns:
${JSON.stringify(patternSummary, null, 2)}
`;
    const result = await this.ai.chat(prompt, "You are an expert design system engineer creating a patterns.md file.");
    fs.writeFileSync(path.join(this.outDir, "patterns.md"), result);
  }

  private async generateDoctrine() {
    const prompt = `
Based on the extracted components, tokens, and patterns, deduce the underlying design doctrine (doctrine.md) of this interface.
Discuss its visual aesthetic, interaction principles, accessibility approach, and structural layout philosophies.

Tokens Summary: ${Object.keys(this.rawData.tokens).map(k => k + ": " + this.rawData.tokens[k].length).join(', ')}
Total Components: ${this.rawData.components.length}
`;
    const result = await this.ai.chat(prompt, "You are an expert design system engineer creating a doctrine.md file.");
    fs.writeFileSync(path.join(this.outDir, "doctrine.md"), result);
  }

  private async generateRemixGuide() {
    const prompt = `
Write a remix-guide.md that instructs an LLM on how to rebuild or remix this specific design system using standard web technologies (HTML, Tailwind CSS, or React).
Provide rules of thumb, key atomic classes to construct, and common pitfalls based on the design tokens and component structure.

Tokens Summary: ${Object.keys(this.rawData.tokens).map(k => k + ": " + this.rawData.tokens[k].length).join(', ')}
`;
    const result = await this.ai.chat(prompt, "You are an expert design system engineer creating a remix-guide.md file.");
    fs.writeFileSync(path.join(this.outDir, "remix-guide.md"), result);
  }
}
