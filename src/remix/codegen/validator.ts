// ** import types
export interface ValidationResult {
    valid: boolean;
    repaired: string;
    issues: string[];
}

// ════════════════════════════════════════════════════
// SYNTAX VALIDATOR & AUTO-REPAIR
// ════════════════════════════════════════════════════
// Lightweight, fast post-generation validation for AI-generated code.
// Catches and auto-repairs the most common Gemini output errors:
//   - Unterminated string/template literals
//   - Unbalanced brackets/braces/parens
//   - Truncated trailing lines

/**
 * Validate a generated file and attempt to auto-repair common syntax issues.
 * Returns the (possibly repaired) content along with a list of issues found.
 */
export function validateAndRepair(content: string, filePath: string): ValidationResult {
    const issues: string[] = [];
    let code = content;

    // ── Step 1: Remove trailing partial lines ──────────────────────────
    // If the last line looks truncated (no semicolon, no closing bracket, no JSX close),
    // and it's clearly mid-expression, strip it.
    code = repairTrailingTruncation(code, issues);

    // ── Step 2: Fix unterminated string / template literals ────────────
    code = repairUnterminatedStrings(code, issues);

    // ── Step 3: Balance brackets / braces / parens ─────────────────────
    code = repairUnbalancedBrackets(code, issues);

    const valid = issues.length === 0;

    if (!valid) {
        console.warn(`[validator] ${filePath}: ${issues.length} issue(s) auto-repaired: ${issues.join("; ")}`);
    }

    return { valid, repaired: code, issues };
}

// ════════════════════════════════════════════════════
// REPAIR: TRAILING TRUNCATION
// ════════════════════════════════════════════════════

function repairTrailingTruncation(code: string, issues: string[]): string {
    const lines = code.split("\n");

    // Remove completely empty trailing lines first
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }

    if (lines.length === 0) return code;

    const lastLine = lines[lines.length - 1].trim();

    // Heuristic: last line looks truncated if it:
    // - Ends mid-word or with a dangling operator
    // - Is a partial import/const/let/var declaration
    // - Ends with an open string quote
    const truncatedPatterns = [
        /[a-zA-Z0-9_]$/,         // ends mid-identifier (no ; or bracket)
        /[=+\-*/%&|^~<>!,]$/,    // ends with operator
        /\b(?:import|from|const|let|var|function|return|export)\s*$/i,  // mid-keyword
    ];

    const isTruncated = truncatedPatterns.some(p => p.test(lastLine));
    const isValidEnding = /[;{})\]>\/`'".]$/.test(lastLine) || lastLine.startsWith("//") || lastLine.startsWith("/*");

    if (isTruncated && !isValidEnding && lines.length > 3) {
        lines.pop();
        issues.push("removed truncated trailing line");
    }

    return lines.join("\n") + "\n";
}

// ════════════════════════════════════════════════════
// REPAIR: UNTERMINATED STRINGS
// ════════════════════════════════════════════════════

function repairUnterminatedStrings(code: string, issues: string[]): string {
    // Check for unterminated template literals (backticks)
    const backtickCount = countUnescaped(code, "`");
    if (backtickCount % 2 !== 0) {
        code = code.trimEnd() + "`\n";
        issues.push("closed unterminated template literal");
    }

    // Check line-by-line for unterminated regular strings
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fixed = repairLineStrings(line);
        if (fixed !== line) {
            lines[i] = fixed;
            issues.push(`closed unterminated string on line ${i + 1}`);
        }
    }

    return lines.join("\n");
}

/**
 * Count unescaped occurrences of a character in code,
 * skipping occurrences inside strings of other quote types and comments.
 */
function countUnescaped(code: string, char: string): number {
    let count = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateLiteral = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const prev = i > 0 ? code[i - 1] : "";
        const next = i < code.length - 1 ? code[i + 1] : "";

        // Skip escaped characters
        if (prev === "\\") continue;

        // Handle newlines — reset line comment
        if (c === "\n") {
            inLineComment = false;
            continue;
        }

        // Handle comments
        if (!inSingleQuote && !inDoubleQuote && !inTemplateLiteral) {
            if (c === "/" && next === "/" && !inBlockComment) {
                inLineComment = true;
                continue;
            }
            if (c === "/" && next === "*" && !inLineComment) {
                inBlockComment = true;
                continue;
            }
        }
        if (inBlockComment && c === "*" && next === "/") {
            inBlockComment = false;
            i++; // skip the /
            continue;
        }
        if (inLineComment || inBlockComment) continue;

        // Count the target character when not inside other string types
        if (char === "`") {
            if (c === "'" && !inDoubleQuote && !inTemplateLiteral) { inSingleQuote = !inSingleQuote; continue; }
            if (c === '"' && !inSingleQuote && !inTemplateLiteral) { inDoubleQuote = !inDoubleQuote; continue; }
            if (c === "`" && !inSingleQuote && !inDoubleQuote) { count++; inTemplateLiteral = !inTemplateLiteral; }
        }
    }

    return count;
}

/**
 * Repair unterminated single/double quotes on a single line.
 * Uses a simple state machine approach.
 */
function repairLineStrings(line: string): string {
    // Skip comment-only lines
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return line;
    }

    // Skip lines that are JSX content (likely to have valid mixed quotes)
    if (trimmed.startsWith("<") && !trimmed.includes("=")) {
        return line;
    }

    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const prev = i > 0 ? line[i - 1] : "";

        if (prev === "\\") continue;

        if (c === "`" && !inSingle && !inDouble) {
            inTemplate = !inTemplate;
        } else if (c === "'" && !inDouble && !inTemplate) {
            inSingle = !inSingle;
        } else if (c === '"' && !inSingle && !inTemplate) {
            inDouble = !inDouble;
        }
    }

    // If a string was left open, close it
    if (inDouble) {
        return line + '"';
    }
    if (inSingle) {
        return line + "'";
    }

    return line;
}

// ════════════════════════════════════════════════════
// REPAIR: UNBALANCED BRACKETS
// ════════════════════════════════════════════════════

function repairUnbalancedBrackets(code: string, issues: string[]): string {
    const counts = countBrackets(code);

    let suffix = "";

    // Close missing parens
    if (counts.parenOpen > counts.parenClose) {
        const missing = counts.parenOpen - counts.parenClose;
        suffix += ")".repeat(missing);
        issues.push(`closed ${missing} unclosed parenthes${missing === 1 ? "is" : "es"}`);
    }

    // Close missing brackets
    if (counts.bracketOpen > counts.bracketClose) {
        const missing = counts.bracketOpen - counts.bracketClose;
        suffix += "]".repeat(missing);
        issues.push(`closed ${missing} unclosed bracket${missing === 1 ? "" : "s"}`);
    }

    // Close missing braces
    if (counts.braceOpen > counts.braceClose) {
        const missing = counts.braceOpen - counts.braceClose;
        suffix += "}".repeat(missing);
        issues.push(`closed ${missing} unclosed brace${missing === 1 ? "" : "s"}`);
    }

    // Handle extra closing brackets (rare, but indicates corruption)
    if (counts.parenClose > counts.parenOpen ||
        counts.bracketClose > counts.bracketOpen ||
        counts.braceClose > counts.braceOpen) {
        issues.push("detected extra closing brackets (possible corruption)");
        // Don't modify — removing closers could make things worse
    }

    if (suffix) {
        // Add closers on a new line at the end
        code = code.trimEnd() + "\n" + suffix + "\n";
    }

    return code;
}

/**
 * Count bracket pairs in code, skipping strings and comments.
 */
function countBrackets(code: string): {
    parenOpen: number; parenClose: number;
    bracketOpen: number; bracketClose: number;
    braceOpen: number; braceClose: number;
} {
    const result = {
        parenOpen: 0, parenClose: 0,
        bracketOpen: 0, bracketClose: 0,
        braceOpen: 0, braceClose: 0,
    };

    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let templateDepth = 0; // track ${} inside templates

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const prev = i > 0 ? code[i - 1] : "";
        const next = i < code.length - 1 ? code[i + 1] : "";

        if (prev === "\\" && !inBlockComment && !inLineComment) continue;

        if (c === "\n") {
            inLineComment = false;
            continue;
        }

        // Comments
        if (!inSingle && !inDouble && !inTemplate) {
            if (c === "/" && next === "/" && !inBlockComment) { inLineComment = true; continue; }
            if (c === "/" && next === "*" && !inLineComment) { inBlockComment = true; continue; }
        }
        if (inBlockComment) {
            if (c === "*" && next === "/") { inBlockComment = false; i++; }
            continue;
        }
        if (inLineComment) continue;

        // String tracking
        if (c === "`" && !inSingle && !inDouble) {
            if (!inTemplate) {
                inTemplate = true;
                templateDepth = 0;
            } else if (templateDepth === 0) {
                inTemplate = false;
            }
            continue;
        }
        if (inTemplate && c === "$" && next === "{") {
            templateDepth++;
            continue;
        }
        if (inTemplate && templateDepth > 0 && c === "}") {
            templateDepth--;
            continue;
        }
        if (c === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
        if (c === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }

        // Skip counting inside strings
        if (inSingle || inDouble || (inTemplate && templateDepth === 0)) continue;

        // Count brackets
        switch (c) {
            case "(": result.parenOpen++; break;
            case ")": result.parenClose++; break;
            case "[": result.bracketOpen++; break;
            case "]": result.bracketClose++; break;
            case "{": result.braceOpen++; break;
            case "}": result.braceClose++; break;
        }
    }

    return result;
}
