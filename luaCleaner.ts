import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

interface LuacheckWarning {
    line: number;
    colStart: number;
    colEnd: number;
    code: string;
    message: string;
    name?: string;
}

interface Token {
    type: "identifier" | "keyword" | "string" | "number" | "punctuation";
    value: string;
    start: number;
    end: number;
}

const KEYWORDS = new Set<string>([
    "and", "break", "do", "else", "elseif", "end", "false", "for",
    "function", "goto", "if", "in", "local", "nil", "not", "or",
    "repeat", "return", "then", "true", "until", "while"
]);

const BLOCK_OPENERS = new Set<string>(["function", "if", "do", "repeat"]);

export interface LuaCleanerOptions {
    cwd?: string; // Working directory to run luacheck from. Defaults to dirname(filePath)
    luacheckConfig?: string; // Optional --config path passed to luacheck
    logger?: (msg: string) => void; // Verbose logger
    warner?: (msg: string) => void; // Warning logger
    stripComments?: boolean; // Strip comments after unused removal. Default true
    maxIterations?: number; // Cap iterations of unused removal. Default 50
    failOnVerificationError?: boolean; // Throw if the final luacheck pass reports errors. Default true
    removeUnusedGlobals?: boolean; // Also remove top-level `function NAME()` whose name is referenced nowhere else in the file. Default true
    entryPoints?: string[]; // Names of global functions that must always be kept (e.g. callbacks referenced from C bindings by string)
}

/**
 * Clean a Lua file by removing unused functions / variables (detected via luacheck)
 * and stripping comments. The cleaner blanks the removed content rather than
 * deleting whole lines so that line numbers in any runtime crash trace still
 * point at the corresponding source line.
 */
export class LuaCleaner {
    private filePath: string;
    private content: string;
    private cwd: string;
    private luacheckConfig?: string;
    private log: (msg: string) => void;
    private warn: (msg: string) => void;
    private stripComments_: boolean;
    private maxIterations: number;
    private failOnVerificationError: boolean;
    private removeUnusedGlobals_: boolean;
    private entryPoints: Set<string>;
    private lineOffsets: number[] = [];

    constructor(filePath: string, options: LuaCleanerOptions = {}) {
        this.filePath = filePath;
        this.cwd = options.cwd || path.dirname(filePath);
        this.luacheckConfig = options.luacheckConfig;
        this.log = options.logger || (() => { });
        this.warn = options.warner || (() => { });
        this.stripComments_ = options.stripComments !== false;
        this.maxIterations = options.maxIterations ?? 50;
        this.failOnVerificationError = options.failOnVerificationError !== false;
        this.removeUnusedGlobals_ = options.removeUnusedGlobals !== false;
        this.entryPoints = new Set(options.entryPoints ?? []);
        this.content = fs.readFileSync(filePath, "utf-8");
        this.rebuildLineIndex();
    }

    /**
     * Run the cleaner: iteratively remove unused declarations, strip comments,
     * then verify the result with luacheck. The cleaned content is written
     * back to the source file.
     */
    async clean(): Promise<void> {
        this.log(`Cleaning ${this.filePath}`);

        let totalRemoved = 0;
        let iteration = 0;
        while (iteration < this.maxIterations) {
            iteration++;
            let removed = 0;

            // Pass 1: luacheck-reported unused locals (W211)
            const warnings = this.runLuacheck();
            const unused = warnings.filter(w => w.code === "211");
            unused.sort((a, b) => b.line - a.line || b.colStart - a.colStart);
            for (const u of unused) {
                const snapshot = this.content;
                if (this.tryRemove(u)) {
                    this.flush();
                    if (this.hasParseErrors()) {
                        this.warn(`Reverting removal of '${u.name}' at ${u.line}:${u.colStart} — produced parse errors`);
                        this.content = snapshot;
                        this.rebuildLineIndex();
                        this.flush();
                    } else {
                        removed++;
                    }
                }
            }

            // Pass 2: global function definitions whose name is referenced nowhere else
            if (this.removeUnusedGlobals_) {
                removed += this.removeUnusedGlobalFunctions();
                this.flush();
            }

            this.log(`Iteration ${iteration}: removed ${removed} unused declaration(s)`);
            if (removed === 0) { break; }
            totalRemoved += removed;
        }

        if (this.stripComments_) {
            this.content = this.stripCommentsFromContent(this.content);
        }

        // Minify: drop all blank lines and strip leading/trailing whitespace
        // from each remaining line. String-aware so the contents of long
        // strings (`[[...]]`) and quoted strings are preserved exactly.
        // One statement still occupies one line, so a runtime crash at line
        // N points at readable code at line N of this file.
        this.content = this.minifyWhitespace(this.content);
        this.rebuildLineIndex();
        this.flush();

        // Final verification pass
        const finalWarnings = this.runLuacheck();
        const finalErrors = finalWarnings.filter(w => /^0\d\d$/.test(w.code));
        if (finalErrors.length > 0 && this.failOnVerificationError) {
            const summary = finalErrors.slice(0, 5).map(e => `line ${e.line}: ${e.message}`).join("; ");
            throw new Error(`luacheck reported ${finalErrors.length} parse error(s) after cleaning: ${summary}`);
        }
        this.log(`Cleaning complete. Removed ${totalRemoved} unused declaration(s) over ${iteration} iteration(s).`);
    }

    private flush(): void {
        fs.writeFileSync(this.filePath, this.content);
    }

    private rebuildLineIndex(): void {
        this.lineOffsets = [0];
        for (let i = 0; i < this.content.length; i++) {
            if (this.content.charCodeAt(i) === 10) { this.lineOffsets.push(i + 1); }
        }
    }

    private lineColToOffset(line: number, col: number): number {
        if (line < 1 || line > this.lineOffsets.length) { return -1; }
        return this.lineOffsets[line - 1] + (col - 1);
    }

    private runLuacheck(): LuacheckWarning[] {
        const args = [this.filePath, "--formatter", "plain", "--codes", "--ranges", "--no-color"];
        if (this.luacheckConfig) { args.push("--config", this.luacheckConfig); }
        let output = "";
        try {
            output = execFileSync("luacheck", args, { cwd: this.cwd, encoding: "utf-8" });
        } catch (e: any) {
            output = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
        }

        const warnings: LuacheckWarning[] = [];
        const re = /^.+?:(\d+):(\d+)(?:-(\d+))?: \(([EW]?)(\d+)\) (.*)$/;
        for (const line of output.split("\n")) {
            const m = line.match(re);
            if (!m) { continue; }
            const code = m[5];
            const message = m[6];
            const nameMatch = message.match(/'([^']+)'/);
            warnings.push({
                line: parseInt(m[1], 10),
                colStart: parseInt(m[2], 10),
                colEnd: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
                code,
                message,
                name: nameMatch ? nameMatch[1] : undefined,
            });
        }
        return warnings;
    }

    private hasParseErrors(): boolean {
        return this.runLuacheck().some(w => /^0\d\d$/.test(w.code));
    }

    /**
     * Tokenize the entire file. Returns tokens in order.
     */
    private tokenizeAll(): Token[] {
        const out: Token[] = [];
        let pos = 0;
        const len = this.content.length;
        while (pos < len) {
            const t = this.nextToken(pos);
            if (!t) { break; }
            out.push(t);
            pos = t.end;
        }
        return out;
    }

    /**
     * Find top-level `function NAME(...) ... end` declarations whose name does
     * not appear as an identifier anywhere else in the file (outside the
     * function body itself) and blank them. Returns the number removed.
     *
     * luacheck does not flag unused globals because, in general, globals may
     * be consumed by callers outside the file. For a generated standalone Lua
     * script the file is self-contained, so a global function with no in-file
     * reference (and not on the entryPoints allow-list) is dead code.
     */
    private removeUnusedGlobalFunctions(): number {
        const tokens = this.tokenizeAll();

        interface FuncDef {
            name: string;
            nameStart: number;
            startOffset: number;
            endOffset: number;
        }
        const funcs: FuncDef[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            if (tok.type !== "keyword" || tok.value !== "function") { continue; }
            // Skip `local function NAME` — luacheck handles those
            const prev = tokens[i - 1];
            if (prev && prev.type === "keyword" && prev.value === "local") { continue; }
            // Skip anonymous functions (`= function()` etc.) — handled where they live
            const nameTok = tokens[i + 1];
            if (!nameTok || nameTok.type !== "identifier") { continue; }
            // Only simple global names — bail on `function ns.foo()` or `function obj:method()`
            const afterName = tokens[i + 2];
            if (!afterName || afterName.value !== "(") { continue; }

            const endOffset = this.findBlockEnd(tok.start);
            if (endOffset < 0) { continue; }
            funcs.push({
                name: nameTok.value,
                nameStart: nameTok.start,
                startOffset: tok.start,
                endOffset,
            });
        }

        if (funcs.length === 0) { return 0; }

        // Index identifier tokens by name to make reference checks fast
        const idTokensByName = new Map<string, Token[]>();
        for (const tok of tokens) {
            if (tok.type !== "identifier") { continue; }
            const arr = idTokensByName.get(tok.value);
            if (arr) { arr.push(tok); } else { idTokensByName.set(tok.value, [tok]); }
        }

        // Sort by start descending so removals don't shift earlier offsets
        funcs.sort((a, b) => b.startOffset - a.startOffset);

        let removed = 0;
        for (const f of funcs) {
            if (this.entryPoints.has(f.name)) { continue; }
            const refs = idTokensByName.get(f.name) ?? [];
            let externalRefs = 0;
            for (const ref of refs) {
                if (ref.start === f.nameStart) { continue; } // The definition's own name
                if (ref.start >= f.startOffset && ref.end <= f.endOffset) { continue; } // Inside the function's own body
                externalRefs++;
                break;
            }
            if (externalRefs > 0) { continue; }

            const snapshot = this.content;
            this.blankRange(f.startOffset, f.endOffset);
            this.rebuildLineIndex();
            this.flush();
            if (this.hasParseErrors()) {
                this.warn(`Reverting removal of global function '${f.name}' — produced parse errors`);
                this.content = snapshot;
                this.rebuildLineIndex();
                this.flush();
                continue;
            }
            removed++;
        }
        return removed;
    }

    /**
     * Attempt to blank out the declaration of an unused identifier. Returns
     * true if something was removed.
     */
    private tryRemove(w: LuacheckWarning): boolean {
        if (!w.name) { return false; }
        const nameOffset = this.lineColToOffset(w.line, w.colStart);
        if (nameOffset < 0) { return false; }

        // Look backward on the same line for the statement keyword (function | local function | local)
        const lineStart = this.lineOffsets[w.line - 1];
        const beforeName = this.content.substring(lineStart, nameOffset);
        const kwMatch = beforeName.match(/(local\s+function|function|local)\s*$/);
        if (!kwMatch) {
            // Unusual layout (keyword on prior line, etc.) — leave alone for safety
            return false;
        }
        const keyword = kwMatch[1];
        const stmtStart = lineStart + (kwMatch.index ?? 0);

        let stmtEnd: number;
        if (keyword === "function" || keyword === "local function") {
            stmtEnd = this.findBlockEnd(stmtStart);
        } else {
            stmtEnd = this.findStatementEnd(stmtStart);
        }
        if (stmtEnd < 0 || stmtEnd <= stmtStart) { return false; }

        this.blankRange(stmtStart, stmtEnd);
        this.rebuildLineIndex();
        return true;
    }

    /**
     * Starting at the position of a block-opening keyword (function|if|do|repeat),
     * return the offset just past the matching end / until keyword.
     */
    private findBlockEnd(startOffset: number): number {
        let pos = startOffset;
        let depth = 0;
        let opened = false;
        const len = this.content.length;
        while (pos < len) {
            const tok = this.nextToken(pos);
            if (!tok) { return -1; }
            pos = tok.end;
            if (tok.type === "keyword") {
                if (BLOCK_OPENERS.has(tok.value)) {
                    depth++;
                    opened = true;
                } else if (tok.value === "end" || tok.value === "until") {
                    depth--;
                    if (opened && depth === 0) { return pos; }
                }
            }
        }
        return -1;
    }

    /**
     * Starting at the beginning of a statement (e.g. the "local" keyword),
     * return the offset just past the end of the statement. Handles balanced
     * parens / brackets / braces and string and comment skipping. Considers a
     * statement complete when, at depth 0, we hit ';', a newline followed by
     * another statement, or the end of file.
     */
    private findStatementEnd(startOffset: number): number {
        let pos = startOffset;
        let depth = 0;
        let sawAnyToken = false;
        const len = this.content.length;
        while (pos < len) {
            // Try to detect end-of-statement at newline (depth 0) before consuming next token
            if (sawAnyToken && depth === 0) {
                const peek = this.skipInlineWhitespace(pos);
                if (peek >= len) { return len; }
                if (this.content.charCodeAt(peek) === 10) { return peek + 1; }
            }
            const tok = this.nextToken(pos);
            if (!tok) { return len; }
            sawAnyToken = true;
            if (tok.type === "punctuation") {
                if (tok.value === "(" || tok.value === "{" || tok.value === "[") { depth++; }
                else if (tok.value === ")" || tok.value === "}" || tok.value === "]") { depth = Math.max(0, depth - 1); }
                else if (tok.value === ";" && depth === 0) { return tok.end; }
            }
            pos = tok.end;
        }
        return len;
    }

    private skipInlineWhitespace(pos: number): number {
        while (pos < this.content.length) {
            const c = this.content.charCodeAt(pos);
            if (c === 32 || c === 9 || c === 13) { pos++; continue; }
            break;
        }
        return pos;
    }

    /**
     * Skip whitespace and comments and return the position of the next token start.
     */
    private skipWhitespaceAndComments(pos: number): number {
        const len = this.content.length;
        while (pos < len) {
            const c = this.content[pos];
            if (c === " " || c === "\t" || c === "\n" || c === "\r") { pos++; continue; }
            if (c === "-" && this.content[pos + 1] === "-") {
                // Long comment: --[[ ... ]] or --[=*[ ... ]=*]
                if (this.content[pos + 2] === "[") {
                    const level = this.readLongBracketLevel(pos + 2);
                    if (level >= 0) {
                        const end = this.findLongBracketEnd(pos + 2, level);
                        pos = end >= 0 ? end : len;
                        continue;
                    }
                }
                // Short comment to end of line
                pos += 2;
                while (pos < len && this.content[pos] !== "\n") { pos++; }
                continue;
            }
            break;
        }
        return pos;
    }

    private readLongBracketLevel(pos: number): number {
        if (this.content[pos] !== "[") { return -1; }
        let p = pos + 1;
        let level = 0;
        while (this.content[p] === "=") { level++; p++; }
        if (this.content[p] === "[") { return level; }
        return -1;
    }

    private findLongBracketEnd(startOffset: number, level: number): number {
        // startOffset is at the opening '['; skip past [=*[
        let p = startOffset + 2 + level;
        const len = this.content.length;
        while (p < len) {
            if (this.content[p] === "]") {
                let count = 0;
                let q = p + 1;
                while (this.content[q] === "=") { count++; q++; }
                if (count === level && this.content[q] === "]") { return q + 1; }
            }
            p++;
        }
        return -1;
    }

    private nextToken(pos: number): Token | null {
        pos = this.skipWhitespaceAndComments(pos);
        const len = this.content.length;
        if (pos >= len) { return null; }

        const c = this.content[pos];

        // Identifier or keyword
        if (this.isIdentStart(c)) {
            let end = pos + 1;
            while (end < len && this.isIdentCont(this.content[end])) { end++; }
            const value = this.content.substring(pos, end);
            return { type: KEYWORDS.has(value) ? "keyword" : "identifier", value, start: pos, end };
        }

        // String: "..." or '...'
        if (c === '"' || c === "'") {
            let end = pos + 1;
            while (end < len) {
                const ch = this.content[end];
                if (ch === "\\") { end += 2; continue; }
                if (ch === c) { end++; break; }
                if (ch === "\n") { break; }
                end++;
            }
            return { type: "string", value: this.content.substring(pos, end), start: pos, end };
        }

        // Long string
        if (c === "[") {
            const level = this.readLongBracketLevel(pos);
            if (level >= 0) {
                const end = this.findLongBracketEnd(pos, level);
                if (end >= 0) {
                    return { type: "string", value: this.content.substring(pos, end), start: pos, end };
                }
            }
        }

        // Number
        if (c >= "0" && c <= "9") {
            let end = pos + 1;
            while (end < len && /[0-9A-Fa-fxX\.]/.test(this.content[end])) { end++; }
            // Allow exponent
            if (end < len && (this.content[end] === "e" || this.content[end] === "E" || this.content[end] === "p" || this.content[end] === "P")) {
                end++;
                if (this.content[end] === "+" || this.content[end] === "-") { end++; }
                while (end < len && /[0-9]/.test(this.content[end])) { end++; }
            }
            return { type: "number", value: this.content.substring(pos, end), start: pos, end };
        }

        // Single-char punctuation / operator
        return { type: "punctuation", value: c, start: pos, end: pos + 1 };
    }

    private isIdentStart(c: string): boolean {
        return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
    }

    private isIdentCont(c: string): boolean {
        return this.isIdentStart(c) || (c >= "0" && c <= "9");
    }

    /**
     * Replace characters in [start, end) with spaces, preserving newlines so
     * line numbers in the file (and therefore any future runtime line traces)
     * remain stable.
     */
    private blankRange(start: number, end: number): void {
        if (start < 0 || end > this.content.length || start >= end) { return; }
        const before = this.content.substring(0, start);
        const middle = this.content.substring(start, end);
        const after = this.content.substring(end);
        const blanked = middle.replace(/[^\n]/g, " ");
        this.content = before + blanked + after;
    }

    /**
     * Strip Lua comments while preserving line breaks so line numbers stay
     * aligned with the original file.
     */
    private stripCommentsFromContent(input: string): string {
        const out: string[] = [];
        const len = input.length;
        let i = 0;
        while (i < len) {
            const c = input[i];

            // Single / double-quoted string passthrough
            if (c === '"' || c === "'") {
                const start = i;
                i++;
                while (i < len) {
                    const ch = input[i];
                    if (ch === "\\") { i += 2; continue; }
                    if (ch === c) { i++; break; }
                    if (ch === "\n") { break; }
                    i++;
                }
                out.push(input.substring(start, i));
                continue;
            }

            // Long-bracket string passthrough
            if (c === "[") {
                const level = this.peekLongBracketLevel(input, i);
                if (level >= 0) {
                    const end = this.peekLongBracketEnd(input, i, level);
                    const finalEnd = end >= 0 ? end : len;
                    out.push(input.substring(i, finalEnd));
                    i = finalEnd;
                    continue;
                }
            }

            // Comment
            if (c === "-" && input[i + 1] === "-") {
                // Long comment?
                if (input[i + 2] === "[") {
                    const level = this.peekLongBracketLevel(input, i + 2);
                    if (level >= 0) {
                        const end = this.peekLongBracketEnd(input, i + 2, level);
                        const finalEnd = end >= 0 ? end : len;
                        const removed = input.substring(i, finalEnd);
                        // Preserve newlines only
                        for (const ch of removed) {
                            if (ch === "\n") { out.push("\n"); }
                        }
                        i = finalEnd;
                        continue;
                    }
                }
                // Short comment: blank to end of line (but keep the newline)
                while (i < len && input[i] !== "\n") { i++; }
                continue;
            }

            out.push(c);
            i++;
        }
        return out.join("");
    }

    /**
     * Strip leading whitespace and drop blank lines, while preserving the
     * exact contents of quoted and long-bracket strings. Trailing whitespace
     * on a line is also removed. Each non-empty source line still becomes a
     * single non-empty output line so line-based crash messages remain
     * readable.
     */
    private minifyWhitespace(input: string): string {
        const out: string[] = [];
        const len = input.length;
        let i = 0;
        // Buffer per output line; we only commit a line if it has non-whitespace content
        let lineBuf: string[] = [];
        let lineHasContent = false;
        const flushLine = () => {
            if (lineHasContent) {
                let line = lineBuf.join("");
                line = line.replace(/[\t ]+$/, "");
                out.push(line);
                out.push("\n");
            }
            lineBuf = [];
            lineHasContent = false;
        };
        while (i < len) {
            const c = input[i];

            // Long-bracket string passthrough — preserve verbatim including any newlines inside
            if (c === "[") {
                const level = this.peekLongBracketLevel(input, i);
                if (level >= 0) {
                    const end = this.peekLongBracketEnd(input, i, level);
                    const finalEnd = end >= 0 ? end : len;
                    const chunk = input.substring(i, finalEnd);
                    // The string itself may contain newlines: split, flush each line
                    const parts = chunk.split("\n");
                    for (let k = 0; k < parts.length; k++) {
                        lineBuf.push(parts[k]);
                        if (parts[k].length > 0) { lineHasContent = true; }
                        if (k < parts.length - 1) { flushLine(); lineHasContent = true; /* preserve string newline by keeping the (possibly empty) next line live */ }
                    }
                    i = finalEnd;
                    continue;
                }
            }

            // Single/double-quoted string passthrough
            if (c === '"' || c === "'") {
                const start = i;
                i++;
                while (i < len) {
                    const ch = input[i];
                    if (ch === "\\") { i += 2; continue; }
                    if (ch === c) { i++; break; }
                    if (ch === "\n") { break; }
                    i++;
                }
                lineBuf.push(input.substring(start, i));
                lineHasContent = true;
                continue;
            }

            if (c === "\n") {
                flushLine();
                i++;
                continue;
            }

            if ((c === " " || c === "\t") && !lineHasContent) {
                // Skip leading whitespace
                i++;
                continue;
            }

            lineBuf.push(c);
            if (c !== " " && c !== "\t") { lineHasContent = true; }
            i++;
        }
        flushLine();
        return out.join("");
    }

    private peekLongBracketLevel(s: string, pos: number): number {
        if (s[pos] !== "[") { return -1; }
        let p = pos + 1;
        let level = 0;
        while (s[p] === "=") { level++; p++; }
        if (s[p] === "[") { return level; }
        return -1;
    }

    private peekLongBracketEnd(s: string, startOffset: number, level: number): number {
        let p = startOffset + 2 + level;
        const len = s.length;
        while (p < len) {
            if (s[p] === "]") {
                let count = 0;
                let q = p + 1;
                while (s[q] === "=") { count++; q++; }
                if (count === level && s[q] === "]") { return q + 1; }
            }
            p++;
        }
        return -1;
    }
}
