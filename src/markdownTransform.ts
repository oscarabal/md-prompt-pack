export function toHumanMarkdown(markdown: string): string {
  const normalized = normalizeLineEndings(markdown);
  const lines = removeThematicBreaksBeforeHeadings(normalized.split("\n"));

  const result: string[] = [];
  let tableBuffer: string[] = [];
  let blankCount = 0;
  let fence: FenceInfo | null = null;
  let inFrontmatter = false;

  const flushTable = (): void => {
    if (tableBuffer.length === 0) {
      return;
    }

    result.push(...expandTableBlock(tableBuffer));
    tableBuffer = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (index === 0 && line.trim() === "---") {
      flushTable();
      inFrontmatter = true;
      result.push(line);
      blankCount = 0;
      continue;
    }

    if (inFrontmatter) {
      result.push(line);
      if (index > 0 && line.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    const humanFence = fenceTransition(line, fence);
    if (humanFence.delimiter) {
      flushTable();
      fence = humanFence.open;
      result.push(line.trimEnd());
      blankCount = 0;
      continue;
    }

    if (fence !== null) {
      result.push(line);
      continue;
    }

    const cleaned = line.trimEnd();

    if (cleaned.trim() === "") {
      flushTable();
      blankCount++;
      if (blankCount <= 1) {
        result.push("");
      }
      continue;
    }

    blankCount = 0;

    const content = cleaned.trimStart();
    if (isTableLine(content)) {
      tableBuffer.push(content);
      continue;
    }

    flushTable();
    result.push(cleaned);
  }

  flushTable();

  return ensureTrailingNewline(insertSemanticBlanks(result).join("\n"));
}

export interface CompactOptions {
  /**
   * Aggressive punctuation rules: remove spaces after `,` `;` `:`, around `/` and around word
   * connectors (`-` `+` `<` `>` `→` `—`), and collapse `[ ]` to `[]`. They save characters but
   * rarely tokens, and can change meaning (`x - 1` → `x-1`, `key: value` → `key:value`).
   * Default: false.
   */
  punctuation?: boolean;
  /**
   * Blank line policy outside code. `readable` (default) keeps blank lines around headings,
   * code fences and other semantic blocks. `minimal` keeps only the blank lines Markdown needs
   * to parse the same way (e.g. before a paragraph that follows a list, table or blockquote).
   */
  blankLines?: "readable" | "minimal";
  /**
   * Minify ```json fences that contain valid JSON by removing whitespace outside strings.
   * Invalid JSON (comments, placeholders, trailing commas) and fences inside protected blocks
   * are left untouched. Default: false.
   */
  minifyJson?: boolean;
}

let activeOptions: Required<CompactOptions> = { punctuation: false, blankLines: "readable", minifyJson: false };

export function toCompactMarkdown(markdown: string, options: CompactOptions = {}): string {
  const previousOptions = activeOptions;
  activeOptions = {
    punctuation: options.punctuation ?? false,
    blankLines: options.blankLines ?? "readable",
    minifyJson: options.minifyJson ?? false,
  };
  try {
    return compactMarkdownDocument(markdown);
  } finally {
    activeOptions = previousOptions;
  }
}

function compactMarkdownDocument(markdown: string): string {
  const normalized = normalizeLineEndings(markdown);
  const lines = removeThematicBreaksBeforeHeadings(normalized.split("\n"));

  const result: string[] = [];
  const listContext: ListContext = [];
  const protectedListContext: ListContext = [];
  const htmlCommentState = { inComment: false };
  let blankPending = false;
  let fence: FenceInfo | null = null;
  let fenceLanguage = "";
  let protectedFence: FenceInfo | null = null;
  let inFrontmatter = false;
  let inProtectedBlock = false;
  let protectedBlockTag = "";
  let protectedBlockStartIndex = -1;
  // Depth of XML-like prompt tags (<TASK>, <context>, ...) currently open. Prose inside them is
  // often indented for readability, so indented-code detection is disabled there.
  let xmlTagDepth = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (index === 0 && line.trim() === "---") {
      inFrontmatter = true;
      result.push(line.trimEnd());
      continue;
    }

    if (inFrontmatter) {
      result.push(line.trimEnd());
      if (index > 0 && line.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    const protectedTag = fence === null && !inProtectedBlock ? getProtectedBlockOpenTag(line, lines, index) : "";
    if (protectedTag !== "") {
      listContext.length = 0;
      if (result.length > 0 && (blankPending || isListItemLine(result[result.length - 1]))) {
        result.push("");
      }
      blankPending = false;
      inProtectedBlock = true;
      protectedBlockTag = protectedTag;
      protectedBlockStartIndex = result.length;
      protectedListContext.length = 0;
      protectedFence = null;
      result.push(line.trimEnd());
      continue;
    }

    if (inProtectedBlock) {
      // Code fences inside protected blocks are copied verbatim (only trailing whitespace is trimmed).
      const protectedFenceStep = fenceTransition(line, protectedFence);
      if (protectedFenceStep.delimiter || protectedFence !== null) {
        if (protectedFenceStep.delimiter) {
          protectedListContext.length = 0;
        }
        protectedFence = protectedFenceStep.open;
        result.push(line.trimEnd());
        continue;
      }

      if (isProtectedBlockClose(line, protectedBlockTag)) {
        stripUniformProtectedIndent(result, protectedBlockStartIndex + 1);
        inProtectedBlock = false;
        protectedBlockTag = "";
        protectedBlockStartIndex = -1;
        protectedListContext.length = 0;
        result.push(line.trimEnd());
        continue;
      }

      const cleaned = compactProtectedBlockLine(line, protectedListContext);
      if (cleaned === "") {
        continue;
      }

      if (
        result.length > 0 &&
        shouldInsertProtectedHeadingBlankBefore(cleaned, result[result.length - 1])
      ) {
        result.push("");
      }

      result.push(cleaned);
      continue;
    }

    if (fence !== null) {
      if (isFenceClose(line, fence)) {
        fence = null;
        fenceLanguage = "";
        result.push(line.trimEnd());
        continue;
      }

      result.push(compactFenceLine(line, fenceLanguage));
      continue;
    }

    const fenceOpen = htmlCommentState.inComment ? null : parseFenceOpen(line);
    if (fenceOpen !== null) {
      listContext.length = 0;
      // A fence can interrupt a paragraph or end a list, so minimal mode needs no blank before it.
      if (
        activeOptions.blankLines === "readable" &&
        result.length > 0 &&
        (blankPending || isListItemLine(result[result.length - 1]))
      ) {
        result.push("");
      }

      blankPending = false;
      fenceLanguage = getFenceLanguage(line);
      result.push(line.trimEnd());

      if (isMarkdownFenceLanguage(fenceLanguage)) {
        const fenceIndent = line.trimEnd().slice(0, line.trimEnd().length - line.trim().length);
        const fenceLines: string[] = [];
        let closingLine: string | null = null;

        for (index++; index < lines.length; index++) {
          if (isFenceClose(lines[index], fenceOpen)) {
            closingLine = lines[index].trimEnd();
            break;
          }

          fenceLines.push(lines[index]);
        }

        result.push(...compactMarkdownFenceBlock(fenceLines, fenceIndent));
        if (closingLine !== null) {
          result.push(closingLine);
        }
        fenceLanguage = "";
        continue;
      }

      if (activeOptions.minifyJson && fenceLanguage === "json") {
        const closeIndex = findFenceClose(lines, index + 1, fenceOpen);
        const minified = closeIndex < 0 ? null : tryMinifyJson(lines.slice(index + 1, closeIndex).join("\n"));

        if (minified !== null) {
          const fenceIndent = line.slice(0, line.length - line.trimStart().length);
          result.push(`${fenceIndent}${minified}`);
          result.push(lines[closeIndex].trimEnd());
          index = closeIndex;
          fenceLanguage = "";
          continue;
        }
      }

      fence = fenceOpen;
      continue;
    }

    if (isXmlOpenTagLine(line)) {
      xmlTagDepth++;
    } else if (isXmlCloseTagLine(line)) {
      xmlTagDepth = Math.max(0, xmlTagDepth - 1);
    }

    if (
      !htmlCommentState.inComment &&
      xmlTagDepth === 0 &&
      listContext.length === 0 &&
      isIndentedCodeLine(line) &&
      (result.length === 0 || blankPending || isHeadingLine(result[result.length - 1]))
    ) {
      // Indented code block (4+ columns after a blank line): copy verbatim. It cannot interrupt
      // a paragraph, so it needs a blank before it unless it follows a heading.
      if (
        result.length > 0 &&
        (activeOptions.blankLines === "readable" || !isHeadingLine(result[result.length - 1]))
      ) {
        result.push("");
      }

      let end = index;
      for (let next = index + 1; next < lines.length; next++) {
        if (isIndentedCodeLine(lines[next])) {
          end = next;
        } else if (lines[next].trim() !== "") {
          break;
        }
      }

      for (; index <= end; index++) {
        result.push(lines[index].trimEnd());
      }
      index = end;
      blankPending = false;
      continue;
    }

    const withoutComment = removeHtmlComments(line, htmlCommentState);
    const cleaned = compactWhitespace(withoutComment, listContext);

    if (cleaned === "") {
      blankPending = true;
      continue;
    }

    if (result.length > 0 && shouldKeepBlankBefore(cleaned, result[result.length - 1], blankPending)) {
      result.push("");
    }

    blankPending = false;
    result.push(cleaned);
  }

  return ensureTrailingNewline(result.join("\n"));
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function removeThematicBreaksBeforeHeadings(lines: string[]): string[] {
  const frontmatterBreaks = getFrontmatterBreakIndexes(lines);
  const result: string[] = [];
  let fence: FenceInfo | null = null;

  for (let index = 0; index < lines.length; index++) {
    if (frontmatterBreaks.has(index)) {
      result.push(lines[index]);
      continue;
    }

    const step = fenceTransition(lines[index], fence);
    if (step.delimiter || fence !== null) {
      fence = step.open;
      result.push(lines[index]);
      continue;
    }

    if (isThematicBreakLine(lines[index])) {
      let next = index + 1;
      while (next < lines.length && lines[next].trim() === "") {
        next++;
      }

      if (next < lines.length && isHeadingLine(lines[next])) {
        index = next - 1;
        continue;
      }
    }

    result.push(lines[index]);
  }

  return result;
}

function getFrontmatterBreakIndexes(lines: string[]): Set<number> {
  const indexes = new Set<number>();
  if (lines[0]?.trim() !== "---") {
    return indexes;
  }

  for (let index = 1; index < lines.length; index++) {
    if (lines[index].trim() === "---") {
      indexes.add(0);
      indexes.add(index);
      return indexes;
    }
  }

  return indexes;
}

function isFenceLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

export interface FenceInfo {
  char: string;
  length: number;
}

/** Parses an opening code fence. A closing fence must use the same character and be at least as long. */
export function parseFenceOpen(line: string): FenceInfo | null {
  const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  if (match === null) {
    return null;
  }

  // Backtick fences cannot have backticks in their info string (CommonMark).
  if (match[1][0] === "`" && match[2].includes("`")) {
    return null;
  }

  return { char: match[1][0], length: match[1].length };
}

export function isFenceClose(line: string, fence: FenceInfo): boolean {
  const match = line.trim().match(/^(`{3,}|~{3,})$/);
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length;
}

function findFenceClose(lines: string[], fromIndex: number, fence: FenceInfo): number {
  for (let index = fromIndex; index < lines.length; index++) {
    if (isFenceClose(lines[index], fence)) {
      return index;
    }
  }

  return -1;
}

/** Returns the minified JSON, or null when the text is empty or not valid JSON. */
export function tryMinifyJson(text: string): string | null {
  if (text.trim() === "") {
    return null;
  }

  try {
    JSON.parse(text);
  } catch {
    return null;
  }

  return minifyJsonText(text);
}

/**
 * Removes whitespace outside JSON strings. Unlike JSON.stringify(JSON.parse(text)), it keeps
 * numbers (`1.0`, big integers), key order and duplicate keys exactly as written.
 */
function minifyJsonText(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
    } else if (!/\s/.test(char)) {
      output += char;
    }
  }

  return output;
}

/** Advances fence state for one line. `delimiter` is true when the line opens or closes a fence. */
function fenceTransition(line: string, open: FenceInfo | null): { open: FenceInfo | null; delimiter: boolean } {
  if (open !== null) {
    return isFenceClose(line, open) ? { open: null, delimiter: true } : { open, delimiter: false };
  }

  const opened = parseFenceOpen(line);
  return opened === null ? { open: null, delimiter: false } : { open: opened, delimiter: true };
}

function leadingColumns(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") {
      columns++;
    } else if (char === "\t") {
      columns += 4 - (columns % 4);
    } else {
      break;
    }
  }
  return columns;
}

function isIndentedCodeLine(line: string): boolean {
  return line.trim() !== "" && leadingColumns(line) >= 4;
}

export function removeHtmlComments(line: string, state: { inComment: boolean }): string {
  let output = "";
  let remaining = line;

  while (remaining.length > 0) {
    if (state.inComment) {
      const commentEnd = remaining.indexOf("-->");
      if (commentEnd < 0) {
        return output;
      }

      remaining = remaining.slice(commentEnd + 3);
      state.inComment = false;
      continue;
    }

    const commentStart = indexOfOutsideInlineCode(remaining, "<!--");
    if (commentStart < 0) {
      return output + remaining;
    }

    output += remaining.slice(0, commentStart);
    remaining = remaining.slice(commentStart + 4);
    state.inComment = true;
  }

  return output;
}

function indexOfOutsideInlineCode(text: string, needle: string): number {
  let index = 0;
  while (index < text.length) {
    if (text[index] === "`") {
      const run = text.slice(index).match(/^`+/)![0];
      const closing = text.indexOf(run, index + run.length);
      if (closing >= 0) {
        index = closing + run.length;
        continue;
      }
      index += run.length;
      continue;
    }

    if (text.startsWith(needle, index)) {
      return index;
    }
    index++;
  }

  return -1;
}

function compactWhitespace(line: string, listContext: ListContext): string {
  const withoutTabs = line.replace(/\t/g, "  ").trimEnd();
  const content = withoutTabs.trimStart();

  if (content === "") {
    return "";
  }

  if (content.startsWith("|")) {
    listContext.length = 0;
    return compactTableLine(content);
  }

  const rawIndent = withoutTabs.length - content.length;

  if (isAnyThematicBreak(content)) {
    listContext.length = 0;
    return content;
  }

  if (LIST_ITEM_PATTERN.test(content)) {
    const outIndent = pushListItem(listContext, rawIndent, content, 0);
    return `${" ".repeat(outIndent)}${compactListItem(content)}`;
  }

  if (content.startsWith(">")) {
    listContext.length = 0;
    return compactBlockquote(content);
  }

  // Indented continuation of a list item: keep it aligned with the item content.
  const continuationIndent = getListContinuationIndent(listContext, rawIndent);
  return `${" ".repeat(continuationIndent)}${compactInlinePunctuation(collapseSpaces(content))}`;
}

const LIST_ITEM_PATTERN = /^([-*+]|\d{1,9}[.)])(\s+)/;

/** Thematic breaks such as `***`, `* * *`, `- - -` or `___` (kept as written). */
function isAnyThematicBreak(content: string): boolean {
  return /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(content);
}

/** Collapses repeated spaces outside inline code spans. */
function collapseSpaces(text: string): string {
  return processOutsideInlineCode(text, (segment) => segment.replace(/ {2,}/g, " "));
}

// A bare URL, plus the space after it when it ends in `,`, `;` or `:` (so "https://a.com, b"
// is not glued into "https://a.com,b", which would extend the autolink).
const BARE_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>`()\[\]]+(?:(?<=[,;:])\s)?/g;

function processOutsideUrls(text: string, transform: (segment: string) => string): string {
  let output = "";
  let last = 0;
  for (const match of text.matchAll(BARE_URL_PATTERN)) {
    output += transform(text.slice(last, match.index));
    output += match[0];
    last = match.index! + match[0].length;
  }
  return output + transform(text.slice(last));
}

interface ListItemContext {
  rawIndent: number;
  rawContentColumn: number;
  outContentColumn: number;
}

type ListContext = ListItemContext[];

/**
 * Registers a list item and returns its output indentation. Nesting follows CommonMark:
 * an item is a child when it is indented at least to the parent's content column, and
 * children are re-indented to the parent's (normalized) content column, e.g. 2 for "- "
 * and 3 for "1. ".
 */
function pushListItem(context: ListContext, rawIndent: number, content: string, rootIndent: number): number {
  const match = content.match(LIST_ITEM_PATTERN)!;
  const marker = match[1];
  const spacing = match[2].length > 4 ? 1 : match[2].length;

  while (context.length > 0 && rawIndent < context[context.length - 1].rawContentColumn) {
    context.pop();
  }

  const parent = context[context.length - 1];
  const outIndent = parent === undefined ? rootIndent : parent.outContentColumn;
  const normalizedMarkerLength = /^[*+]$/.test(marker) ? 1 : marker.length;

  context.push({
    rawIndent,
    rawContentColumn: rawIndent + marker.length + spacing,
    outContentColumn: outIndent + normalizedMarkerLength + 1,
  });

  return outIndent;
}

/** Returns the indentation for a non-item line, closing list items it does not belong to. */
function getListContinuationIndent(context: ListContext, rawIndent: number): number {
  while (context.length > 0 && rawIndent < context[context.length - 1].rawContentColumn) {
    context.pop();
  }

  return context.length === 0 ? 0 : context[context.length - 1].outContentColumn;
}

/** Splits a table row on unescaped pipes (`\|` stays inside its cell). */
function splitTableRow(line: string): string[] {
  const body = line.slice(1, line.endsWith("|") && !line.endsWith("\\|") ? -1 : undefined);
  return body.split(/(?<!\\)\|/);
}

function compactTableLine(line: string): string {
  const cells = splitTableRow(line).map((cell) => compactInlinePunctuation(cell.trim()));
  const keepTrailingPipe = cells[cells.length - 1] === "";

  if (cells.every(isTableSeparatorCell)) {
    return formatCompactTableCells(cells.map(normalizeTableSeparatorCell), keepTrailingPipe);
  }

  return formatCompactTableCells(cells, keepTrailingPipe);
}

function formatCompactTableCells(cells: string[], keepTrailingPipe: boolean): string {
  const trailing = keepTrailingPipe ? "|" : "";
  return `|${cells.join("|")}${trailing}`;
}

function compactProtectedBlockLine(line: string, listContext: ListContext): string {
  const withoutTabs = line.replace(/\t/g, "  ").trimEnd();
  const content = withoutTabs.trimStart();
  const indent = withoutTabs.slice(0, withoutTabs.length - content.length);

  if (content.startsWith("|")) {
    listContext.length = 0;
    return `${indent}${compactTableLine(content)}`;
  }

  if (LIST_ITEM_PATTERN.test(content)) {
    const rawIndent = withoutTabs.length - content.length;
    // First-level items keep their own indentation; children align with their parent's content.
    const outIndent = pushListItem(listContext, rawIndent, content, rawIndent);
    return `${" ".repeat(outIndent)}${compactProtectedListItem(content)}`;
  }

  listContext.length = 0;
  return compactProtectedInlinePunctuation(withoutTabs);
}

function shouldInsertProtectedHeadingBlankBefore(current: string, previous: string): boolean {
  if (activeOptions.blankLines === "minimal") {
    return false;
  }

  const currentContent = current.trimStart();
  const previousContent = previous.trimStart();
  const currentIsHeading = isHeadingLine(currentContent);
  const previousIsHeading = isHeadingLine(previousContent);

  if (previous === "" || isXmlCloseTagLine(currentContent)) {
    return false;
  }

  if (currentIsHeading && !previousIsHeading && !isXmlOpenTagLine(previousContent)) {
    return true;
  }

  if (isH1OrH2Line(previousContent)) {
    return true;
  }

  return false;
}

function compactProtectedListItem(line: string): string {
  return compactProtectedInlinePunctuation(line.replace(LIST_ITEM_PATTERN, "$1 "));
}

function compactProtectedInlinePunctuation(line: string): string {
  if (!activeOptions.punctuation) {
    return compactLinks(line);
  }

  return compactLinks(
    processOutsideInlineCode(line, (segment) =>
      processOutsideUrls(segment, (part) => compactWordConnectors(part.replace(/,\s+/g, ",").replace(/;\s+/g, ";"))),
    ),
  );
}

function stripUniformProtectedIndent(lines: string[], startIndex: number): void {
  const candidates = lines.slice(startIndex).filter((line) => line.trim() !== "");
  if (candidates.length === 0) {
    return;
  }

  const minIndent = Math.min(...candidates.map(countLeadingSpaces));
  if (minIndent === 0) {
    return;
  }

  for (let index = startIndex; index < lines.length; index++) {
    if (lines[index].startsWith(" ".repeat(minIndent))) {
      lines[index] = lines[index].slice(minIndent);
    }
  }
}

function countLeadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

function expandTableBlock(lines: string[]): string[] {
  const rows = lines.map(parseTableCells);
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, () => 3);

  for (const row of rows) {
    const isSeparator = row.every(isTableSeparatorCell);
    for (let index = 0; index < columnCount; index++) {
      const cell = row[index] ?? "";
      const minimum = isSeparator ? getHumanSeparatorWidth(cell) : cell.length;
      widths[index] = Math.max(widths[index], minimum);
    }
  }

  return rows.map((row) => {
    if (row.every(isTableSeparatorCell)) {
      return `| ${widths.map((width, index) => expandTableSeparatorCell(row[index] ?? "---", width)).join(" | ")} |`;
    }

    return `| ${widths.map((width, index) => (row[index] ?? "").padEnd(width)).join(" | ")} |`;
  });
}

function parseTableCells(line: string): string[] {
  return line
    .slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
}

function getHumanSeparatorWidth(cell: string): number {
  const leftAlign = cell.startsWith(":");
  const rightAlign = cell.endsWith(":");

  if (leftAlign && rightAlign) {
    return 5;
  }

  if (leftAlign || rightAlign) {
    return 4;
  }

  return 3;
}

function expandTableSeparatorCell(cell: string, width: number): string {
  const leftAlign = cell.startsWith(":");
  const rightAlign = cell.endsWith(":");

  if (leftAlign && rightAlign) {
    return `:${"-".repeat(Math.max(width - 2, 3))}:`;
  }

  if (leftAlign) {
    return `:${"-".repeat(Math.max(width - 1, 3))}`;
  }

  if (rightAlign) {
    return `${"-".repeat(Math.max(width - 1, 3))}:`;
  }

  return "-".repeat(Math.max(width, 3));
}

function insertSemanticBlanks(lines: string[]): string[] {
  const result: string[] = [];
  let fence: FenceInfo | null = null;
  let inFrontmatter = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (index === 0 && line.trim() === "---") {
      result.push(line);
      inFrontmatter = true;
      continue;
    }

    if (inFrontmatter) {
      result.push(line);
      if (index > 0 && line.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    const step = fenceTransition(line, fence);
    if (step.delimiter) {
      if (fence === null) {
        pushBlankBeforeIfNeeded(result, line);
      }
      result.push(line);
      fence = step.open;
      continue;
    }

    if (fence !== null) {
      result.push(line);
      continue;
    }

    if (line.trim() === "") {
      if (result.length > 0 && result[result.length - 1] !== "") {
        result.push("");
      }
      continue;
    }

    pushBlankBeforeIfNeeded(result, line);
    result.push(line);
  }

  while (result.length > 1 && result[result.length - 1] === "") {
    result.pop();
  }

  return result;
}

function pushBlankBeforeIfNeeded(result: string[], current: string): void {
  if (result.length === 0) {
    return;
  }

  const previous = result[result.length - 1];
  if (previous === "" || !shouldHumanKeepBlankBefore(current, previous)) {
    return;
  }

  result.push("");
}

function shouldHumanKeepBlankBefore(current: string, previous: string): boolean {
  const currentIsTable = isTableLine(current);
  const previousIsTable = isTableLine(previous);
  const currentIsHeading = isHeadingLine(current);
  const previousIsHeading = isHeadingLine(previous);
  const currentIsBlockquote = isBlockquoteLine(current);
  const previousIsBlockquote = isBlockquoteLine(previous);
  const currentIsListItem = isListItemLine(current);
  const previousIsListItem = isListItemLine(previous);

  if (currentIsTable && previousIsTable) {
    return false;
  }

  if (currentIsBlockquote && previousIsBlockquote) {
    return false;
  }

  if (currentIsListItem && previousIsListItem) {
    return false;
  }

  return (
    (currentIsHeading && !previousIsHeading) ||
    (previousIsHeading && !currentIsHeading) ||
    isFenceLine(current) ||
    isFenceLine(previous) ||
    currentIsTable ||
    previousIsTable ||
    currentIsBlockquote ||
    previousIsBlockquote ||
    isThematicBreakLine(current) ||
    isThematicBreakLine(previous) ||
    (previousIsListItem && !currentIsListItem)
  );
}

function compactFenceLine(line: string, fenceLanguage: string): string {
  const trimmedEnd = line.trimEnd();
  const content = trimmedEnd.trimStart();
  const indent = trimmedEnd.slice(0, trimmedEnd.length - content.length);

  if (isMarkdownFenceLanguage(fenceLanguage)) {
    if (content.startsWith("|")) {
      return `${indent}${compactTableLine(content)}`;
    }

    return `${indent}${compactInlinePunctuation(content)}`.trimEnd();
  }

  if (!content.startsWith("|")) {
    return trimmedEnd;
  }

  const cells = content
    .slice(1, content.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());

  if (!cells.every(isTableSeparatorCell)) {
    return trimmedEnd;
  }

  return `${indent}|${cells.map(normalizeTableSeparatorCell).join("|")}|`;
}

function compactMarkdownFenceBlock(lines: string[], indent: string): string[] {
  const result: string[] = [];
  const listContext: ListContext = [];
  const htmlCommentState = { inComment: false };
  let blankPending = false;
  let nestedFence: FenceInfo | null = null;

  for (const rawLine of removeThematicBreaksBeforeHeadings(lines)) {
    // Code fences nested inside a Markdown fence are copied verbatim.
    const nestedStep: { open: FenceInfo | null; delimiter: boolean } = htmlCommentState.inComment
      ? { open: nestedFence, delimiter: false }
      : fenceTransition(rawLine, nestedFence);
    if (nestedStep.delimiter || nestedFence !== null) {
      if (nestedStep.delimiter && nestedFence === null && result.length > 0 && blankPending) {
        result.push(indent);
      }
      nestedFence = nestedStep.open;
      listContext.length = 0;
      blankPending = false;
      result.push(rawLine.trimEnd());
      continue;
    }

    const hasTrailingDoubleSpace = /  +$/.test(rawLine);
    const trimmedEnd = rawLine.trimEnd();
    const content = trimmedEnd.trimStart();
    const lineIndent = trimmedEnd.slice(0, trimmedEnd.length - content.length);

    const withoutComment = removeHtmlComments(content, htmlCommentState);
    const reindented = lineIndent.length > indent.length
      ? " ".repeat(lineIndent.length - indent.length) + withoutComment
      : withoutComment;
    const cleaned = compactWhitespace(reindented, listContext);

    if (cleaned === "") {
      blankPending = true;
      continue;
    }

    if (result.length > 0) {
      const prevContent = result[result.length - 1].startsWith(indent)
        ? result[result.length - 1].slice(indent.length)
        : result[result.length - 1];
      if (shouldKeepBlankBefore(cleaned, prevContent, blankPending)) {
        result.push(indent);
      }
    }

    blankPending = false;
    const trailing = hasTrailingDoubleSpace && !isTableLine(cleaned) ? "  " : "";
    result.push(`${indent}${cleaned}${trailing}`);
  }

  return result;
}

function compactInlinePunctuation(line: string): string {
  if (!activeOptions.punctuation) {
    return processOutsideInlineCode(line, compactLinks);
  }

  return processOutsideInlineCode(line, (segment) =>
    processOutsideUrls(segment, (part) =>
      compactLinks(compactWordConnectors(part.replace(/,\s+/g, ",").replace(/;\s+/g, ";").replace(/([^:\s]|^)\s*\/\s*/g, "$1/"))),
    ),
  );
}

function compactWordConnectors(line: string): string {
  const word = "A-Za-z0-9À-ÖØ-öø-ÿ";
  const left = `${word})\`}"\u201D\u2019`;
  return line
    .replace(new RegExp(`([${left}])\\s*([-+<>→—])\\s*([${word}{])`, "g"), "$1$2$3")
    .replace(new RegExp(`([${word}])\\s*/\\s*([${word}])`, "g"), "$1/$2")
    .replace(new RegExp(`:\\s+([${word}{"\u201C])`, "g"), ":$1");
}

function compactLinks(line: string): string {
  const normalizedCheckboxes = line.replace(/\[\s*([ xX])\s*\]/g, "[$1]");
  const withCheckboxes = activeOptions.punctuation ? normalizedCheckboxes.replace(/\[ \]/g, "[]") : normalizedCheckboxes;

  return withCheckboxes
    .replace(/\[(?!\s*[ xX]\s*\])\s+/g, "[")
    .replace(/\s+\](?<!\[\s*[ xX]\s*\])/g, "]")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

function processOutsideInlineCode(line: string, transform: (segment: string) => string): string {
  const parts: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const backtickIndex = remaining.indexOf("`");
    if (backtickIndex < 0) {
      parts.push(transform(remaining));
      break;
    }

    const backtickLen = remaining.slice(backtickIndex).match(/^`+/)![0].length;
    const closing = remaining.indexOf("`".repeat(backtickLen), backtickIndex + backtickLen);

    if (closing < 0) {
      parts.push(transform(remaining));
      break;
    }

    parts.push(transform(remaining.slice(0, backtickIndex)));
    const inlineSpan = remaining.slice(backtickIndex, closing + backtickLen);
    parts.push(inlineSpan);
    remaining = remaining.slice(closing + backtickLen);
    // Transform the next external segment with the closing backtick as left context
    // so connectors immediately after inline code spans are compacted correctly.
    if (remaining.length > 0) {
      const nextBacktick = remaining.indexOf("`");
      const nextSegmentEnd = nextBacktick < 0 ? remaining.length : nextBacktick;
      const nextExternal = remaining.slice(0, nextSegmentEnd);
      const withContext = "`" + nextExternal;
      const transformed = transform(withContext);
      parts.push(transformed.slice(1)); // remove the leading backtick we added
      remaining = remaining.slice(nextSegmentEnd);
    }
    continue;
  }

  return parts.join("");
}

export function getFenceLanguage(line: string): string {
  return line
    .trim()
    .replace(/^`{3,}|^~{3,}/, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

export function isMarkdownFenceLanguage(language: string): boolean {
  return language === "md" || language === "markdown";
}

function isTableSeparatorCell(cell: string): boolean {
  return /^:?-{2,}:?$/.test(cell);
}

function normalizeTableSeparatorCell(cell: string): string {
  const leftAlign = cell.startsWith(":");
  const rightAlign = cell.endsWith(":");

  return `${leftAlign ? ":" : ""}--${rightAlign ? ":" : ""}`;
}

function compactListItem(line: string): string {
  return compactInlinePunctuation(collapseSpaces(line.replace(/^([*+])\s+/, "- ")));
}

function compactBlockquote(line: string): string {
  let index = 0;
  let depth = 0;

  while (index < line.length) {
    while (line[index] === " ") {
      index++;
    }

    if (line[index] !== ">") {
      break;
    }

    depth++;
    index++;
  }

  const marker = "> ".repeat(depth);
  const content = compactInlinePunctuation(collapseSpaces(line.slice(index).trimStart()));

  return `${marker}${content}`.trimEnd();
}

function shouldKeepBlankBefore(current: string, previous: string, blankPending: boolean): boolean {
  if (activeOptions.blankLines === "minimal") {
    return needsBlankBefore(current, previous, blankPending);
  }

  const currentIsTable = isTableLine(current);
  const previousIsTable = isTableLine(previous);
  const currentIsHeading = isHeadingLine(current);
  const previousIsHeading = isHeadingLine(previous);
  const currentIsThematicBreak = isThematicBreakLine(current);
  const previousIsThematicBreak = isThematicBreakLine(previous);
  const currentIsBlockquote = isBlockquoteLine(current);
  const previousIsBlockquote = isBlockquoteLine(previous);
  const currentIsListItem = isListItemLine(current);
  const previousInList = isListItemLine(previous) || isListContinuationLine(previous);

  // An indented continuation belongs to the list item above it: keep the source spacing
  // (a blank line means a new paragraph inside the item, no blank means the same paragraph).
  if (isListContinuationLine(current)) {
    return blankPending;
  }

  if (previousInList && !currentIsListItem) {
    return true;
  }

  if (isH1OrH2Line(previous)) {
    return true;
  }

  if (currentIsHeading && !previousIsHeading && !isXmlOpenTagLine(previous)) {
    return true;
  }

  if (isCriticalHeadingLine(current)) {
    return true;
  }

  if (!blankPending) {
    return false;
  }

  if (currentIsTable && previousIsTable) {
    return false;
  }

  if (currentIsBlockquote && previousIsBlockquote) {
    return false;
  }

  return (
    isFenceLine(current) ||
    isFenceLine(previous) ||
    currentIsTable ||
    previousIsTable ||
    currentIsHeading ||
    isH1OrH2Line(previous) ||
    currentIsThematicBreak ||
    previousIsThematicBreak ||
    currentIsBlockquote ||
    previousIsBlockquote
  );
}

/** A line that would be read as paragraph text (and so can lazily continue the block above). */
function isParagraphTextLine(line: string): boolean {
  return (
    !isHeadingLine(line) &&
    !isFenceLine(line) &&
    !isTableLine(line) &&
    !isBlockquoteLine(line) &&
    !isListItemLine(line) &&
    !isListContinuationLine(line) &&
    !isAnyThematicBreak(line.trim()) &&
    !isXmlTagLine(line)
  );
}

/**
 * Minimal blank line policy: keep a blank only where removing it would change how the
 * Markdown is parsed. Headings and code fences can interrupt any block, so they never need one.
 */
function needsBlankBefore(current: string, previous: string, blankPending: boolean): boolean {
  // List continuation: a blank separates paragraphs inside the item.
  if (isListContinuationLine(current)) {
    return blankPending;
  }

  const previousInList = isListItemLine(previous) || isListContinuationLine(previous);
  const currentCanBeAbsorbed = isParagraphTextLine(current) || isTableLine(current) || isXmlTagLine(current);

  // Without a blank, text after a list item, table row or blockquote is absorbed into it
  // (lazy continuation, or an extra table row).
  if (previousInList && (currentCanBeAbsorbed || isAnyThematicBreak(current.trim()))) {
    return true;
  }

  if (isTableLine(previous) && !isTableLine(current) && (isParagraphTextLine(current) || isXmlTagLine(current))) {
    return true;
  }

  if (isBlockquoteLine(previous) && !isBlockquoteLine(current) && isParagraphTextLine(current)) {
    return true;
  }

  if (!blankPending) {
    return false;
  }

  // An HTML block (started by a tag line) runs until a blank line, so keep the blank that ends it.
  if (isXmlCloseTagLine(previous)) {
    return true;
  }

  // Paragraph text followed by a table or `---` would become a table header or a setext heading.
  if (isParagraphTextLine(previous) && (isTableLine(current) || isAnyThematicBreak(current.trim()))) {
    return true;
  }

  // XML-like tags start HTML blocks, which cannot interrupt a paragraph and run until a blank line.
  return isXmlTagLine(current) && isParagraphTextLine(previous);
}

function isTableLine(line: string): boolean {
  return line.startsWith("|");
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s/.test(line.trimStart());
}

function isH1OrH2Line(line: string): boolean {
  return /^#{1,2}\s/.test(line.trimStart());
}

function isThematicBreakLine(line: string): boolean {
  return /^-{3,}$/.test(line.trim());
}

function isBlockquoteLine(line: string): boolean {
  return line.startsWith(">");
}

function isListItemLine(line: string): boolean {
  return /^ *(?:[-*+]|\d{1,9}[.)])\s+/.test(line);
}

/** An indented line that is not itself a list item (compact output only indents list content). */
function isListContinuationLine(line: string): boolean {
  return /^ +\S/.test(line) && !isListItemLine(line);
}

function isXmlOpenTagLine(line: string): boolean {
  return /^<[a-zA-Z][\w-]*>\s*$/.test(line.trim());
}

function isXmlTagLine(line: string): boolean {
  return /^<\/?[a-zA-Z][\w-]*>\s*$/.test(line.trim());
}

function isXmlCloseTagLine(line: string): boolean {
  return /^<\/[a-zA-Z][\w-]*>\s*$/.test(line.trim());
}

function isH2OrH3Line(line: string): boolean {
  return /^#{2,3}\s/.test(line);
}

const ALWAYS_PROTECTED_BLOCK_TAGS = ["output_template", "output-template", "prompt"];
const CONDITIONAL_PROTECTED_BLOCK_TAGS = [
  "acceptance_criteria",
  "acceptance-criteria",
  "context",
  "example",
  "files",
  "instructions",
  "output",
  "rules",
  "task",
];

function getProtectedBlockOpenTag(line: string, lines: string[], index: number): string {
  const tag = getOpenTagName(line);
  if (tag === "") {
    return "";
  }

  if (ALWAYS_PROTECTED_BLOCK_TAGS.includes(tag)) {
    return tag;
  }

  if (CONDITIONAL_PROTECTED_BLOCK_TAGS.includes(tag) && hasMatchingClose(tag, lines, index + 1)) {
    return tag;
  }

  return "";
}

function getOpenTagName(line: string): string {
  const match = line.trim().match(/^<([a-zA-Z][\w-]*)>\s*$/);
  return match === null ? "" : match[1].toLowerCase();
}

function hasMatchingClose(tag: string, lines: string[], fromIndex: number): boolean {
  for (let index = fromIndex; index < lines.length; index++) {
    if (isProtectedBlockClose(lines[index], tag)) {
      return true;
    }
  }

  return false;
}

function isProtectedBlockClose(line: string, expectedTag: string): boolean {
  const match = line.trim().match(/^<\/([a-zA-Z][\w-]*)>\s*$/);
  return match !== null && match[1].toLowerCase() === expectedTag;
}

const CRITICAL_HEADING_TEXTS = [
  "hard rules",
  "required inputs",
  "output template",
  "critical rules",
  "important",
];

function isCriticalHeadingLine(line: string): boolean {
  const match = line.match(/^#{1,6}\s+(.+)$/);
  if (!match) {
    return false;
  }
  return CRITICAL_HEADING_TEXTS.includes(match[1].trim().toLowerCase());
}
