import "dotenv/config";

// ** import core packages
import { GoogleGenAI } from "@google/genai";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

export interface GeminiCallOptions {
  model?: "vision" | "analysis" | "codegen";
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;
}

export interface GeminiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ════════════════════════════════════════════════════
// GEMINI CLIENT
// ════════════════════════════════════════════════════

export class GeminiClient {
  private ai: GoogleGenAI;
  private models: { vision: string; analysis: string; codegen: string };
  private totalUsage: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private callCount = 0;

  constructor() {
    const apiKey = process.env.GOOGLE_CLOUD_API_KEY || "";
    if (!apiKey) {
      console.log("⚠️  No GOOGLE_CLOUD_API_KEY set — Gemini vision pipeline will be skipped");
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.models = {
      vision: process.env.GEMINI_MODEL_VISION || "gemini-3.1-pro-preview",
      analysis: process.env.GEMINI_MODEL_ANALYSIS || "gemini-3.1-pro-preview",
      codegen: process.env.GEMINI_MODEL_CODEGEN || "gemini-3.1-pro-preview",
    };
  }

  get isAvailable(): boolean {
    return !!(process.env.GOOGLE_CLOUD_API_KEY);
  }

  get usage(): GeminiUsage {
    return { ...this.totalUsage };
  }

  get calls(): number {
    return this.callCount;
  }

  private resolveModel(opt: GeminiCallOptions["model"]): string {
    switch (opt) {
      case "vision": return this.models.vision;
      case "codegen": return this.models.codegen;
      default: return this.models.analysis;
    }
  }

  private buildConfig(options: GeminiCallOptions) {
    const safetySettings = [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    ];

    const config: Record<string, any> = {
      maxOutputTokens: options.maxOutputTokens ?? 65536,
      temperature: options.temperature ?? 0.4,
      topP: 0.95,
      safetySettings,
    };

    if (options.jsonMode) {
      config.responseMimeType = "application/json";
    }

    return config;
  }

  // ─── Core call with retry ───────────────────────────────────────────────────

  private async callWithRetry(
    modelId: string,
    contents: GeminiMessage[],
    config: Record<string, any>,
    maxRetries = 3
  ): Promise<string> {
    console.log(`[GeminiClient] Making call using model: ${modelId}`);
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const req = { model: modelId, contents, config };
        const streamResp = await this.ai.models.generateContentStream(req);

        let text = "";
        for await (const chunk of streamResp) {
          if (chunk.text) text += chunk.text;
        }

        // Best-effort token tracking (usage metadata not always present in streaming)
        this.callCount++;

        return text;
      } catch (err: any) {
        lastErr = err;
        const isRetryable =
          err?.message?.includes("503") ||
          err?.message?.includes("429") ||
          err?.message?.includes("overloaded") ||
          err?.message?.includes("Resource has been exhausted");

        if (!isRetryable || attempt === maxRetries - 1) break;

        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastErr || new Error("Gemini call failed after retries");
  }

  // ─── Text chat ──────────────────────────────────────────────────────────────

  async chat(prompt: string, systemPrompt?: string, options: GeminiCallOptions = {}): Promise<string> {
    if (!this.isAvailable) throw new Error("No GOOGLE_CLOUD_API_KEY");

    const modelId = this.resolveModel(options.model);
    const config = this.buildConfig(options);

    const contents: GeminiMessage[] = [];
    if (systemPrompt) {
      contents.push({ role: "user", parts: [{ text: `SYSTEM: ${systemPrompt}\n\n---\n\n${prompt}` }] });
    } else {
      contents.push({ role: "user", parts: [{ text: prompt }] });
    }

    return this.callWithRetry(modelId, contents, config);
  }

  async chatJson<T>(prompt: string, systemPrompt?: string, options: GeminiCallOptions = {}): Promise<T> {
    const raw = await this.chat(prompt, systemPrompt, { ...options, jsonMode: true });
    return this.parseJson<T>(raw);
  }

  /**
   * Chat with text + optional images (multimodal).
   * Images are base64-encoded with mimeType.
   */
  async chatWithImages(
    prompt: string,
    images: Array<{ data: string; mimeType: string }>,
    systemPrompt?: string,
    options: GeminiCallOptions = {}
  ): Promise<string> {
    if (!this.isAvailable) throw new Error("No GOOGLE_CLOUD_API_KEY");

    const modelId = this.resolveModel(options.model);
    const config = this.buildConfig(options);

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Add images first
    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    // Add text prompt
    const textContent = systemPrompt
      ? `SYSTEM: ${systemPrompt}\n\n---\n\n${prompt}`
      : prompt;
    parts.push({ text: textContent });

    const contents: GeminiMessage[] = [{ role: "user", parts }];
    return this.callWithRetry(modelId, contents, config);
  }

  // ─── Vision (image + text) ──────────────────────────────────────────────────

  async analyzeImage(
    imageBase64: string,
    mimeType: "image/png" | "image/jpeg" | "image/webp",
    prompt: string,
    systemPrompt?: string,
    options: GeminiCallOptions = {}
  ): Promise<string> {
    if (!this.isAvailable) throw new Error("No GOOGLE_CLOUD_API_KEY");

    const modelId = this.resolveModel(options.model ?? "vision");
    const config = this.buildConfig({ ...options, model: options.model ?? "vision" });

    const imagePart = { inlineData: { mimeType, data: imageBase64 } };
    const textPart = { text: systemPrompt ? `SYSTEM: ${systemPrompt}\n\n---\n\n${prompt}` : prompt };

    const contents: GeminiMessage[] = [
      { role: "user", parts: [imagePart, textPart] },
    ];

    return this.callWithRetry(modelId, contents, config);
  }

  async analyzeImageJson<T>(
    imageBase64: string,
    mimeType: "image/png" | "image/jpeg" | "image/webp",
    prompt: string,
    systemPrompt?: string,
    options: GeminiCallOptions = {}
  ): Promise<T> {
    const raw = await this.analyzeImage(imageBase64, mimeType, prompt, systemPrompt, {
      ...options,
      jsonMode: true,
    });
    return this.parseJson<T>(raw);
  }

  // ─── Streaming chat ─────────────────────────────────────────────────────────

  /**
   * Stream chat response token-by-token.
   * Yields text chunks as they arrive from Gemini.
   */
  async *chatStream(
    prompt: string,
    systemPrompt?: string,
    options: GeminiCallOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isAvailable) throw new Error("No GOOGLE_CLOUD_API_KEY");

    const modelId = this.resolveModel(options.model);
    const config = this.buildConfig(options);

    const contents: GeminiMessage[] = [];
    if (systemPrompt) {
      contents.push({ role: "user", parts: [{ text: `SYSTEM: ${systemPrompt}\n\n---\n\n${prompt}` }] });
    } else {
      contents.push({ role: "user", parts: [{ text: prompt }] });
    }

    console.log(`[GeminiClient] Streaming chat using model: ${modelId}`);

    const response = await this.ai.models.generateContentStream({
      model: modelId,
      contents,
      config,
    });

    this.callCount++;
    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  }

  /**
   * Stream chat response with images (multimodal) token-by-token.
   */
  async *chatStreamWithImages(
    prompt: string,
    images: Array<{ data: string; mimeType: string }>,
    systemPrompt?: string,
    options: GeminiCallOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isAvailable) throw new Error("No GOOGLE_CLOUD_API_KEY");

    const modelId = this.resolveModel(options.model);
    const config = this.buildConfig(options);

    const parts: GeminiMessage["parts"] = [];

    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    const textContent = systemPrompt
      ? `SYSTEM: ${systemPrompt}\n\n---\n\n${prompt}`
      : prompt;
    parts.push({ text: textContent });

    const contents: GeminiMessage[] = [{ role: "user", parts }];

    console.log(`[GeminiClient] Streaming multimodal chat using model: ${modelId}`);

    const response = await this.ai.models.generateContentStream({
      model: modelId,
      contents,
      config,
    });

    this.callCount++;
    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  }

  // ─── JSON parsing helper ────────────────────────────────────────────────────

  parseJson<T>(raw: string): T {
    // Strip markdown code fences if model wraps output
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fallback: try extracting the first {...} or [...] block
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      const match = objMatch || arrMatch;
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch { }
      }
      throw new Error(`Failed to parse Gemini JSON response: ${raw.slice(0, 300)}`);
    }
  }
}
