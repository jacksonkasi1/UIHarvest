// ** import core packages
import type { Response } from "express";

// ** import types
import type { RemixSpec, GeneratedFile } from "./types.js";

// ** import apis
import { GeminiClient } from "../gemini-client.js";
import { buildIterationPrompt } from "./codegen/system-prompt.js";
import { parseGeneratedFiles, mergeFiles } from "./codegen/parser.js";

// ════════════════════════════════════════════════════
// CHAT EVENT TYPES
// ════════════════════════════════════════════════════

export type ChatEventType =
    | "thinking"
    | "text"
    | "tool_start"
    | "tool_end"
    | "done"
    | "error";

export interface ChatEvent {
    type: ChatEventType;
    content?: string;
    partial?: boolean;
    tool?: string;
    message?: string;
    files?: GeneratedFile[];
    summary?: string;
    error?: string;
    packages?: string[];
}

// ════════════════════════════════════════════════════
// CONVERSATION STATE (from open-lovable patterns)
// ════════════════════════════════════════════════════

export interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    editedFiles?: string[];
}

const MAX_CONVERSATION_HISTORY = 20;
const conversationStore = new Map<string, ConversationMessage[]>();

function getConversation(jobId: string): ConversationMessage[] {
    if (!conversationStore.has(jobId)) {
        conversationStore.set(jobId, []);
    }
    return conversationStore.get(jobId)!;
}

function addToConversation(jobId: string, msg: ConversationMessage): void {
    const conv = getConversation(jobId);
    conv.push(msg);
    // Keep only last N messages
    if (conv.length > MAX_CONVERSATION_HISTORY) {
        conv.splice(0, conv.length - MAX_CONVERSATION_HISTORY);
    }
}

function getConversationContext(jobId: string): string {
    const conv = getConversation(jobId);
    if (conv.length === 0) return "";
    return conv
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}${m.content.length > 300 ? "..." : ""}${m.editedFiles ? ` [edited: ${m.editedFiles.join(", ")}]` : ""}`)
        .join("\n");
}

/**
 * Restore conversation history from Firestore after a cold-start.
 * Called by RemixManager.getOrHydrate().
 */
export function restoreConversation(jobId: string, messages: ConversationMessage[]): void {
    conversationStore.set(jobId, messages.slice(-MAX_CONVERSATION_HISTORY));
    console.log(`[chat] Restored ${messages.length} conversation messages for job ${jobId}`);
}

// ════════════════════════════════════════════════════
// PACKAGE AUTO-DETECTION (from open-lovable patterns)
// ════════════════════════════════════════════════════

const KNOWN_PACKAGES: Record<string, string> = {
    "framer-motion": "framer-motion",
    "motion": "motion",
    "lucide-react": "lucide-react",
    "react-icons": "react-icons",
    "@radix-ui": "@radix-ui/react-icons",
    "react-hook-form": "react-hook-form",
    "zod": "zod",
    "date-fns": "date-fns",
    "recharts": "recharts",
    "react-router-dom": "react-router-dom",
    "@tanstack/react-query": "@tanstack/react-query",
    "embla-carousel-react": "embla-carousel-react",
    "sonner": "sonner",
    "react-markdown": "react-markdown",
    "remark-gfm": "remark-gfm",
};

function detectPackages(code: string): string[] {
    const detected: Set<string> = new Set();
    const importRegex = /from\s+['"]([^'"./][^'"]*)['"]|require\(['"]([^'"./][^'"]*)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
        const pkg = (match[1] || match[2]).split("/")[0];
        // Check if it's a known package that isn't in our scaffold
        if (pkg.startsWith("@")) {
            const scoped = (match[1] || match[2]).split("/").slice(0, 2).join("/");
            if (KNOWN_PACKAGES[scoped] || KNOWN_PACKAGES[pkg]) {
                detected.add(KNOWN_PACKAGES[scoped] || KNOWN_PACKAGES[pkg] || scoped);
            }
        } else if (KNOWN_PACKAGES[pkg]) {
            detected.add(KNOWN_PACKAGES[pkg]);
        }
    }
    return Array.from(detected);
}

// ════════════════════════════════════════════════════
// INTENT CLASSIFICATION
// ════════════════════════════════════════════════════

type Intent = "conversation" | "code_change";

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a live coding platform. 
Given a user message, classify it as ONE of:
- "conversation" — greetings, questions about the project, asking for explanations, general chat, help requests, or anything that does NOT require modifying code files
- "code_change" — requests to write code, modify, add, remove, fix, update, delete, clear, clone, or change any aspect of the website code, design, layout, colors, components, etc.

If the user is asking to build, create, write, or generate code, it is ALWAYS a "code_change".
If the user says "make a clone", "delete code", "write code", it is a "code_change".

Respond with ONLY the word "conversation" or "code_change". Nothing else.`;

async function classifyIntent(ai: GeminiClient, message: string): Promise<Intent> {
    try {
        const response = await ai.chat(message, INTENT_SYSTEM_PROMPT, {
            model: "analysis",
            maxOutputTokens: 20,
            temperature: 0.0,
        });

        const cleaned = response.trim().toLowerCase();
        if (cleaned.includes("code_change")) return "code_change";
        if (cleaned.includes("conversation")) return "conversation";

        // Fallback heuristics for ambiguous cases
        return classifyByKeywords(message);
    } catch (err) {
        console.error("[chat] Intent classification failed:", (err as Error).message);
        return classifyByKeywords(message);
    }
}

function classifyByKeywords(message: string): Intent {
    const codeKeywords = /\b(build|create|change|modify|update|add|remove|fix|make|set|replace|move|resize|style|color|font|layout|header|footer|button|section|page|component|animate|responsive|dark|light|theme|bigger|smaller|width|height|padding|margin|border|shadow|gradient|image|background|text|title|subtitle|heading|paragraph|link|hover|click|scroll|mobile|desktop|tablet|copy|replicate|write|code|delete|clear|clone|generate)\b/i;
    return codeKeywords.test(message) ? "code_change" : "conversation";
}

// ════════════════════════════════════════════════════
// CHAT SYSTEM PROMPT (for conversational responses)
// ════════════════════════════════════════════════════

function buildChatSystemPrompt(spec: RemixSpec): string {
    return `You are a friendly, expert frontend assistant for the "${spec.brand.name}" website project.
You are helping the user iterate on their website in a live coding environment.

About their project:
- Brand: ${spec.brand.name}
- Stack: React + Vite + TypeScript + Tailwind CSS
- Colors: ${spec.brand.colors.map(c => `${c.role}: ${c.hex}`).join(", ")}
- Typography: ${spec.brand.typography.map(t => `${t.role}: "${t.family}"`).join(", ")}

When chatting:
- Be warm, concise, and helpful
- You can discuss design decisions, suggest improvements, explain code
- Use markdown formatting (bold, code blocks, lists) in your responses
- If the user seems to want a code change, suggest what they could ask for
- Keep responses focused and under 200 words unless they ask for detail`;
}

// ════════════════════════════════════════════════════
// SSE HELPERS
// ════════════════════════════════════════════════════

function sendSSE(res: Response, event: ChatEvent): void {
    try {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            // Force flush to prevent Cloud Run / reverse proxy buffering
            if (typeof (res as any).flush === "function") {
                (res as any).flush();
            }
        }
    } catch (err) {
        console.error("[chat] SSE write error:", (err as Error).message);
    }
}

// ════════════════════════════════════════════════════
// MAIN CHAT HANDLER
// ════════════════════════════════════════════════════

export interface ChatHandlerDeps {
    jobId: string;
    spec: RemixSpec;
    files: GeneratedFile[];
    codegenSystemPrompt: string;
    onFilesUpdated: (files: GeneratedFile[]) => void;
}

/**
 * Handle a chat message with intent detection and SSE streaming.
 * Writes SSE events to the response and ends it when done.
 */
export async function handleChatMessage(
    res: Response,
    userPrompt: string,
    images: Array<{ data: string; mimeType: string }> | undefined,
    mode: string | undefined,
    deps: ChatHandlerDeps,
    signal: AbortSignal
): Promise<void> {
    const ai = new GeminiClient();

    // Track in conversation history
    addToConversation(deps.jobId, {
        role: "user",
        content: userPrompt,
        timestamp: Date.now(),
    });

    try {
        // Step 1: Classify intent
        sendSSE(res, { type: "thinking", message: "Understanding your request..." });

        if (signal.aborted) {
            sendSSE(res, { type: "done" });
            return;
        }

        let intent: Intent;
        if (mode === "Yolo" || mode === "Smart") {
            intent = "code_change";
            console.log(`[chat] Intent forced to code_change by mode: ${mode}`);
        } else if (images && images.length > 0) {
            // Strong heuristic: if user attaches an image, they almost always want a code change (e.g. "build this", "fix this bug")
            intent = "code_change";
        } else {
            console.log(`[chat] Classifying intent for: "${userPrompt.slice(0, 50)}..."`);
            intent = await classifyIntent(ai, userPrompt);
        }
        console.log(`[chat] Final Intent: ${intent}`);

        if (signal.aborted) {
            sendSSE(res, { type: "done" });
            return;
        }

        if (intent === "conversation") {
            await handleConversation(res, ai, userPrompt, images, deps, signal);
        } else {
            await handleCodeChange(res, ai, userPrompt, images, deps, signal);
        }
    } catch (err) {
        console.error("[chat] Top-level error:", (err as Error).message);
        sendSSE(res, {
            type: "error",
            error: `Something went wrong: ${(err as Error).message}`,
        });
    }

    if (!signal.aborted) {
        sendSSE(res, { type: "done" });
    }
}

// ════════════════════════════════════════════════════
// CONVERSATION HANDLER (with streaming + fallback)
// ════════════════════════════════════════════════════

async function handleConversation(
    res: Response,
    ai: GeminiClient,
    userPrompt: string,
    images: Array<{ data: string; mimeType: string }> | undefined,
    deps: ChatHandlerDeps,
    signal: AbortSignal
): Promise<void> {
    // Include conversation history in chat context
    const conversationCtx = getConversationContext(deps.jobId);
    let chatSystemPrompt = buildChatSystemPrompt(deps.spec);
    if (conversationCtx) {
        chatSystemPrompt += `\n\n## Recent Conversation History\n${conversationCtx}`;
    }

    // Try streaming first, fall back to non-streaming if it fails
    try {
        console.log("[chat] Starting streaming conversation...");
        let stream: AsyncGenerator<string, void, unknown>;

        if (images && images.length > 0) {
            stream = ai.chatStreamWithImages(
                userPrompt,
                images,
                chatSystemPrompt,
                { model: "analysis", maxOutputTokens: 2048, temperature: 0.7 }
            );
        } else {
            stream = ai.chatStream(
                userPrompt,
                chatSystemPrompt,
                { model: "analysis", maxOutputTokens: 2048, temperature: 0.7 }
            );
        }

        let fullText = "";
        let hasChunks = false;
        for await (const chunk of stream) {
            if (signal.aborted) break;
            fullText += chunk;
            hasChunks = true;
            sendSSE(res, { type: "text", content: fullText, partial: true });
        }

        if (!signal.aborted && hasChunks) {
            sendSSE(res, { type: "text", content: fullText, partial: false });
            console.log(`[chat] Streamed ${fullText.length} chars`);
            return;
        }

        // Stream returned 0 chunks — fall through to fallback
        if (!hasChunks && !signal.aborted) {
            console.warn("[chat] Stream yielded 0 chunks, falling back to non-streaming...");
            throw new Error("Stream empty");
        }
    } catch (streamErr) {
        console.warn("[chat] Streaming failed, trying non-streaming fallback:", (streamErr as Error).message);

        if (signal.aborted) return;

        // FALLBACK: non-streaming chat
        try {
            const response = await ai.chat(
                userPrompt,
                chatSystemPrompt,
                { model: "analysis", maxOutputTokens: 2048, temperature: 0.7 }
            );

            if (response && response.trim()) {
                sendSSE(res, { type: "text", content: response.trim(), partial: false });
                console.log(`[chat] Non-streaming fallback: ${response.trim().length} chars`);
            } else {
                console.error("[chat] Non-streaming also returned empty");
                sendSSE(res, {
                    type: "text",
                    content: "👋 Hey there! I'm ready to help with your project. You can ask me to make changes to the design, colors, layout, or we can just chat about the project. What would you like to do?",
                    partial: false,
                });
            }
        } catch (fallbackErr) {
            console.error("[chat] Non-streaming fallback also failed:", (fallbackErr as Error).message);
            sendSSE(res, {
                type: "text",
                content: "👋 Hey! I'm here to help with your project. Try asking me to change colors, add sections, modify the layout, or ask any questions about the code!",
                partial: false,
            });
        }
    }
}

// ════════════════════════════════════════════════════
// CODE CHANGE HANDLER
// ════════════════════════════════════════════════════

async function handleCodeChange(
    res: Response,
    ai: GeminiClient,
    userPrompt: string,
    images: Array<{ data: string; mimeType: string }> | undefined,
    deps: ChatHandlerDeps,
    signal: AbortSignal
): Promise<void> {
    sendSSE(res, {
        type: "tool_start",
        tool: "code_edit",
        message: "Analyzing and modifying code...",
    });

    if (signal.aborted) return;

    try {
        console.log("[chat] Starting code change...");

        // Include conversation context in iteration prompt
        const conversationCtx = getConversationContext(deps.jobId);
        let enhancedPrompt = userPrompt;
        if (conversationCtx) {
            enhancedPrompt = `## Recent Conversation History\n${conversationCtx}\n\n## Current Request\n${userPrompt}`;
        }

        // We import the Code Generator engine to leverage the new multi-turn planning loop
        const { RemixCodeGenerator } = await import("./codegen/generator.js");
        const generator = new RemixCodeGenerator(deps.spec, deps.files);

        // Run the agentic loop, passing down a progress callback so the UI knows what phase we are in
        const newFiles = await generator.iterate(
            enhancedPrompt,
            (msg: string) => {
                sendSSE(res, {
                    type: "tool_start",
                    tool: "code_edit",
                    message: msg,
                });
            },
            images
        );

        if (signal.aborted) return;

        // Check which files were actually updated by comparing lengths/content (approximate)
        // generator.iterate modifies this.files directly.
        const originalMap = new Map(deps.files.map(f => [f.path, f.content]));
        const updates = newFiles.filter(f => originalMap.get(f.path) !== f.content);

        if (updates.length === 0) {
            console.warn("[chat] Code generation returned 0 file updates");
            sendSSE(res, {
                type: "tool_end",
                tool: "code_edit",
                summary: "No changes were generated. Try being more specific.",
                message: "No files modified",
            });
            sendSSE(res, {
                type: "text",
                content: "I wasn't able to generate specific changes for that request. Could you be more specific? For example:\n- \"Change the header background to dark blue\"\n- \"Add a footer with social media links\"\n- \"Make the hero section bigger with a gradient background\"",
                partial: false,
            });
            return;
        }

        // Detect packages from generated code
        const allCode = updates.map(f => f.content).join("\n");
        const detectedPackages = detectPackages(allCode);
        if (detectedPackages.length > 0) {
            console.log(`[chat] Detected packages: ${detectedPackages.join(", ")}`);
        }

        // Notify parent of file changes
        deps.onFilesUpdated(newFiles);

        // Build a human-readable summary
        const changedPaths = updates.map((f) => f.path);
        const summary = buildChangeSummary(changedPaths);

        // Send tool completion with detected packages
        sendSSE(res, {
            type: "tool_end",
            tool: "code_edit",
            files: newFiles,
            summary,
            message: `Modified ${updates.length} file(s)`,
            packages: detectedPackages.length > 0 ? detectedPackages : undefined,
        });

        // Track in conversation history
        addToConversation(deps.jobId, {
            role: "assistant",
            content: `Code change: ${summary}`,
            timestamp: Date.now(),
            editedFiles: changedPaths,
        });

        if (signal.aborted) return;

        // Stream a brief explanation of what changed
        console.log("[chat] Generating explanation...");
        const explainPrompt = `You just made the following changes to the "${deps.spec.brand.name}" website based on the user's request: "${userPrompt}"

Files changed: ${changedPaths.join(", ")}

Write a brief, friendly 1-3 sentence summary explaining what you changed and why. Use markdown. Be specific about the visual/functional changes, don't just list files.
CRITICAL RULE: DO NOT write any code blocks. DO NOT output file contents. ONLY output a natural language summary.`;

        try {
            const explainStream = ai.chatStream(
                explainPrompt,
                "You are a friendly frontend assistant. Write brief, clear summaries of code changes. CRITICAL: NEVER output code blocks or file contents. ONLY write conversational explanations.",
                { model: "analysis", maxOutputTokens: 512, temperature: 0.5 }
            );

            let fullText = "";
            let hasChunks = false;
            for await (const chunk of explainStream) {
                if (signal.aborted) break;
                fullText += chunk;
                hasChunks = true;
                sendSSE(res, { type: "text", content: fullText, partial: true });
            }

            if (!signal.aborted && hasChunks) {
                sendSSE(res, { type: "text", content: fullText, partial: false });
            } else if (!hasChunks && !signal.aborted) {
                // Fallback explanation
                const explainResponse = await ai.chat(
                    explainPrompt,
                    "You are a friendly frontend assistant. Write brief summaries. CRITICAL: NEVER output code blocks.",
                    { model: "analysis", maxOutputTokens: 512, temperature: 0.5 }
                );
                sendSSE(res, { type: "text", content: explainResponse.trim() || summary, partial: false });
            }
        } catch (explainErr) {
            console.warn("[chat] Explain stream failed:", (explainErr as Error).message);
            // Just use the summary as the explanation
            sendSSE(res, { type: "text", content: `✅ ${summary}`, partial: false });
        }
    } catch (err) {
        console.error("[chat] Code change failed:", (err as Error).message);
        sendSSE(res, {
            type: "error",
            error: `Code change failed: ${(err as Error).message}`,
        });
    }
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function buildChangeSummary(paths: string[]): string {
    if (paths.length === 0) return "No files changed.";
    if (paths.length === 1) return `Updated 1 file: \`${paths[0]}\``;
    if (paths.length <= 3) return `Updated ${paths.length} files: ${paths.map(p => `\`${p}\``).join(", ")}`;
    return `Updated ${paths.length} files: ${paths.slice(0, 3).map(p => `\`${p}\``).join(", ")} and ${paths.length - 3} more`;
}
