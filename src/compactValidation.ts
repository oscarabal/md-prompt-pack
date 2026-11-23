import {
  FenceInfo,
  getFenceLanguage,
  isFenceClose,
  isMarkdownFenceLanguage,
  isSetextTitleLine,
  normalizeLineEndings,
  parseFenceOpen,
  removeHtmlComments,
  setextUnderlineLevel,
  tryMinifyJson,
} from "./markdownTransform";

/**
 * Structural facts that compaction must never change. Compaction may remove whitespace,
 * blank lines, comments and table padding, but these must survive exactly.
 */
interface MarkdownFacts {
  codeBlocks: string[];
  headings: string[];
  inlineCode: string[];
  linkUrls: string[];
  bareUrls: string[];
  listItems: number;
}

export interface ValidationIssue {
  kind: "codeBlock" | "heading" | "inlineCode" | "linkUrl" | "bareUrl" | "listItems";
  message: string;
}

const MARKDOWN_FENCE_PLACEHOLDER = "<markdown fence>";

/** Compares the original document with its compact version and lists every invariant that changed. */
export function validateCompact(original: string, compact: string): ValidationIssue[] {
  const before = extractFacts(original);
  const after = extractFacts(compact);
  const issues: ValidationIssue[] = [];

  compareSequence(before.codeBlocks, after.codeBlocks, "codeBlock", "Code block", issues, (block) =>
    block === MARKDOWN_FENCE_PLACEHOLDER ? "md fence" : firstLine(block),
  );
  compareSequence(before.headings, after.headings, "heading", "Heading", issues, (heading) => heading);
  compareMultiset(before.inlineCode, after.inlineCode, "inlineCode", "Inline code", issues);
  compareMultiset(before.linkUrls, after.linkUrls, "linkUrl", "Link URL", issues);
  compareMultiset(before.bareUrls, after.bareUrls, "bareUrl", "URL", issues);

  if (before.listItems !== after.listItems) {
    issues.push({
      kind: "listItems",
      message: `List item count changed: ${before.listItems} → ${after.listItems}`,
    });
  }

  return issues;
}

function extractFacts(markdown: string): MarkdownFacts {
  const facts: MarkdownFacts = {
    codeBlocks: [],
    headings: [],
    inlineCode: [],
    linkUrls: [],
    bareUrls: [],
    listItems: 0,
  };
  const lines = normalizeLineEndings(markdown).split("\n");
  const commentState = { inComment: false };
  let fence: FenceInfo | null = null;
  let fenceIsMarkdown = false;
  let fenceIsJson = false;
  let fenceLines: string[] = [];
  let start = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end > 0) {
      start = end + 1;
    }
  }

  const closeFence = (): void => {
    // Valid JSON is compared without insignificant whitespace, so minified JSON still matches,
    // while any change inside strings, numbers or keys is reported.
    const json = fenceIsJson ? tryMinifyJson(fenceLines.join("\n")) : null;
    facts.codeBlocks.push(fenceIsMarkdown ? MARKDOWN_FENCE_PLACEHOLDER : json ?? normalizeCode(fenceLines));
    fence = null;
    fenceLines = [];
  };

  for (let index = start; index < lines.length; index++) {
    const line = lines[index];

    if (fence !== null) {
      if (isFenceClose(line, fence)) {
        closeFence();
      } else {
        fenceLines.push(line);
      }
      continue;
    }

    const opened = commentState.inComment ? null : parseFenceOpen(line);
    if (opened !== null) {
      fence = opened;
      fenceIsMarkdown = isMarkdownFenceLanguage(getFenceLanguage(line));
      fenceIsJson = getFenceLanguage(line) === "json";
      fenceLines = [];
      continue;
    }

    const text = removeHtmlComments(line, commentState);
    const content = text.trim();
    if (content === "") {
      continue;
    }

    const heading = content.match(/^(#{1,6})\s+(.*)$/);
    if (heading !== null) {
      facts.headings.push(`${heading[1]} ${heading[2].replace(/\s+/g, "")}`);
    }

    // Setext headings (`Title` + `---`) are compacted to `## Title`, so count them as headings.
    const underlineLevel = index + 1 < lines.length ? setextUnderlineLevel(lines[index + 1]) : null;
    const previousLine = index > start ? lines[index - 1] : "";
    if (
      underlineLevel !== null &&
      isSetextTitleLine(text) &&
      (previousLine.trim() === "" || /^#{1,6}\s/.test(previousLine.trim()))
    ) {
      facts.headings.push(`${"#".repeat(underlineLevel)} ${content.replace(/\s+/g, "")}`);
    }

    if (/^(?:[-*+]|\d{1,9}[.)])\s+/.test(content) && !/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(content)) {
      facts.listItems++;
    }

    // In tables, GFM splits cells even inside inline code, so cell padding is not checked here.
    const isTableRow = content.startsWith("|");
    const { spans, rest } = splitInlineCode(text);
    if (!isTableRow) {
      facts.inlineCode.push(...spans);
    }

    for (const match of rest.matchAll(/\]\(\s*([^\s)]+)/g)) {
      facts.linkUrls.push(match[1]);
    }

    for (const match of rest.matchAll(/(?<!\w|\(\s*)(?:https?:\/\/|www\.)[^\s<>`()[\]|]+/g)) {
      facts.bareUrls.push(match[0].replace(/[.,;:!?'"]+$/, ""));
    }
  }

  if (fence !== null) {
    closeFence();
  }

  return facts;
}

/** Code compared without trailing whitespace and without a uniform base indentation. */
function normalizeCode(lines: string[]): string {
  const trimmed = lines.map((line) => line.trimEnd());
  const indents = trimmed.filter((line) => line !== "").map((line) => line.length - line.trimStart().length);
  const base = indents.length === 0 ? 0 : Math.min(...indents);
  return trimmed.map((line) => line.slice(Math.min(base, line.length - line.trimStart().length))).join("\n");
}

function splitInlineCode(text: string): { spans: string[]; rest: string } {
  const spans: string[] = [];
  let rest = "";
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "`") {
      rest += text[index];
      index++;
      continue;
    }

    const run = text.slice(index).match(/^`+/)![0];
    const closing = text.indexOf(run, index + run.length);
    if (closing < 0) {
      rest += run;
      index += run.length;
      continue;
    }

    spans.push(text.slice(index, closing + run.length));
    rest += " ";
    index = closing + run.length;
  }

  return { spans, rest };
}

function compareSequence(
  before: string[],
  after: string[],
  kind: ValidationIssue["kind"],
  label: string,
  issues: ValidationIssue[],
  describe: (value: string) => string,
): void {
  if (before.length !== after.length) {
    issues.push({ kind, message: `${label} count changed: ${before.length} → ${after.length}` });
    return;
  }

  before.forEach((value, index) => {
    if (value !== after[index]) {
      issues.push({ kind, message: `${label} #${index + 1} changed: "${describe(value)}" → "${describe(after[index])}"` });
    }
  });
}

function compareMultiset(
  before: string[],
  after: string[],
  kind: ValidationIssue["kind"],
  label: string,
  issues: ValidationIssue[],
): void {
  const counts = new Map<string, number>();
  for (const value of before) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  for (const value of after) {
    counts.set(value, (counts.get(value) ?? 0) - 1);
  }

  for (const [value, delta] of counts) {
    if (delta > 0) {
      issues.push({ kind, message: `${label} missing in compact output: ${value}` });
    } else if (delta < 0) {
      issues.push({ kind, message: `${label} added in compact output: ${value}` });
    }
  }
}

function firstLine(block: string): string {
  const line = block.split("\n").find((value) => value.trim() !== "") ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}
