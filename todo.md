# UIHarvest — Monorepo Refactoring & Architecture Plan

## Clarified Requirements

1. **Turborepo monorepo** with `apps/` and `packages/`
2. **THREE separate apps** — scraper, AI Studio server, AI Studio web
3. **Scraper app** — self-contained: Playwright extraction, design memory, remix pipeline (brand → principles → spec → initial codegen), explorer web UI, dashboard, landing/progress views. Has its OWN bundled frontend served from the scraper server root. Deploys as ONE Docker image (Playwright + Chromium + Express + web bundle).
4. **AI Studio server** — the Lovable-clone autonomous AI backend. Chat handler, Vercel AI SDK (`streamText`), tool system for iterative code editing. Lightweight Express server, no Playwright.
5. **AI Studio web** — the Lovable-clone frontend. assistant-ui (`@assistant-ui/react`), WebContainer live preview, Monaco editor, terminal. Served separately (Vite dev server or static deploy).
6. **Auth is shared** — extract into `packages/auth` so both the scraper and AI Studio server use the same cookie-based session middleware.
7. **assistant-ui for chat interface** — Replace hand-rolled SSE with `@assistant-ui/react` + `@assistant-ui/react-ai-sdk`
8. **Vercel AI SDK on AI Studio backend** — Replace custom `GeminiClient` (for chat only) with `streamText` from `ai` + `@ai-sdk/google`
9. **Fix deployment cache bug** — Old UI showing on GCR after deploy
10. **Fix AI file editing** — AI-generated edits not applying in WebContainer

---

## Target Architecture

```
uiharvest/
├── turbo.json
├── package.json                     # Workspace root (private)
├── tsconfig.base.json
│
├── apps/
│   ├── scraper/                     # Scraper product (self-contained)
│   │   ├── package.json             # playwright, express, @google/genai, sharp, etc.
│   │   ├── Dockerfile               # Playwright + Chromium + Express + bundled web
│   │   ├── deploy.sh
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts             # Express server entry
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts          # Uses @uiharvest/auth
│   │   │   │   ├── extract.ts       # /api/extract/* endpoints
│   │   │   │   ├── remix.ts         # /api/remix (create), /api/remix/:id/progress, /files, /iterate
│   │   │   │   └── jobs.ts          # /api/jobs (dashboard listing)
│   │   │   ├── extract/             # Scraper pipeline (unchanged logic)
│   │   │   │   ├── extract-pipeline.ts
│   │   │   │   ├── extractor.ts
│   │   │   │   ├── agent-driver.ts
│   │   │   │   ├── vision-loop.ts
│   │   │   │   ├── job-manager.ts
│   │   │   │   └── zip-builder.ts
│   │   │   ├── memory/              # Design memory pipeline (unchanged logic)
│   │   │   │   ├── generator.ts
│   │   │   │   ├── ir/
│   │   │   │   ├── analyze/
│   │   │   │   ├── interpret/
│   │   │   │   └── render/
│   │   │   ├── remix/               # Remix pipeline (initial codegen from reference URL)
│   │   │   │   ├── remix-manager.ts
│   │   │   │   ├── brand-extractor.ts
│   │   │   │   ├── principles-extractor.ts
│   │   │   │   ├── spec-generator.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── codegen/
│   │   │   │       ├── generator.ts
│   │   │   │       ├── scaffold.ts
│   │   │   │       ├── parser.ts
│   │   │   │       ├── validator.ts
│   │   │   │       └── system-prompt.ts
│   │   │   ├── store/
│   │   │   │   └── job-store.ts     # Firestore persistence
│   │   │   └── gemini-client.ts     # Kept for scraper + remix codegen
│   │   └── web/                     # Scraper's own frontend (bundled into dist/)
│   │       ├── package.json
│   │       ├── vite.config.ts
│   │       └── src/
│   │           ├── App.tsx          # Dashboard + Landing + Progress + Explorer views
│   │           ├── main.tsx
│   │           ├── index.css
│   │           ├── views/
│   │           │   ├── DashboardView.tsx
│   │           │   ├── LandingView.tsx
│   │           │   ├── ProgressView.tsx
│   │           │   ├── PageSelectorView.tsx
│   │           │   ├── PasswordView.tsx
│   │           │   ├── RemixLandingView.tsx   # "Start remix" form (calls scraper /api/remix)
│   │           │   ├── OverviewView.tsx
│   │           │   ├── ColorsView.tsx
│   │           │   ├── TypographyView.tsx
│   │           │   ├── SpacingView.tsx
│   │           │   ├── RadiiView.tsx
│   │           │   ├── ShadowsView.tsx
│   │           │   ├── SvgsView.tsx
│   │           │   ├── ImagesView.tsx
│   │           │   ├── ComponentsView.tsx
│   │           │   ├── SectionsView.tsx
│   │           │   ├── PatternsView.tsx
│   │           │   ├── TreeView.tsx
│   │           │   ├── MemoryView.tsx
│   │           │   └── ExtraViews.tsx
│   │           ├── components/
│   │           │   ├── Sidebar.tsx
│   │           │   ├── CodeEditor.tsx
│   │           │   ├── ui/          # shadcn components
│   │           │   ├── dialogs/
│   │           │   └── ...
│   │           ├── lib/
│   │           │   ├── helpers.ts
│   │           │   ├── utils.ts
│   │           │   └── output-base.tsx
│   │           └── types/
│   │               └── design-system.ts
│   │
│   ├── server/                      # AI Studio backend (Lovable-clone)
│   │   ├── package.json             # ai, @ai-sdk/google, express, zod
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             # Express server entry
│   │       ├── routes/
│   │       │   ├── auth.ts          # Uses @uiharvest/auth
│   │       │   └── chat.ts          # POST /api/chat/:id — Vercel AI SDK streamText
│   │       └── chat/
│   │           ├── chat-handler.ts  # Rewritten: streamText + tools + toUIMessageStreamResponse()
│   │           └── tools/
│   │               └── code-edit.ts # Vercel AI SDK tool definition
│   │
│   └── web/                         # AI Studio frontend (Lovable-clone UI)
│       ├── package.json             # @assistant-ui/react, @assistant-ui/react-ai-sdk, @webcontainer/api
│       ├── vite.config.ts
│       ├── components.json          # shadcn/ui config
│       └── src/
│           ├── App.tsx              # Just the studio — no scraper views
│           ├── main.tsx
│           ├── index.css
│           ├── views/
│           │   └── RemixStudioView.tsx   # assistant-ui Thread + WebContainer workspace
│           ├── components/
│           │   ├── ui/              # shadcn components
│           │   ├── assistant-ui/    # Thread, ThreadList from assistant-ui
│           │   └── studio/
│           │       ├── StudioWorkspace.tsx
│           │       ├── StudioHeader.tsx
│           │       ├── MarkdownContent.tsx
│           │       ├── ToolExecutionCard.tsx  # → makeAssistantToolUI
│           │       └── WelcomeHero.tsx
│           ├── hooks/
│           │   └── studio/
│           │       └── useWebContainer.ts
│           ├── lib/
│           │   ├── webcontainer.ts
│           │   └── snapshot-cache.ts
│           └── types/
│               └── studio.ts
│
├── packages/
│   ├── auth/                        # @uiharvest/auth
│   │   ├── package.json             # cookie-parser
│   │   └── src/
│   │       └── index.ts             # authMiddleware, generateSessionToken, isValidSession
│   │
│   ├── types/                       # @uiharvest/types
│   │   ├── package.json             # Pure types, no runtime deps
│   │   └── src/
│   │       ├── index.ts
│   │       ├── remix.ts             # RemixSpec, GeneratedFile, RemixProgressEvent, BrandIdentity, etc.
│   │       ├── extract.ts           # ProgressEvent, ExtractionResult
│   │       └── studio.ts            # ChatEvent, ChatMessage, ToolExecution, RightPanel, ViewportSize
│   │
│   ├── db/                          # @uiharvest/db
│   │   ├── package.json             # @google-cloud/firestore
│   │   └── src/
│   │       ├── index.ts
│   │       ├── job-store.ts         # Firestore job persistence
│   │       └── conversation-store.ts
│   │
│   └── ai/                          # @uiharvest/ai (Vercel AI SDK wrapper)
│       ├── package.json             # ai, @ai-sdk/google
│       └── src/
│           ├── index.ts
│           ├── provider.ts          # Google AI provider setup
│           ├── tools/
│           │   └── code-edit.ts     # codeEdit tool definition
│           └── prompts/
│               ├── chat.ts
│               └── intent.ts
│
└── tooling/
    └── tsconfig/
        ├── base.json
        ├── react.json
        └── node.json
```

### Key Architectural Decisions

**3 apps, not 2:**
- `apps/scraper` — the scraper product. Self-contained service with its own bundled frontend. Contains extraction pipeline, design memory, remix/codegen pipeline, explorer views, dashboard. Deploys as a single Docker image with Playwright + Chromium. The scraper's web UI is built with Vite and served via `express.static` from the scraper server root endpoint.
- `apps/server` — the AI Studio backend. Lightweight Express server for the chat-based iterative coding experience. Uses Vercel AI SDK (`streamText`, tools). NO Playwright, no scraper code.
- `apps/web` — the AI Studio frontend. React + Vite + assistant-ui + WebContainer. The Lovable-clone coding interface.

**Why the remix pipeline belongs to the scraper:**
The remix pipeline (brand extraction → principles → spec → initial codegen) depends on the scraper because it runs `runExtraction()` to crawl the reference URL, then `runAnalyzeStage()` and `runInterpretStage()` from the design memory system. It's tightly coupled to the scraper's Playwright + Gemini infrastructure. The AI Studio only takes over AFTER the initial code is generated — for the chat-based iterative editing.

**The handoff between scraper and AI Studio:**
1. User enters a reference URL in the scraper dashboard
2. Scraper runs extraction → memory → remix pipeline → generates initial code files
3. Scraper persists the job + files to Firestore
4. User opens the AI Studio (separate app) with the job ID
5. AI Studio hydrates the job from Firestore and provides the chat-based editing experience

**Auth is shared:**
Both the scraper server and AI Studio server use the same cookie-based HMAC session auth. Extracted into `packages/auth` so both can `import { authMiddleware } from "@uiharvest/auth"`.

---

## Phase 0: Fix Critical Bugs (Before Any Refactoring)

### 0.1 — Fix Deployment Cache Bug

**Problem**: After deploying to GCR, old web UI still shows at the live URL.

**Root Causes**:
1. `express.static(webDistDir)` uses default headers — no `Cache-Control` on `index.html`
2. `gcloud run deploy --source .` may cache Docker build layers
3. Browsers cache `index.html` with no revalidation directive

**Fix** (in `src/server.ts`):
```typescript
// Before express.static, add cache headers:
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/index.html" || !req.path.includes(".")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  } else if (req.path.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|ico)$/)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  next();
});

app.use(express.static(webDistDir));
```

**Fix** (in `deploy.sh`): Add `--no-cache` to force fresh Docker build.

**Fix** (in `Dockerfile`): Add cache-busting `ARG CACHEBUST=1`.

### 0.2 — Fix AI File Editing in WebContainer

**Problem**: AI-generated code edits don't always apply in WebContainer.

**Root Cause**: `writeFiles()` in `webcontainer.ts` may fail silently if parent directories don't exist or the container isn't ready.

**Fix** (in `web/src/lib/webcontainer.ts`):
- Add `updateFiles()` that ensures parent dirs exist via `mkdir -p`
- Write each file individually with error handling
- Return success/failure per file

**Fix** (in `web/src/hooks/studio/useRemixChat.ts`):
- Use `updateFiles()` instead of `writeFiles()` in the `tool_end` handler
- Add retry mechanism for when container isn't ready

### 0.3 — Fix Test Infrastructure

- Add `vitest.config.ts` pointing to `src/remix/__tests__/`
- Add test scripts to `package.json`
- Verify existing tests pass

---

## Phase 1: Initialize Turborepo + Create Package Structure

### 1.1 — Install Turborepo
```bash
bun add -D turbo
```

### 1.2 — Create `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": { "dependsOn": ["^build"] }
  }
}
```

### 1.3 — Configure Workspaces
Root `package.json`:
```json
{
  "private": true,
  "workspaces": ["apps/*", "apps/scraper/web", "packages/*", "tooling/*"],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

### 1.4 — Create Shared tsconfig
```
tooling/tsconfig/base.json    — strict, ESNext, bundler resolution
tooling/tsconfig/react.json   — extends base, jsx: react-jsx
tooling/tsconfig/node.json    — extends base, types: ["bun-types"]
```

### 1.5 — Create `packages/auth`

Extract from `src/server.ts` lines 158-196:

```typescript
// packages/auth/src/index.ts
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SESSION_COOKIE = "uih_session";

export function createAuth(opts: {
  sitePassword?: string;
  sessionSecret?: string;
}) {
  const SITE_PASSWORD = opts.sitePassword || "";
  const SESSION_SECRET =
    opts.sessionSecret || crypto.randomBytes(32).toString("hex");

  function generateSessionToken(): string {
    return crypto
      .createHmac("sha256", SESSION_SECRET)
      .update("authenticated")
      .digest("hex");
  }

  function isValidSession(token: string): boolean {
    return token === generateSessionToken();
  }

  function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!SITE_PASSWORD) {
      next();
      return;
    }
    const token = req.cookies?.[SESSION_COOKIE];
    if (token && isValidSession(token)) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  }

  function handleLogin(req: Request, res: Response): void {
    if (!SITE_PASSWORD) {
      res.json({ success: true });
      return;
    }
    const { password } = req.body;
    if (password === SITE_PASSWORD) {
      const token = generateSessionToken();
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  }

  function handleLogout(_req: Request, res: Response): void {
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  }

  function handleStatus(req: Request, res: Response): void {
    res.json({
      requiresPassword: !!SITE_PASSWORD,
      authenticated:
        !SITE_PASSWORD || isValidSession(req.cookies?.[SESSION_COOKIE] || ""),
    });
  }

  return {
    authMiddleware,
    handleLogin,
    handleLogout,
    handleStatus,
    generateSessionToken,
    isValidSession,
  };
}
```

### 1.6 — Create `packages/types`

Consolidate duplicated types from 3 locations:

| Current Location | Types | Target |
|---|---|---|
| `src/remix/types.ts` | `RemixSpec`, `GeneratedFile`, `RemixProgressEvent`, `BrandIdentity`, `DesignPrinciples`, `RemixJob`, `RemixResult`, `RemixPhase` | `packages/types/src/remix.ts` |
| `web/src/types/studio.ts` | `GeneratedFile`, `ChatEvent`, `ChatMessage`, `ToolExecution`, `RightPanel`, `ViewportSize` | `packages/types/src/studio.ts` |
| `web/src/lib/webcontainer.ts` | `GeneratedFile` (duplicated inline) | Remove — import from `@uiharvest/types` |
| `src/extract-pipeline.ts` | `ProgressEvent`, `ExtractOptions` | `packages/types/src/extract.ts` |

**`GeneratedFile`** is defined in 3 places — unified into `packages/types/src/remix.ts`.

### 1.7 — Create `packages/db`

Extract from:
- `src/store/job-store.ts` → `packages/db/src/job-store.ts`
- Firestore conversation persistence from `src/remix/chat-handler.ts` → `packages/db/src/conversation-store.ts`

### 1.8 — Create `packages/ai` (Vercel AI SDK wrapper)

New package wrapping Vercel AI SDK for the AI Studio:

```typescript
// packages/ai/src/provider.ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createProvider() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
  });
}

export function getModel(purpose: "chat" | "codegen" | "intent") {
  const provider = createProvider();
  const modelMap = {
    chat: process.env.GEMINI_MODEL_CHAT || "gemini-2.5-pro-preview-06-05",
    codegen: process.env.GEMINI_MODEL_CODEGEN || "gemini-2.5-pro-preview-06-05",
    intent: process.env.GEMINI_MODEL_INTENT || "gemini-2.0-flash",
  };
  return provider(modelMap[purpose]);
}
```

```typescript
// packages/ai/src/tools/code-edit.ts
import { tool } from "ai";
import { z } from "zod";

export const codeEditTool = tool({
  description: "Edit one or more code files. Use when the user asks to create, modify, or fix code.",
  parameters: z.object({
    files: z.array(z.object({
      path: z.string().describe("File path relative to project root"),
      content: z.string().describe("Complete updated file content"),
    })),
    summary: z.string().describe("Human-readable summary of changes"),
    packages: z.array(z.string()).optional().describe("npm packages to install"),
  }),
});
```

---

## Phase 2: Move Code into Apps

### 2.1 — `apps/scraper` (Server + Backend)

Move all scraper-related source files:

| Current | Target | Action |
|---|---|---|
| `src/server.ts` | `apps/scraper/src/index.ts` + `routes/*.ts` | Split into route modules |
| `src/serve.ts` | `apps/scraper/src/entry.ts` | Rename |
| `src/gemini-client.ts` | `apps/scraper/src/gemini-client.ts` | Move (kept for scraper) |
| `src/extract-pipeline.ts` | `apps/scraper/src/extract/extract-pipeline.ts` | Move (unchanged) |
| `src/extractor.ts` | `apps/scraper/src/extract/extractor.ts` | Move (unchanged) |
| `src/agent-driver.ts` | `apps/scraper/src/extract/agent-driver.ts` | Move (unchanged) |
| `src/vision-loop.ts` | `apps/scraper/src/extract/vision-loop.ts` | Move (unchanged) |
| `src/job-manager.ts` | `apps/scraper/src/extract/job-manager.ts` | Move (unchanged) |
| `src/zip-builder.ts` | `apps/scraper/src/extract/zip-builder.ts` | Move (unchanged) |
| `src/memory/*` | `apps/scraper/src/memory/*` | Move (unchanged) |
| `src/remix/remix-manager.ts` | `apps/scraper/src/remix/remix-manager.ts` | Move |
| `src/remix/brand-extractor.ts` | `apps/scraper/src/remix/brand-extractor.ts` | Move (unchanged) |
| `src/remix/principles-extractor.ts` | `apps/scraper/src/remix/principles-extractor.ts` | Move (unchanged) |
| `src/remix/spec-generator.ts` | `apps/scraper/src/remix/spec-generator.ts` | Move (unchanged) |
| `src/remix/types.ts` | `apps/scraper/src/remix/types.ts` | Move (re-export from `@uiharvest/types`) |
| `src/remix/codegen/*` | `apps/scraper/src/remix/codegen/*` | Move (unchanged) |
| `src/store/job-store.ts` | Uses `@uiharvest/db` | Import from package |
| `src/main.ts` | `apps/scraper/src/main.ts` | Move (CLI entry) |
| `Dockerfile` | `apps/scraper/Dockerfile` | Move |
| `deploy.sh` | `apps/scraper/deploy.sh` | Move |

Split `server.ts` (805 lines) into route modules:
- `apps/scraper/src/routes/auth.ts` — login/logout/status (uses `@uiharvest/auth`)
- `apps/scraper/src/routes/extract.ts` — all `/api/extract/*` endpoints
- `apps/scraper/src/routes/remix.ts` — `/api/remix` create, progress, files, iterate, status
- `apps/scraper/src/routes/jobs.ts` — dashboard job listing + delete
- `apps/scraper/src/routes/legacy.ts` — CLI backward-compat endpoints

**Note**: The scraper server does NOT include the chat endpoint (`POST /api/remix/:id/chat`). That moves to the AI Studio server.

### 2.2 — `apps/scraper/web` (Scraper Frontend)

Move the scraper-related frontend:

| Current | Target | Action |
|---|---|---|
| `web/src/App.tsx` | `apps/scraper/web/src/App.tsx` | Keep (remove RemixStudioView import + mode) |
| `web/src/main.tsx` | `apps/scraper/web/src/main.tsx` | Move |
| `web/src/index.css` | `apps/scraper/web/src/index.css` | Move |
| `web/src/views/DashboardView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/LandingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ProgressView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PageSelectorView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PasswordView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/RemixLandingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/OverviewView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ColorsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/TypographyView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SpacingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/RadiiView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ShadowsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SvgsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ImagesView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ComponentsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SectionsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PatternsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/TreeView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/MemoryView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ExtraViews.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/components/Sidebar.tsx` | `apps/scraper/web/src/components/` | Move |
| `web/src/components/CodeEditor.tsx` | `apps/scraper/web/src/components/` | Move |
| `web/src/components/ui/*` | `apps/scraper/web/src/components/ui/` | Copy (shared shadcn) |
| `web/src/components/dialogs/*` | `apps/scraper/web/src/components/dialogs/` | Move |
| `web/src/components/shared/*` | `apps/scraper/web/src/components/shared/` | Move |
| `web/src/lib/helpers.ts` | `apps/scraper/web/src/lib/` | Move |
| `web/src/lib/utils.ts` | `apps/scraper/web/src/lib/` | Move |
| `web/src/lib/output-base.tsx` | `apps/scraper/web/src/lib/` | Move |
| `web/src/types/design-system.ts` | `apps/scraper/web/src/types/` | Move |
| `web/vite.config.ts` | `apps/scraper/web/vite.config.ts` | Move |
| `web/package.json` | `apps/scraper/web/package.json` | Move (trimmed — no WebContainer, no assistant-ui) |
| `web/components.json` | `apps/scraper/web/components.json` | Move |
| `web/tsconfig*.json` | `apps/scraper/web/tsconfig*.json` | Move |
| `web/tailwind.config.ts` | `apps/scraper/web/tailwind.config.ts` | Move |

**Modifications to scraper's App.tsx:**
- Remove `RemixStudioView` import and `"remix-studio"` mode
- When the user creates a remix job, the DashboardView navigates to an external URL (the AI Studio app) with the job ID as a query param
- Keep all other modes: `checking`, `password`, `dashboard`, `landing`, `page-selection`, `progress`, `explorer`, `remix-landing`

### 2.3 — `apps/web` (AI Studio Frontend)

Move AI studio-specific frontend files:

| Current | Target | Action |
|---|---|---|
| `web/src/views/RemixStudioView.tsx` | `apps/web/src/views/RemixStudioView.tsx` | Move + **REWRITE** with assistant-ui |
| `web/src/hooks/studio/useRemixChat.ts` | **DELETE** | Replaced by `useChatRuntime` |
| `web/src/hooks/studio/useWebContainer.ts` | `apps/web/src/hooks/studio/useWebContainer.ts` | Move |
| `web/src/lib/webcontainer.ts` | `apps/web/src/lib/webcontainer.ts` | Move |
| `web/src/lib/snapshot-cache.ts` | `apps/web/src/lib/snapshot-cache.ts` | Move |
| `web/src/components/studio/StudioWorkspace.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/StudioHeader.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/MarkdownContent.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/ToolExecutionCard.tsx` | `apps/web/src/components/studio/` | Keep + adapt to `makeAssistantToolUI` |
| `web/src/components/studio/WelcomeHero.tsx` | `apps/web/src/components/studio/` | Keep (used as Thread.Welcome) |
| `web/src/components/studio/StudioChatPanel.tsx` | **DELETE** | Replaced by assistant-ui Thread |
| `web/src/components/studio/ChatMessageBubble.tsx` | **DELETE** | Replaced by assistant-ui |
| `web/src/components/studio/ThinkingIndicator.tsx` | **DELETE** | Built into assistant-ui |
| `web/src/components/studio/StudioInputArea.tsx` | **DELETE** | Replaced by assistant-ui Composer |
| `web/src/components/ui/*` | `apps/web/src/components/ui/` | Copy (shared shadcn) |
| `web/src/types/studio.ts` | `apps/web/src/types/` | Move (imports from `@uiharvest/types`) |
| `scripts/generate-base-snapshot.ts` | `apps/web/scripts/generate-base-snapshot.ts` | Move |

**New files for AI Studio frontend:**
- `apps/web/src/components/assistant-ui/thread.tsx` — installed via `npx shadcn@latest add https://r.assistant-ui.com/thread`
- `apps/web/src/components/studio/CodeEditToolUI.tsx` — `makeAssistantToolUI` for codeEdit tool

### 2.4 — `apps/server` (AI Studio Backend)

Move only the chat-related backend code:

| Current | Target | Action |
|---|---|---|
| `src/remix/chat-handler.ts` | `apps/server/src/chat/chat-handler.ts` | **REWRITE** with Vercel AI SDK |
| (new) | `apps/server/src/index.ts` | New Express server |
| (new) | `apps/server/src/routes/auth.ts` | Uses `@uiharvest/auth` |
| (new) | `apps/server/src/routes/chat.ts` | `POST /api/chat/:id` endpoint |
| (new) | `apps/server/src/chat/tools/code-edit.ts` | Uses `@uiharvest/ai` tool |

The AI Studio server is minimal — it:
1. Accepts chat messages from the AI Studio frontend
2. Hydrates job context from Firestore (`@uiharvest/db`)
3. Runs `streamText` with the `codeEdit` tool
4. Returns a `UIMessageStream` that assistant-ui parses natively
5. Persists updated files back to Firestore

### 2.5 — Scraper Dockerfile (Single Image)

```dockerfile
# Stage 1: Generate WebContainer snapshot (for AI Studio, optional)
FROM oven/bun:1 AS snapshot-builder
...

# Stage 2: Build scraper web frontend
FROM oven/bun:1 AS web-build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build --filter=@uiharvest/scraper-web
# Output: apps/scraper/web/dist/

# Stage 3: Runtime (Playwright + scraper server + static web)
FROM oven/bun:1
RUN apt-get update && apt-get install -y ... # Playwright deps
WORKDIR /app
COPY --from=web-build /app .
RUN bun install --frozen-lockfile --production
RUN bunx playwright install chromium
CMD ["bun", "run", "apps/scraper/src/index.ts"]
```

---

## Phase 3: assistant-ui + Vercel AI SDK Integration

### 3.1 — Install Dependencies (AI Studio Frontend)

```bash
cd apps/web
npx shadcn@latest add https://r.assistant-ui.com/thread
bun add @assistant-ui/react @assistant-ui/react-ai-sdk
```

### 3.2 — Rewrite Chat Endpoint with Vercel AI SDK (AI Studio Server)

**Current** (`src/remix/chat-handler.ts`):
- Manual SSE with `res.write("data: ...")`
- Custom `GeminiClient` wrapper for Gemini calls
- Custom event types: `thinking`, `text`, `tool_start`, `tool_end`, `done`, `error`

**Target** — Vercel AI SDK `streamText` + tool system:

```typescript
// apps/server/src/routes/chat.ts
import { streamText, tool } from "ai";
import { getModel } from "@uiharvest/ai";
import { codeEditTool } from "@uiharvest/ai/tools/code-edit";
import { jobStore } from "@uiharvest/db";
import { z } from "zod";

app.post("/api/chat/:id", authMiddleware, async (req, res) => {
  const { messages, mode } = req.body;
  const job = await jobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const result = streamText({
    model: getModel("codegen"),
    system: buildSystemPrompt(job.spec, job.files, mode),
    messages,
    tools: {
      codeEdit: {
        ...codeEditTool,
        execute: async ({ files, summary, packages }) => {
          // Persist files to Firestore
          await jobStore.updateFiles(job.id, files);
          return { filesChanged: files.length, summary, packages };
        },
      },
    },
    maxSteps: mode === "yolo" ? 10 : mode === "smart" ? 1 : 0,
  });

  return result.toUIMessageStreamResponse();
});
```

### 3.3 — Replace Chat UI with assistant-ui (AI Studio Frontend)

**New `RemixStudioView.tsx`:**

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import { CodeEditToolUI } from "@/components/studio/CodeEditToolUI";

export function RemixStudioView({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [containerReady, setContainerReady] = useState(false);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${AI_STUDIO_SERVER_URL}/api/chat/${jobId}`,
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh w-full flex-col">
        <StudioHeader ... />
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[420px] shrink-0 border-r">
            <Thread />
          </div>
          <CodeEditToolUI
            onFilesUpdated={(files) => {
              setFiles(files);
              if (containerReady) updateWebContainerFiles(files);
            }}
          />
          <StudioWorkspace ... />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
```

**New `CodeEditToolUI.tsx`:**

```tsx
import { makeAssistantToolUI } from "@assistant-ui/react";

export const CodeEditToolUI = makeAssistantToolUI<
  { files: GeneratedFile[]; summary: string; packages?: string[] },
  { filesChanged: number; summary: string; packages?: string[] }
>({
  toolName: "codeEdit",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <ToolExecutionCard exec={{ tool: "code_edit", status: "running", message: "Editing code..." }} />;
    }
    if (result) {
      return (
        <ToolExecutionCard exec={{
          tool: "code_edit",
          status: "complete",
          message: `Modified ${result.filesChanged} files`,
          summary: result.summary,
        }} />
      );
    }
    return null;
  },
});
```

### 3.4 — WebContainer File Sync via Tool Callbacks

When `codeEdit` tool executes, assistant-ui renders the `CodeEditToolUI`. The frontend intercepts tool results and writes to WebContainer:

```tsx
useEffect(() => {
  if (result?.files) {
    updateWebContainerFiles(result.files);
  }
  if (result?.packages?.length) {
    installPackages(result.packages);
  }
}, [result]);
```

### 3.5 — Mode Selector (Chat / Smart / YOLO)

Mode controls `maxSteps` on the backend:
- **Chat mode**: `maxSteps: 0` (no tools)
- **Smart mode**: `maxSteps: 1` (ask before multi-step)
- **YOLO mode**: `maxSteps: 10` (fully autonomous)

```tsx
const transport = new AssistantChatTransport({
  api: `${AI_STUDIO_SERVER_URL}/api/chat/${jobId}`,
  body: { mode: selectedMode },
});
```

### 3.6 — Image Attachments

```tsx
const runtime = useChatRuntime({
  transport: new AssistantChatTransport({
    api: `${AI_STUDIO_SERVER_URL}/api/chat/${jobId}`,
  }),
  adapters: {
    attachments: { accept: "image/*", maxCount: 5 },
  },
});
```

---

## Phase 4: Full Vercel AI SDK Migration (AI Studio Only)

### 4.1 — Replace GeminiClient in Chat Handler

The custom `GeminiClient` (`src/gemini-client.ts`) is only removed from the AI Studio. The scraper keeps it.

| Current Pattern | New Pattern (AI Studio) |
|---|---|
| `new GeminiClient()` | `getModel("codegen")` from `@uiharvest/ai` |
| `ai.chatStream(prompt, system, opts)` | `streamText({ model, system, messages })` |
| `ai.chatStreamWithImages(prompt, images, system)` | `streamText({ model, messages: [{ role: "user", content: [{ type: "text", text }, { type: "image", image }] }] })` |
| `ai.chatJson(prompt, system, opts)` | `generateObject({ model, schema, prompt })` |
| Custom SSE events | `result.toUIMessageStreamResponse()` |

### 4.2 — Intent Classification with Vercel AI SDK

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const intentSchema = z.object({
  intent: z.enum(["conversation", "code_change"]),
});

async function classifyIntent(message: string) {
  const { object } = await generateObject({
    model: getModel("intent"),
    schema: intentSchema,
    system: INTENT_SYSTEM_PROMPT,
    prompt: message,
  });
  return object.intent;
}
```

### 4.3 — Codegen via Tool System

Instead of manually calling `RemixCodeGenerator.iterate()`, use the Vercel AI SDK tool system:

```typescript
const result = streamText({
  model: getModel("codegen"),
  system: buildCodegenSystemPrompt(spec, files),
  messages: conversationHistory,
  tools: { codeEdit: codeEditTool },
  maxSteps: 5,
  onStepFinish: async ({ toolCalls }) => {
    for (const call of toolCalls) {
      if (call.toolName === "codeEdit") {
        await jobStore.updateFiles(jobId, call.args.files);
      }
    }
  },
});

return result.toUIMessageStreamResponse();
```

---

## Phase 5: Future Features

### 5.1 — Human-in-the-Loop (Smart Mode)

assistant-ui supports tool interrupts:
```typescript
codeEdit: tool({
  execute: async (args, { human }) => {
    if (mode === "smart") {
      const approval = await human({ action: "Apply code changes", summary: args.summary });
      if (!approval.approved) return { cancelled: true };
    }
    return applyChanges(args);
  },
});
```

### 5.2 — MCP Client
- Add `packages/mcp/` for Model Context Protocol
- Use `@modelcontextprotocol/sdk`

### 5.3 — Skills System
- Add `packages/skills/` for SKILL.md convention

---

## Execution Order

| Step | What | Effort | Blocks |
|------|------|--------|--------|
| **0.1** | Fix deployment cache (headers + deploy.sh) | 30 min | — |
| **0.2** | Fix WebContainer file editing | 2 hrs | — |
| **0.3** | Fix test infrastructure | 30 min | — |
| **1.1-1.4** | Initialize Turborepo + workspaces + tsconfig | 2 hrs | — |
| **1.5** | Extract `packages/auth` | 1 hr | 1.1-1.4 |
| **1.6** | Extract `packages/types` | 1 hr | 1.1-1.4 |
| **1.7** | Extract `packages/db` | 1 hr | 1.1-1.4 |
| **1.8** | Create `packages/ai` (Vercel AI SDK wrapper) | 1 hr | 1.1-1.4 |
| **2.1** | Move backend → `apps/scraper/src/`, split server.ts | 3 hrs | 1.5-1.8 |
| **2.2** | Move scraper frontend → `apps/scraper/web/` | 2 hrs | 2.1 |
| **2.3** | Move studio frontend → `apps/web/` | 2 hrs | 1.6 |
| **2.4** | Create AI Studio server → `apps/server/` | 2 hrs | 1.5-1.8 |
| **2.5** | Update Dockerfile for new structure | 1 hr | 2.1, 2.2 |
| **3.1** | Install assistant-ui | 15 min | 2.3 |
| **3.2** | Rewrite chat endpoint with Vercel AI SDK | 4 hrs | 2.4 |
| **3.3** | Replace chat UI with assistant-ui Thread | 3 hrs | 3.1, 3.2 |
| **3.4** | WebContainer sync via tool callbacks | 2 hrs | 3.3 |
| **3.5** | Mode selector integration | 1 hr | 3.3 |
| **3.6** | Image attachments | 1 hr | 3.3 |
| **4.1-4.3** | Full Vercel AI SDK migration (AI Studio chat) | 5 hrs | 3.2 |

**Total: ~36 hours**

---

## Complete File Migration Map

| Current | Target | Action |
|---|---|---|
| **Root configs** | | |
| `package.json` | `package.json` (workspace root) | Rewrite as workspace root |
| `tsconfig.json` | `tooling/tsconfig/base.json` | Extract |
| `Dockerfile` | `apps/scraper/Dockerfile` | Move |
| `deploy.sh` | `apps/scraper/deploy.sh` | Move + fix cache |
| `.env.example` | `.env.example` | Keep at root |
| **Backend: Scraper** | | |
| `src/server.ts` | `apps/scraper/src/index.ts` + `routes/*.ts` | Split into modules |
| `src/serve.ts` | `apps/scraper/src/entry.ts` | Rename |
| `src/main.ts` | `apps/scraper/src/main.ts` | Move |
| `src/gemini-client.ts` | `apps/scraper/src/gemini-client.ts` | Move (kept for scraper) |
| `src/extract-pipeline.ts` | `apps/scraper/src/extract/extract-pipeline.ts` | Move |
| `src/extractor.ts` | `apps/scraper/src/extract/extractor.ts` | Move |
| `src/agent-driver.ts` | `apps/scraper/src/extract/agent-driver.ts` | Move |
| `src/vision-loop.ts` | `apps/scraper/src/extract/vision-loop.ts` | Move |
| `src/job-manager.ts` | `apps/scraper/src/extract/job-manager.ts` | Move |
| `src/zip-builder.ts` | `apps/scraper/src/extract/zip-builder.ts` | Move |
| `src/memory/*` | `apps/scraper/src/memory/*` | Move (entire tree) |
| `src/remix/remix-manager.ts` | `apps/scraper/src/remix/remix-manager.ts` | Move |
| `src/remix/brand-extractor.ts` | `apps/scraper/src/remix/brand-extractor.ts` | Move |
| `src/remix/principles-extractor.ts` | `apps/scraper/src/remix/principles-extractor.ts` | Move |
| `src/remix/spec-generator.ts` | `apps/scraper/src/remix/spec-generator.ts` | Move |
| `src/remix/types.ts` | `apps/scraper/src/remix/types.ts` | Move (re-export from @uiharvest/types) |
| `src/remix/codegen/*` | `apps/scraper/src/remix/codegen/*` | Move (entire tree) |
| `src/remix/__tests__/*` | `apps/scraper/src/remix/__tests__/*` | Move |
| `src/store/job-store.ts` | `packages/db/src/job-store.ts` | Extract to package |
| **Backend: AI Studio** | | |
| `src/remix/chat-handler.ts` | `apps/server/src/chat/chat-handler.ts` | **REWRITE** (Vercel AI SDK) |
| (new) | `apps/server/src/index.ts` | New Express server |
| (new) | `apps/server/src/routes/auth.ts` | Uses @uiharvest/auth |
| (new) | `apps/server/src/routes/chat.ts` | Chat endpoint |
| (new) | `apps/server/src/chat/tools/code-edit.ts` | Uses @uiharvest/ai |
| **Frontend: Scraper Web** | | |
| `web/src/App.tsx` | `apps/scraper/web/src/App.tsx` | Move (remove RemixStudioView) |
| `web/src/main.tsx` | `apps/scraper/web/src/main.tsx` | Move |
| `web/src/index.css` | `apps/scraper/web/src/index.css` | Move |
| `web/src/views/DashboardView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/LandingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ProgressView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PageSelectorView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PasswordView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/RemixLandingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/OverviewView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ColorsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/TypographyView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SpacingView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/RadiiView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ShadowsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SvgsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ImagesView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ComponentsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/SectionsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/PatternsView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/TreeView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/MemoryView.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/views/ExtraViews.tsx` | `apps/scraper/web/src/views/` | Move |
| `web/src/components/Sidebar.tsx` | `apps/scraper/web/src/components/` | Move |
| `web/src/components/CodeEditor.tsx` | `apps/scraper/web/src/components/` | Move |
| `web/src/components/ui/*` | `apps/scraper/web/src/components/ui/` | Copy |
| `web/src/components/dialogs/*` | `apps/scraper/web/src/components/dialogs/` | Move |
| `web/src/components/shared/*` | `apps/scraper/web/src/components/shared/` | Move |
| `web/src/lib/helpers.ts` | `apps/scraper/web/src/lib/` | Move |
| `web/src/lib/utils.ts` | `apps/scraper/web/src/lib/` | Move |
| `web/src/lib/output-base.tsx` | `apps/scraper/web/src/lib/` | Move |
| `web/src/types/design-system.ts` | `apps/scraper/web/src/types/` | Move |
| `web/vite.config.ts` | `apps/scraper/web/vite.config.ts` | Move |
| `web/package.json` | `apps/scraper/web/package.json` | Move (trimmed deps) |
| `web/components.json` | `apps/scraper/web/components.json` | Move |
| **Frontend: AI Studio Web** | | |
| `web/src/views/RemixStudioView.tsx` | `apps/web/src/views/RemixStudioView.tsx` | Move + **REWRITE** |
| `web/src/hooks/studio/useRemixChat.ts` | **DELETE** | Replaced by useChatRuntime |
| `web/src/hooks/studio/useWebContainer.ts` | `apps/web/src/hooks/studio/` | Move |
| `web/src/lib/webcontainer.ts` | `apps/web/src/lib/` | Move |
| `web/src/lib/snapshot-cache.ts` | `apps/web/src/lib/` | Move |
| `web/src/components/studio/StudioWorkspace.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/StudioHeader.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/MarkdownContent.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/ToolExecutionCard.tsx` | `apps/web/src/components/studio/` | Move + adapt |
| `web/src/components/studio/WelcomeHero.tsx` | `apps/web/src/components/studio/` | Move (keep) |
| `web/src/components/studio/StudioChatPanel.tsx` | **DELETE** | Replaced by Thread |
| `web/src/components/studio/ChatMessageBubble.tsx` | **DELETE** | Replaced by assistant-ui |
| `web/src/components/studio/ThinkingIndicator.tsx` | **DELETE** | Built into assistant-ui |
| `web/src/components/studio/StudioInputArea.tsx` | **DELETE** | Replaced by Composer |
| `web/src/components/ui/*` | `apps/web/src/components/ui/` | Copy |
| `web/src/types/studio.ts` | `apps/web/src/types/` | Move |
| `scripts/generate-base-snapshot.ts` | `apps/web/scripts/` | Move |
| **Packages** | | |
| Auth from `src/server.ts:158-196` | `packages/auth/src/index.ts` | Extract |
| Types from `src/remix/types.ts` | `packages/types/src/remix.ts` | Extract |
| Types from `web/src/types/studio.ts` | `packages/types/src/studio.ts` | Extract |
| `src/store/job-store.ts` | `packages/db/src/job-store.ts` | Extract |
| (new) | `packages/ai/src/provider.ts` | New (Vercel AI SDK) |
| (new) | `packages/ai/src/tools/code-edit.ts` | New |

---

## Dependencies After Migration

### Root `package.json`
```json
{ "devDependencies": { "turbo": "^2", "typescript": "^5.9" } }
```

### `packages/auth/package.json`
```json
{ "dependencies": { "cookie-parser": "^1" }, "peerDependencies": { "express": "^4" } }
```

### `packages/types/package.json`
```json
{ "dependencies": {} }
```

### `packages/db/package.json`
```json
{ "dependencies": { "@google-cloud/firestore": "^8" } }
```

### `packages/ai/package.json`
```json
{ "dependencies": { "ai": "^6", "@ai-sdk/google": "^3", "zod": "^4" } }
```

### `apps/scraper/package.json`
```json
{
  "dependencies": {
    "@uiharvest/auth": "workspace:*",
    "@uiharvest/types": "workspace:*",
    "@uiharvest/db": "workspace:*",
    "express": "^4",
    "cookie-parser": "^1",
    "playwright": "^1",
    "sharp": "^0.34",
    "@google/genai": "^1",
    "dotenv": "^17"
  }
}
```

### `apps/server/package.json`
```json
{
  "dependencies": {
    "@uiharvest/auth": "workspace:*",
    "@uiharvest/types": "workspace:*",
    "@uiharvest/db": "workspace:*",
    "@uiharvest/ai": "workspace:*",
    "express": "^4",
    "cookie-parser": "^1",
    "ai": "^6",
    "@ai-sdk/google": "^3",
    "zod": "^4"
  }
}
```

### `apps/web/package.json`
```json
{
  "dependencies": {
    "@uiharvest/types": "workspace:*",
    "@assistant-ui/react": "latest",
    "@assistant-ui/react-ai-sdk": "latest",
    "ai": "^6",
    "@ai-sdk/react": "^3",
    "@webcontainer/api": "^1.6",
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4"
  }
}
```

### `apps/scraper/web/package.json`
```json
{
  "dependencies": {
    "@uiharvest/types": "workspace:*",
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4"
  }
}
```
