# Add Smart, YOLO & Chat Modes to Remix Studio

Building on the Kilocode reference patterns, add three execution modes to the existing **Remix Studio** chat interface and lay the groundwork for Skills/MCP/Tool Call extensibility.

---

## Feature Assessment — What We Can Include

Based on thorough analysis of the Kilocode reference code at `.explore/kilocode/packages/opencode/src/` and UIHarvest's current architecture:

| Feature | Source | Feasibility | Phase |
|---|---|---|---|
| **Smart Mode** (auto-edit, ask when needed) | Kilocode `question.tsx`, `permission.tsx`, intent classifier | ✅ Straightforward | **Now** |
| **YOLO Mode** (fully autonomous, no prompts) | Kilocode permission system bypass | ✅ Straightforward | **Now** |
| **Chat Mode** (pure conversation, no edits) | Already exists as `conversation` intent in `chat-handler.ts` | ✅ Already half-done | **Now** |
| **Plan Tool** (multi-file editing plan) | Kilocode `plan.ts`, `plan-enter.txt`, `plan-exit.txt` | ✅ Can adapt | **Now** |
| **Question Prompts** (inline Q&A in chat) | Kilocode `question.tsx` + `question.ts` tool | ✅ Can replicate in React | **Now** |
| **Tool Execution Cards** | Already in `RemixStudioView.tsx` | ✅ Already done | Done |
| **SSE Streaming** | Already in `chat-handler.ts` + frontend | ✅ Already done | Done |
| **WebContainer Preview** | Already in `RemixStudioView.tsx` | ✅ Already done | Done |
| **MCP Client** | Kilocode `mcp/index.ts` (938 lines) | ⚠️ Complex but possible | **Future** |
| **Skills System** | Kilocode `tool/skill.ts` + `skill/` | ⚠️ Needs SKILL.md convention | **Future** |
| **Web Search / Fetch** | Kilocode `websearch.ts`, `webfetch.ts` | ⚠️ Needs search API key | **Future** |
| **Sub-agent Tasks** | Kilocode `task.ts` (multi-agent) | ⚠️ Heavy lift, needs session rework | **Future** |
| **Code Search / Grep** | Kilocode `codesearch.ts`, `grep.ts` | ⚠️ File-system scoped, not web-based | **Future** |

> [!IMPORTANT]
> **This plan focuses on the 3 modes + plan tool for now.** Skills/MCP/Tools are noted as a future phase since they require more architectural decisions (API keys, MCP server configs, etc.).

---

## Proposed Changes

### Shared Types

#### [NEW] [types.ts](file:///Users/mahy/Desktop/work/opensource/UIHarvest/src/remix/types.ts) — extend existing

Add mode type and question event types to the existing types file:
- `StudioMode = "smart" | "yolo" | "chat"`
- `ChatEventType` extended with `"question"` event (for inline prompts)
- Question/answer interfaces (adapted from Kilocode's `QuestionRequest`/`QuestionAnswer`)

---

### Backend — Mode-Aware Chat Handler

#### [MODIFY] [chat-handler.ts](file:///Users/mahy/Desktop/work/opensource/UIHarvest/src/remix/chat-handler.ts)

1. **Accept `mode` parameter** in `handleChatMessage()` deps
2. **Smart mode** (default): 
   - Keep intent classification
   - For `code_change` intent: generate edit plan → auto-apply → stream SSE events
   - If AI is uncertain, emit a `question` SSE event for inline user input
   - Adapted from Kilocode's `question.ts` tool + `plan.ts` plan_exit pattern
3. **YOLO mode**: 
   - Skip intent classification entirely → always treat as `code_change`
   - Never emit `question` events
   - Auto-apply all edits without confirmation
   - No permission checks (adapted from Kilocode's permission bypass)
4. **Chat mode**: 
   - Skip intent classification → always treat as `conversation`
   - Never emit `tool_start`/`tool_end` events
   - Pure conversational responses only

#### [MODIFY] [server.ts](file:///Users/mahy/Desktop/work/opensource/UIHarvest/src/server.ts)

- Chat endpoint reads `mode` from request body (`req.body.mode`)
- Passes mode through to `handleChatMessage` deps
- Stores mode per job in remix manager state

#### [MODIFY] [remix-manager.ts](file:///Users/mahy/Desktop/work/opensource/UIHarvest/src/remix/remix-manager.ts)

- Per-job mode state: `mode: StudioMode` stored alongside existing job state
- Mode can be changed mid-session via new endpoint

---

### Frontend — Mode Selector & Mode-Specific UI

#### [MODIFY] [RemixStudioView.tsx](file:///Users/mahy/Desktop/work/opensource/UIHarvest/web/src/views/RemixStudioView.tsx)

1. **Mode selector** in the header bar:
   - Dropdown/segmented control: Smart ⚡ | YOLO 🚀 | Chat 💬
   - Stored in component state + sent with every chat request
   - Mode persisted per job in localStorage
2. **Smart mode UI**:
   - Inline question prompts rendered in chat when `question` SSE event arrives
   - Adapted from Kilocode's `question.tsx` → React: radio/checkbox options + custom text input
   - User answers sent back via POST to resume the AI
3. **YOLO mode UI**: 
   - Status-only view: progress spinners, tool cards, no input interruptions
   - Toast notification when task completes
   - Visual indicator (pulsing border/badge) to show autonomous operation
4. **Chat mode UI**: 
   - Clean conversation view: no tool execution cards, no code panel
   - Simplified layout (chat takes full width or hides right panel)
   - Context-aware suggestions adapt to chat-only topics

---

## Verification Plan

### Automated Tests

**Existing tests** in `src/remix/__tests__/`:
- `spec-generator.test.ts`
- `brand-extractor.test.ts`
- `parser.test.ts`
- `principles-extractor.test.ts`

These don't cover `chat-handler.ts` directly. I'll focus on ensuring they still pass:

```bash
cd /Users/mahy/Desktop/work/opensource/UIHarvest && npx tsc --noEmit
```

### TypeScript + Lint

```bash
cd /Users/mahy/Desktop/work/opensource/UIHarvest && npx tsc --noEmit
```

### Manual Verification

1. **Start the dev server**: `bun run dev` (or `npm run dev`)
2. **Open Remix Studio** from the dashboard → create a new remix
3. **Test mode switching**: Click the mode selector and verify:
   - **Smart Mode**: Send "Add a hero section" → should see tool cards, file edits auto-applied, question prompt if AI is uncertain
   - **YOLO Mode**: Send "Rebuild the entire page" → should run end-to-end without any prompts, shows progress only
   - **Chat Mode**: Send "What colors are you using?" → should get pure text response, no tool cards

> [!NOTE]
> Since this is a web UI feature, I'd recommend you do the manual testing in browser after I implement. The automated verification will cover TypeScript compilation. Would you like me to suggest any specific test scenarios for MCP/Skills for the future phase?
