import "dotenv/config";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiClientConfig {
  apiKey: string;
  baseUrl: string;
  modelFast: string;
  modelSmart: string;
}

export interface AiCallOptions {
  model?: "fast" | "smart";
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

// pricing per 1M tokens (approximate)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

export class AiClient {
  private config: AiClientConfig;
  private totalUsage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
  private callCount = 0;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.log("⚠️  No OPENAI_API_KEY set — AI analysis will be skipped");
    }
    this.config = {
      apiKey,
      baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      modelFast: process.env.AI_MODEL_FAST || "gpt-4o-mini",
      modelSmart: process.env.AI_MODEL_SMART || "gpt-4o",
    };
  }

  get isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  get usage(): AiUsage {
    return { ...this.totalUsage };
  }

  get calls(): number {
    return this.callCount;
  }

  async chat(messages: AiMessage[], options: AiCallOptions = {}): Promise<string> {
    if (!this.config.apiKey) throw new Error("No API key");

    const model = options.model === "smart" ? this.config.modelSmart : this.config.modelFast;
    const body: any = {
      model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
    };
    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const resp = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`AI API error ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    this.callCount++;

    // Track usage
    if (data.usage) {
      const u = data.usage;
      this.totalUsage.promptTokens += u.prompt_tokens || 0;
      this.totalUsage.completionTokens += u.completion_tokens || 0;
      this.totalUsage.totalTokens += (u.prompt_tokens || 0) + (u.completion_tokens || 0);

      const pricing = PRICING[model] || { input: 1, output: 3 };
      this.totalUsage.cost +=
        ((u.prompt_tokens || 0) / 1_000_000) * pricing.input +
        ((u.completion_tokens || 0) / 1_000_000) * pricing.output;
    }

    return data.choices?.[0]?.message?.content || "";
  }

  async chatJson<T>(messages: AiMessage[], options: AiCallOptions = {}): Promise<T> {
    const raw = await this.chat(messages, { ...options, jsonMode: true });
    try {
      // Sometimes the model wraps JSON in markdown code blocks
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from the response
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error(`Failed to parse AI JSON response: ${raw.slice(0, 200)}`);
    }
  }
}
