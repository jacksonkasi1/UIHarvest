# Plan: AI-Driven Interactive Component Extractor

## Goal
Redesign `UIHarvest` to be a 100% AI-driven, autonomous component extractor using the `agent-browser` CLI to orchestrate a true Vision-Agent loop. This replaces the static DOM-parsing heuristic engine with an interactive, intelligent extraction process.

## Problems Solved
1. **Dirty Background Bleeds**: By relying on the exact visual coordinates and removing the arbitrary 12px Playwright padding, crops will be pixel-perfect.
2. **AI Naming/Grouping Hallucinations**: Because the Vision model directs the extraction process and has context over the entire viewport at once (using Set-of-Mark annotation), it will group visually identical elements correctly without being confused by different text labels.
3. **Hidden Components**: The AI can issue interactive commands (like `click`) to open dropdowns, modals, or tab panels that a static scraper would miss.

## Architecture & Workflow

### 1. Initialization
- **Replace** direct `playwright` usage in `src/main.ts` with `agent-browser` CLI interactions via Node.js `child_process.execSync` or `exec`.
- Start a named session for isolation: `agent-browser --session harvest open <URL> && agent-browser --session harvest wait --load networkidle`

### 2. The Vision-Agent Loop
We will implement an autonomous exploration loop that processes the page viewport by viewport.

For each viewport state:
1. **Snapshot & Annotate:**
   - Run `agent-browser --session harvest snapshot -i --json` to get a structured list of interactive elements (including bounding boxes and locators).
   - Run `agent-browser --session harvest screenshot --annotate` to capture the viewport with numbered `[N]` labels overlaid on interactive elements.

2. **Vision Reasoning (Gemini/OpenAI):**
   - Send the annotated screenshot and the JSON snapshot to the Vision model.
   - **Prompt:** "You are an expert UI/UX extractor. Analyze this annotated screenshot. Return a JSON array of `componentsToExtract` (identifying them by their `@eN` refs, defining their Type and Name, and grouping identical ones into a Pattern ID). Also return a list of `actionsToTake` (e.g., click `@e5`) to reveal hidden UI elements like dropdowns, if any."

3. **Extraction & Cropping:**
   - For each identified component ref (e.g., `@e10`):
     - Find `@e10` in the JSON snapshot to get its precise `x, y, w, h` bounding box.
     - Use `sharp` to mathematically crop the clean, non-annotated screenshot using these precise coordinates (no 12px arbitrary padding!).
     - Run `agent-browser --session harvest eval --stdin` to extract the element's `outerHTML` and computed styles based on its selector or coordinates.
   
4. **Interaction:**
   - Execute the AI's requested actions: `agent-browser --session harvest click @e5 && agent-browser --session harvest wait 1000`.
   - Take a new snapshot and repeat extraction for the newly revealed state.

5. **Scroll & Continue:**
   - Execute `agent-browser --session harvest scroll down 800`.
   - Repeat the loop until the bottom of the page is reached.

### 3. Cleanup & Integration
- Remove the heuristic-based `src/extractor.ts` as it's no longer needed.
- Remove the old Phase 1.5/1.6 AI Validation passes, since the AI is now driving the extraction from the very beginning.
- Format the output into the existing `design-system.json` format so the local web viewer continues to work flawlessly.
- Ensure `agent-browser session close` is called to clean up processes.

## Implementation Steps

1. **Setup Agent Wrapper**: Create a helper class in `src/agent-driver.ts` to wrap `child_process.execSync` for executing `agent-browser` commands.
2. **Vision Loop Logic**: Implement the core `Screenshot -> LLM -> Action/Extract` loop in `src/main.ts`.
3. **Component Extraction**: Add the precise `sharp` cropping logic based on the AI's selected refs.
4. **Data Formatting**: Transform the AI's output into the `ExtractedDesignSystem` schema.
5. **Testing**: Run against a test site to verify clean crops and intelligent component grouping.