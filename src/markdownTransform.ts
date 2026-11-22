export function toHumanMarkdown(markdown: string): string {
  const normalized = normalizeLineEndings(markdown);
  const lines = removeThematicBreaksBeforeHeadings(normalized.split("\n"));

  const result: string[] = [];
  let tableBuffer: string[] = [];
  let blankCount = 0;
  let inFence = false;
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

    if (isFenceLine(line)) {
      flushTable();
      inFence = !inFence;
      result.push(line.trimEnd());
      blankCount = 0;
      continue;
    }

    if (inFence) {
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

export function toCompactMarkdown(markdown: string): string {
  const normalized = normalizeLineEndings(markdown);
  const lines = removeThematicBreaksBeforeHeadings(normalized.split("\n"));

  const result: string[] = [];
  const listIndentStack: number[] = [];
  const protectedListState: ProtectedListState = { indentStack: [], baseIndent: 0 };
  const htmlCommentState = { inComment: false };
  let blankPending = false;
  let inFence = false;
  let fenceLanguage = "";
  let inFrontmatter = false;
  let inProtectedBlock = false;
  let protectedBlockTag = "";
  let protectedBlockStartIndex = -1;

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

    const protectedTag = getProtectedBlockOpenTag(line, lines, index);
    if (!inFence && !inProtectedBlock && protectedTag !== "") {
      listIndentStack.length = 0;
      if (result.length > 0 && (blankPending || isListItemLine(result[result.length - 1]))) {
        result.push("");
      }
      blankPending = false;
      inProtectedBlock = true;
      protectedBlockTag = protectedTag;
      protectedBlockStartIndex = result.length;
      resetProtectedListState(protectedListState);
      result.push(line.trimEnd());
      continue;
    }

    if (inProtectedBlock) {
      if (isProtectedBlockClose(line, protectedBlockTag)) {
        stripUniformProtectedIndent(result, protectedBlockStartIndex + 1);
        inProtectedBlock = false;
        protectedBlockTag = "";
        protectedBlockStartIndex = -1;
        resetProtectedListState(protectedListState);
        result.push(line.trimEnd());
        continue;
      }

      const cleaned = compactProtectedBlockLine(line, protectedListState);
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

    if (isFenceLine(line)) {
      listIndentStack.length = 0;
      if (result.length > 0 && (blankPending || isListItemLine(result[result.length - 1]))) {
        result.push("");
      }

      blankPending = false;
      fenceLanguage = inFence ? "" : getFenceLanguage(line);

      if (!inFence && isMarkdownFenceLanguage(fenceLanguage)) {
        const fenceIndent = line.trimEnd().slice(0, line.trimEnd().length - line.trim().length);
        const fenceLines: string[] = [];

        result.push(line.trimEnd());
        inFence = true;

        for (index++; index < lines.length; index++) {
          if (isFenceLine(lines[index])) {
            const compacted = compactMarkdownFenceBlock(fenceLines, fenceIndent);
            result.push(...compacted);
            result.push(lines[index].trimEnd());
            inFence = false;
            fenceLanguage = "";
            break;
          }

          fenceLines.push(lines[index]);
        }

        continue;
      }

      inFence = !inFence;
      result.push(line.trimEnd());
      continue;
    }

    if (inFence) {
      result.push(compactFenceLine(line, fenceLanguage));
      continue;
    }

    const withoutComment = removeHtmlComments(line, htmlCommentState);
    const cleaned = compactWhitespace(withoutComment, listIndentStack);

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

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function removeThematicBreaksBeforeHeadings(lines: string[]): string[] {
  const frontmatterBreaks = getFrontmatterBreakIndexes(lines);
  const result: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    if (frontmatterBreaks.has(index)) {
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

function removeHtmlComments(line: string, state: { inComment: boolean }): string {
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

    const commentStart = remaining.indexOf("<!--");
    if (commentStart < 0) {
      return output + remaining;
    }

    output += remaining.slice(0, commentStart);
    remaining = remaining.slice(commentStart + 4);
    state.inComment = true;
  }

  return output;
}

function compactWhitespace(line: string, listIndentStack: number[]): string {
  const withoutTabs = line.replace(/\t/g, "  ").trimEnd();
  const content = withoutTabs.trimStart();

  if (content === "") {
    return "";
  }

  if (content.startsWith("|")) {
    listIndentStack.length = 0;
    return compactTableLine(content);
  }

  if (/^([-*+]|\d+\.)\s+/.test(content)) {
    const rawIndent = withoutTabs.length - content.length;
    const normalizedIndent = " ".repeat(getListLevel(rawIndent, listIndentStack) * 2);
    return `${normalizedIndent}${compactListItem(content)}`;
  }

  if (content.startsWith(">")) {
    listIndentStack.length = 0;
    return compactBlockquote(content);
  }

  listIndentStack.length = 0;
  return compactInlinePunctuation(content.replace(/ {2,}/g, " "));
}

function compactTableLine(line: string): string {
  const cells = line
    .slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => compactInlinePunctuation(cell.trim()));
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

interface ProtectedListState {
  indentStack: number[];
  baseIndent: number;
}

function compactProtectedBlockLine(line: string, listState: ProtectedListState): string {
  const withoutTabs = line.replace(/\t/g, "  ").trimEnd();
  const content = withoutTabs.trimStart();
  const indent = withoutTabs.slice(0, withoutTabs.length - content.length);

  if (content.startsWith("|")) {
    resetProtectedListState(listState);
    return `${indent}${compactTableLine(content)}`;
  }

  if (/^([-*+]|\d+\.)\s+/.test(content)) {
    const rawIndent = withoutTabs.length - content.length;
    const level = getListLevel(rawIndent, listState.indentStack);
    if (level === 0) {
      listState.baseIndent = rawIndent;
    }
    const normalizedIndent = " ".repeat(listState.baseIndent + level * 2);
    return `${normalizedIndent}${compactProtectedListItem(content)}`;
  }

  resetProtectedListState(listState);
  return compactProtectedInlinePunctuation(withoutTabs);
}

function resetProtectedListState(state: ProtectedListState): void {
  state.indentStack.length = 0;
  state.baseIndent = 0;
}

function shouldInsertProtectedHeadingBlankBefore(current: string, previous: string): boolean {
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
  return compactProtectedInlinePunctuation(line.replace(/^([-*+]|\d+\.)\s+/, "$1 "));
}

function compactProtectedInlinePunctuation(line: string): string {
  return compactLinks(
    processOutsideInlineCode(line, (segment) => compactWordConnectors(segment.replace(/,\s+/g, ",").replace(/;\s+/g, ";"))),
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
  let inFence = false;
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

    if (isFenceLine(line)) {
      if (!inFence) {
        pushBlankBeforeIfNeeded(result, line);
      }
      result.push(line);
      inFence = !inFence;
      continue;
    }

    if (inFence) {
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
  const listIndentStack: number[] = [];
  const htmlCommentState = { inComment: false };
  let blankPending = false;

  for (const rawLine of removeThematicBreaksBeforeHeadings(lines)) {
    const hasTrailingDoubleSpace = /  +$/.test(rawLine);
    const trimmedEnd = rawLine.trimEnd();
    const content = trimmedEnd.trimStart();
    const lineIndent = trimmedEnd.slice(0, trimmedEnd.length - content.length);

    const withoutComment = removeHtmlComments(content, htmlCommentState);
    const reindented = lineIndent.length > indent.length
      ? " ".repeat(lineIndent.length - indent.length) + withoutComment
      : withoutComment;
    const cleaned = compactWhitespace(reindented, listIndentStack);

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
  return processOutsideInlineCode(line, (segment) =>
    compactLinks(compactWordConnectors(segment.replace(/,\s+/g, ",").replace(/;\s+/g, ";").replace(/\s*\/\s*/g, "/"))),
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
  const withCheckboxes = line
    .replace(/\[\s*([ xX])\s*\]/g, "[$1]")
    .replace(/\[ \]/g, "[]");

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

function getFenceLanguage(line: string): string {
  return line
    .trim()
    .replace(/^`{3,}|^~{3,}/, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function isMarkdownFenceLanguage(language: string): boolean {
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
  return compactInlinePunctuation(line.replace(/^([*+])\s+/, "- ").replace(/ {2,}/g, " "));
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
  const content = compactInlinePunctuation(line.slice(index).trimStart().replace(/ {2,}/g, " "));

  return `${marker}${content}`.trimEnd();
}

function getListLevel(rawIndent: number, listIndentStack: number[]): number {
  if (listIndentStack.length === 0) {
    listIndentStack.push(rawIndent);
    return 0;
  }

  const existingLevel = listIndentStack.indexOf(rawIndent);
  if (existingLevel >= 0) {
    listIndentStack.length = existingLevel + 1;
    return existingLevel;
  }

  if (rawIndent > listIndentStack[listIndentStack.length - 1]) {
    listIndentStack.push(rawIndent);
    return listIndentStack.length - 1;
  }

  while (listIndentStack.length > 1 && rawIndent < listIndentStack[listIndentStack.length - 1]) {
    listIndentStack.pop();
  }

  if (rawIndent > listIndentStack[listIndentStack.length - 1]) {
    listIndentStack.push(rawIndent);
    return listIndentStack.length - 1;
  }

  if (rawIndent <= listIndentStack[0]) {
    listIndentStack.length = 1;
    listIndentStack[0] = rawIndent;
    return 0;
  }

  listIndentStack[listIndentStack.length - 1] = rawIndent;
  return listIndentStack.length - 1;
}

function shouldKeepBlankBefore(current: string, previous: string, blankPending: boolean): boolean {
  const currentIsTable = isTableLine(current);
  const previousIsTable = isTableLine(previous);
  const currentIsHeading = isHeadingLine(current);
  const previousIsHeading = isHeadingLine(previous);
  const currentIsThematicBreak = isThematicBreakLine(current);
  const previousIsThematicBreak = isThematicBreakLine(previous);
  const currentIsBlockquote = isBlockquoteLine(current);
  const previousIsBlockquote = isBlockquoteLine(previous);
  const currentIsListItem = isListItemLine(current);
  const previousIsListItem = isListItemLine(previous);

  if (previousIsListItem && !currentIsListItem) {
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
  return /^(?: {2})*(?:[-*+]|\d+\.)\s+/.test(line);
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
