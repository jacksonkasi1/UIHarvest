# UIHarvest — Revised Monorepo Plan

## Locked Decisions

1. Three apps under `apps/*`:
   - `apps/scraper`: scraper backend + bundled scraper web UI
   - `apps/server`: AI Studio backend (chat + tool execution)
   - `apps/web`: AI Studio frontend (assistant-ui + WebContainer)
2. Scraper owns extraction, design memory, and remix bootstrap generation (brand/principles/spec/initial files).
3. AI Studio owns iterative chat-based editing only.
4. Shared auth goes into `packages/auth`.
5. Shared domain types go into `packages/types`.
6. Shared Firestore job persistence goes into `packages/db` (job store first).
7. `packages/ai` is deferred for now (keep AI wiring inside `apps/server/src/ai`).
8. `conversation-store` is deferred until cross-session persistence is truly needed.
9. Shared shadcn components go into `packages/ui` to avoid duplicate UI copies.
10. Cross-origin auth is a migration-critical item and must be implemented before full split rollout.
11. Add Morph Fast Apply to the Studio editing path to reduce large-model output tokens and speed up file updates.

---

## Target Repo Shape

```text
uiharvest/
├── apps/
│   ├── scraper/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── deploy.sh
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── extract.ts
│   │   │   │   ├── remix.ts
│   │   │   │   └── jobs.ts
│   │   │   ├── extract/
│   │   │   ├── memory/
│   │   │   ├── remix/
│   │   │   ├── store/
│   │   │   └── gemini-client.ts
│   │   └── web/
│   │       ├── vite.config.ts
│   │       └── src/
│   │           ├── App.tsx
│   │           ├── views/...(dashboard/landing/progress/explorer/memory)
│   │           └── components/
│   │
│   ├── server/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── deploy.sh
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   └── chat.ts
│   │       ├── ai/
│   │       │   ├── provider.ts
│   │       │   ├── tools/code-edit.ts
│   │       │   └── prompts/
│   │       └── chat/chat-handler.ts
│   │
│   └── web/
│       ├── package.json
│       ├── components.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx
│           ├── views/RemixStudioView.tsx
│           ├── hooks/studio/useWebContainer.ts
│           ├── lib/webcontainer.ts
│           └── components/
│               ├── assistant-ui/
│               └── studio/
│
├── packages/
│   ├── auth/
│   ├── types/
│   ├── db/
│   └── ui/
│
├── tooling/tsconfig/
├── turbo.json
└── package.json
```

---

## Workspace Strategy

Use only top-level workspace globs:

```json
{
  "workspaces": ["apps/*", "packages/*", "tooling/*"]
}
```

Notes:
- `apps/scraper/web` is a folder inside the scraper app, not a separate workspace package.
- Avoid nested workspace config (`apps/scraper/web`) to prevent dependency/task ambiguity.

---

## App Responsibilities

### `apps/scraper` (independent scraper product)

Owns:
- `extract-pipeline`, `extractor`, `vision-loop`, `agent-driver`, `job-manager`, zip download
- design memory pipeline (`memory/analyze`, `memory/interpret`, `memory/render`)
- remix bootstrap pipeline (`remix-manager`, brand/principles/spec generation, initial scaffold/codegen)
- Firestore job persistence (through `@uiharvest/db`)
- bundled scraper UI (`apps/scraper/web/dist`) served from scraper root endpoint
- explorer views and memory docs browsing

Does not own:
- assistant-ui chat runtime
- iterative studio chat route

### `apps/server` (AI Studio API)

Owns:
- chat route (`POST /api/chat/:jobId`)
- Vercel AI SDK (`streamText`, `generateObject`) integration
- Morph Fast Apply integration in `codeEdit` execute path (snippet-to-full-file merge)
- tool-call handling for iterative code edits
- job hydration/update via `@uiharvest/db`
- shared auth from `@uiharvest/auth`

Does not own:
- Playwright extraction
- memory pipeline
- bootstrap remix generation

### `apps/web` (AI Studio UI)

Owns:
- `assistant-ui` thread UI
- mode selector (Chat/Smart/YOLO)
- WebContainer live preview + file sync
- tool cards for code edit operations

---

## Shared Packages

### `packages/auth`

Extract shared auth middleware and handlers from current `src/server.ts`:
- `authMiddleware`
- `status/login/logout` helpers
- cookie session validation

Add options for multi-service deployment:

```ts
export interface AuthOptions {
  sitePassword?: string
  sessionSecret?: string
  cookieDomain?: string // e.g. .uiharvest.com
  useBearer?: boolean   // optional token mode for non-subdomain setups
}
```

### `packages/types`

Unify duplicated domain types:
- remix/job/generated file/progress types
- studio chat/tool event types
- extraction progress/result types

### `packages/db`

Phase-1 scope:
- `job-store.ts` only

Deferred:
- `conversation-store.ts` (add later if cross-device chat persistence is required)

### `packages/ui`

Create one shared shadcn/ui package used by both frontends:
- move reusable components from `web/src/components/ui/*`
- export from `@uiharvest/ui`
- keep app-specific layout and feature components in each app

---

## Deployment Plan

### Scraper (`apps/scraper`)
- Cloud Run
- heavy Docker image with Playwright + Chromium
- serves scraper frontend bundle from server root

### AI Studio API (`apps/server`)
- Cloud Run
- lightweight Docker image (no Playwright)

### AI Studio Web (`apps/web`)
- static hosting (Firebase Hosting / Cloud Storage + CDN / equivalent)
- must set headers for WebContainer support:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`

---

## Cross-Origin Auth (Critical)

Current single-origin cookie auth will break when services split across origins.

Required implementation before production split:
1. Use shared cookie domain where possible:
   - cookie `domain: .uiharvest.com`
2. Ensure `secure: true`, `httpOnly: true`, and appropriate `sameSite`
3. Configure CORS + credentials for API calls from studio web to studio API
4. Keep optional bearer mode fallback in `packages/auth` for non-subdomain environments

---

## Execution Phases (Revised)

### Phase 0 — Bug Fixes First
1. Fix deployment cache behavior (`Cache-Control` + deploy build cache controls)
2. Harden WebContainer file writes (atomic writes, dir creation, retries)
3. Stabilize tests and add root test commands

### Phase 1 — Turborepo Foundation + Shared Packages
1. Initialize turbo + workspace scripts + shared tsconfig tooling
2. Extract `packages/auth`
3. Extract `packages/types`
4. Extract `packages/db` (job store only)
5. Create `packages/ui` and migrate shared shadcn components
6. Do not create `packages/ai` yet

### Phase 2 — App Split
1. Move backend code to `apps/scraper/src`
2. Move scraper frontend into `apps/scraper/web`
3. Move studio frontend into `apps/web`
4. Create studio backend in `apps/server`
5. Add deployment artifacts for all 3 apps
6. Implement cross-origin auth configuration

### Phase 3 — assistant-ui + Vercel AI SDK (Studio)
1. Integrate `@assistant-ui/react` and `@assistant-ui/react-ai-sdk` in `apps/web`
2. Rewrite studio chat endpoint in `apps/server` using `streamText`
3. Replace manual SSE chat plumbing in frontend with assistant runtime
4. Connect tool results to WebContainer file updates
5. Wire Chat/Smart/YOLO mode behavior via server-side step limits
6. Integrate Morph Fast Apply in `codeEdit` tool execution

### Phase 4 — Polish and Full Studio Migration
1. Remove legacy studio chat code paths
2. Harden tool execution + error surfaces
3. Add optional server-side conversation persistence if required

---

## Morph Fast Apply Integration (New)

### Why this is added

Current full-file rewrite behavior is expensive and slow for iterative coding. Most edits change a small part of a large file.

Planned optimization:
- Keep a strong planner/coding model for reasoning and edit planning
- Return compact edit snippets from the model
- Use Morph Fast Apply to merge snippet + original file into final full content

Expected outcome:
- Lower expensive LLM output token usage for multi-file edits
- Faster per-file apply latency
- Better YOLO-mode throughput when `maxSteps` causes repeated edits

### Scope

In scope now:
- Studio API only (`apps/server`)
- `codeEdit` tool execution path only

Out of scope now:
- WarpGrep
- Scraper bootstrap pipeline editing path

### Server-side design (`apps/server`)

1. Read original file content from job state (`@uiharvest/db`)
2. Call Morph Fast Apply API with:
   - instruction
   - original code
   - edit snippet
3. Receive merged full file
4. Persist merged file back to Firestore
5. Return merged file(s) to frontend tool result for WebContainer sync

### Tool schema update (`codeEdit`)

Move from full-file payloads to snippet payloads:

```ts
{
  path: string,
  instructions: string,
  editSnippet: string
}
```

Runtime behavior:
- If Morph apply succeeds, persist merged code
- If Morph apply fails, fallback to full-file generation path for that file

### Prompting rule update (Studio system prompt)

When calling `codeEdit`, the model should prefer snippet-style updates with unchanged context markers:

```text
// ... existing code ...
<changed lines>
// ... existing code ...
```

### Env and config

Add Studio API env vars:
- `MORPH_API_KEY`
- `MORPH_BASE_URL` (default `https://api.morphllm.com/v1`)
- `MORPH_MODEL` (default `morph-v3-auto`)
- `MORPH_ENABLED` (`true`/`false`, default `true` in production)

### Rollout strategy

1. Ship behind feature flag (`MORPH_ENABLED`)
2. Enable for a small percentage or internal traffic first
3. Log per-edit metrics:
   - apply latency
   - apply success/failure rate
   - fallback rate
   - output token deltas
4. Expand rollout once stability is verified

### Risk controls

- Keep deterministic fallback path (current full-file approach)
- Add per-file retry with capped attempts
- Store before/after versions for quick diff and recovery
- Preserve tool result schema compatibility for frontend

---

## Realistic Timeline

Estimated effort: ~2.5 to 3 weeks (roughly 50+ engineering hours), including migration validation and cross-origin auth stabilization.

---

## Immediate Next Tasks

1. Apply Phase 0 changes only (no structural file moves yet).
2. Add `packages/auth` skeleton with `cookieDomain` support.
3. Add `packages/ui` skeleton and move a small shared subset (`button`, `card`, `input`) first.
4. Prepare workspace root (`turbo.json`, root scripts, shared tsconfig) with no behavior changes.
