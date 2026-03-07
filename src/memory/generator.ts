// ** import core packages
import fs from 'fs';
import path from 'path';

// ** import utils
import type { GeminiClient } from '../gemini-client.js';

// ** import apis
import { runAnalyzeStage } from './analyze/index.js';
import { runInterpretStage } from './interpret/index.js';
import { renderStyle } from './render/style.js';
import { renderComponents } from './render/components.js';
import { renderLayout } from './render/layout.js';
import { renderMotion } from './render/motion.js';
import { renderQA } from './render/qa.js';
import { renderPrinciples } from './render/principles.js';
import { renderReference } from './render/reference.js';
import { renderInstructions } from './render/instructions.js';
import { renderDesignSystemSkill } from './render/skills/design-system.js';
import { renderColorPaletteSkill } from './render/skills/color-palette.js';
import { renderTypographySkill } from './render/skills/typography.js';
import { renderComponentPatternsSkill } from './render/skills/component-patterns.js';
import { renderLayoutStructureSkill } from './render/skills/layout-structure.js';
import { renderMotionGuidelinesSkill } from './render/skills/motion-guidelines.js';

export class MemoryGenerator {
  private ai: GeminiClient;
  private rawData: any;
  private outDir: string;

  constructor(ai: GeminiClient, rawData: any, outputRoot: string) {
    this.ai = ai;
    this.rawData = rawData;
    this.outDir = path.join(outputRoot, '.design-memory');
  }

  async generateAll(): Promise<{ success: boolean; dir: string }> {
    // ── Stage 1: Analyze ──────────────────────────────────────────────────────
    console.log('    ↳ [memory] Analyze stage — bridging rawData → IR…');
    const partial = runAnalyzeStage(this.rawData);

    // ── Stage 2: Interpret (LLM) ──────────────────────────────────────────────
    console.log('    ↳ [memory] Interpret stage — classifying tokens with Gemini…');
    const ir = await runInterpretStage(partial, this.ai);

    // ── Stage 3: Render (write markdown) ──────────────────────────────────────
    console.log('    ↳ [memory] Render stage — writing markdown files…');
    const url = (this.rawData?.meta?.url as string) ?? 'unknown';

    fs.mkdirSync(this.outDir, { recursive: true });
    fs.mkdirSync(path.join(this.outDir, 'skills'), { recursive: true });

    const files: Record<string, string> = {
      'INSTRUCTIONS.md': renderInstructions(ir, url),
      'reference.md': renderReference(ir, url),
      'style.md': renderStyle(ir),
      'components.md': renderComponents(ir),
      'layout.md': renderLayout(ir),
      'principles.md': renderPrinciples(ir),
      'motion.md': renderMotion(ir),
      'qa.md': renderQA(ir),
      'skills/design-system.md': renderDesignSystemSkill(ir, url),
      'skills/color-palette.md': renderColorPaletteSkill(ir),
      'skills/typography.md': renderTypographySkill(ir),
      'skills/component-patterns.md': renderComponentPatternsSkill(ir),
      'skills/layout-structure.md': renderLayoutStructureSkill(ir),
      'skills/motion-guidelines.md': renderMotionGuidelinesSkill(ir),
    };

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(this.outDir, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`    ↳   ✓ ${filename}`);
    }

    console.log(`\n    ↳ [memory] Done → ${this.outDir}`);
    return { success: true, dir: this.outDir };
  }
}
