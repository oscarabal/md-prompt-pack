import * as assert from "assert";
import { validateCompact } from "../src/compactValidation";
import { toCompactMarkdown } from "../src/markdownTransform";
import { estimateTokens, formatTokenStats } from "../src/tokenEstimate";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const SAMPLE = [
  "---",
  "title: Sample",
  "---",
  "# Review   Agent",
  "",
  "1. Collect context:",
  "   - Read `README.md`, then `CONTRIBUTING.md`.",
  "",
  "<prompt>",
  "```bash",
  "git diff --name-only | grep -v -E 'lock'",
  "```",
  "</prompt>",
  "",
  "    indented code, x - 1",
  "",
  "See [ docs ]( https://example.com/docs ) and https://example.com, then go.",
  "<!-- note with `code` -->",
  "",
  "| A | B |",
  "|---|---|",
  "| `a | b` | 2 |",
  "",
].join("\n");

test("validation passes for the compact output of a mixed document", () => {
  assert.deepStrictEqual(validateCompact(SAMPLE, toCompactMarkdown(SAMPLE)), []);
});

test("validation detects changed code blocks", () => {
  const original = "```bash\ngrep -v x\n```\n";
  const issues = validateCompact(original, "```bash\ngrep-v x\n```\n");

  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].kind, "codeBlock");
});

test("validation ignores trailing whitespace and uniform indentation in code blocks", () => {
  assert.deepStrictEqual(validateCompact("```\n  a  \n    b\n```\n", "```\na\n  b\n```\n"), []);
});

test("validation detects missing inline code", () => {
  const issues = validateCompact("Use `<!-- x -->` here\n", "Use `` here\n");

  assert.ok(issues.some((issue) => issue.kind === "inlineCode"));
});

test("validation detects changed headings but ignores heading whitespace", () => {
  assert.deepStrictEqual(validateCompact("## Hard  Rules, now\n", "## Hard Rules,now\n"), []);
  assert.ok(validateCompact("## Rules\n", "### Rules\n").some((issue) => issue.kind === "heading"));
});

test("validation detects changed URLs", () => {
  const issues = validateCompact("See https://a.com, and b\n", "See https://a.com,and b\n");

  assert.ok(issues.some((issue) => issue.kind === "bareUrl"));
  assert.deepStrictEqual(validateCompact("[x]( https://a.com )\n", "[x](https://a.com)\n"), []);
});

test("validation detects list items that disappear", () => {
  const issues = validateCompact("- a\n- b\n", "- a b\n");

  assert.ok(issues.some((issue) => issue.kind === "listItems"));
});

test("validation ignores removed html comments", () => {
  assert.deepStrictEqual(validateCompact("Text <!-- `x` https://a.com -->\n", "Text\n"), []);
});

test("token estimate drops when whitespace and padding are removed", () => {
  const original = "| Command   | Description   |\n|-----------|---------------|\n| Run       | Execute       |\n\n\n\nText\n";
  const before = estimateTokens(original);
  const after = estimateTokens(toCompactMarkdown(original));

  assert.ok(after < before, `${after} should be lower than ${before}`);
});

test("token estimate counts words and punctuation", () => {
  assert.strictEqual(estimateTokens(""), 0);
  assert.strictEqual(estimateTokens("hello world"), 2);
  assert.strictEqual(estimateTokens("hello, world."), 4);
});

test("token stats are formatted with sign and percentage", () => {
  assert.strictEqual(formatTokenStats({ before: 200, after: 150 }), "≈200 → ≈150 tokens (−25.0%)");
  assert.strictEqual(formatTokenStats({ before: 0, after: 0 }), "≈0 → ≈0 tokens (−0.0%)");
});
