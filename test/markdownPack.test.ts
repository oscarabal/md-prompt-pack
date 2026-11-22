import * as assert from "assert";
import { toCompactMarkdown, toHumanMarkdown } from "../src/markdownTransform";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("human markdown preserves code fences", () => {
  const input = "# Title\n\n```ts\nconst  x = 1;   \n```\n";
  const output = toHumanMarkdown(input);

  assert.ok(output.includes("const  x = 1;   "));
});

test("human markdown expands compact tables", () => {
  const input = "|A|B|\n|--|--|\n|Run|Execute|\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "| A   | B       |\n| --- | ------- |\n| Run | Execute |\n");
});

test("human markdown expands aligned table separators", () => {
  const input = "|Left|Right|Center|\n|:--|--:|:--:|\n|A|B|C|\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(
    output,
    "| Left | Right | Center |\n| :--- | ----: | :----: |\n| A    | B     | C      |\n",
  );
});

test("human markdown inserts blanks around tables", () => {
  const input = "Text before\n|A|B|\n|--|--|\nText after\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "Text before\n\n| A   | B   |\n| --- | --- |\n\nText after\n");
});

test("human markdown inserts blanks around headings", () => {
  const input = "Text before\n## Heading\nText after\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "Text before\n\n## Heading\n\nText after\n");
});

test("human markdown inserts blanks around code fences", () => {
  const input = "Text before\n```ts\nconst x = 1;\n```\nText after\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "Text before\n\n```ts\nconst x = 1;\n```\n\nText after\n");
});

test("human markdown expands tables with empty cells", () => {
  const input = "||B|\n|--|--|\n||Value|\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "|     | B     |\n| --- | ----- |\n|     | Value |\n");
});

test("compact markdown preserves code fence spacing but removes trailing spaces", () => {
  const input = "# Title\n\n```ts\nconst  x = 1;   \n```\n";
  const output = toCompactMarkdown(input);

  assert.ok(output.includes("const  x = 1;"));
  assert.ok(!output.includes("const  x = 1;   "));
});

test("compact markdown normalizes table separators inside code fences", () => {
  const input = [
    "```md",
    "| Command | Description |",
    "|---------|-------------|   ",
    "| Run     | Execute     |",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "```md\n|Command|Description\n|--|--\n|Run|Execute\n```\n");
});

test("compact markdown normalizes indented table separators inside code fences", () => {
  const input = [
    "    ```markdown",
    "    | Severity | Count |",
    "    |----------|-------|   ",
    "    | Critical | |",
    "    ```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "    ```markdown\n    |Severity|Count\n    |--|--\n    |Critical||\n    ```\n");
});

test("compact markdown removes comma and slash spacing outside fences", () => {
  const input = "React, Astro, Tailwind\nbackend / frontend / db / queue\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "React,Astro,Tailwind\nbackend/frontend/db/queue\n");
});

test("compact markdown removes spaces around word connectors outside inline code", () => {
  const input = "alpha - beta\nalpha + beta\nalpha > beta\nalpha < beta\nalpha → beta\n(foo) - bar\n{foo} + bar\n{foo} → bar\nfirst; second\nkeep `alpha - beta`\nkeep `alpha + beta`\nkeep `first; second`\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "alpha-beta\nalpha+beta\nalpha>beta\nalpha<beta\nalpha→beta\n(foo)-bar\n{foo}+bar\n{foo}→bar\nfirst;second\nkeep `alpha - beta`\nkeep `alpha + beta`\nkeep `first; second`\n",
  );
});

test("compact markdown removes spaces around em dash connector between words", () => {
  const input = "overused — defaults to no JS\nconsistency cost only — Low\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "overused—defaults to no JS\nconsistency cost only—Low\n");
});

test("compact markdown does not remove space when em dash follows bold marker", () => {
  const input = "**LCP** — render-blocking CSS\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "**LCP** — render-blocking CSS\n");
});

test("compact markdown removes spaces around connectors when backtick precedes connector", () => {
  const input = "`--full` → audit the whole repository\n`--path {dir}` → audit a specific path\n`something` → almost certainly N+1.\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "`--full`→audit the whole repository\n`--path {dir}`→audit a specific path\n`something`→almost certainly N+1.\n",
  );
});

test("compact markdown does not remove space when dash is a list marker", () => {
  const input = "- first item\n- second item\n  - nested item\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "- first item\n- second item\n  - nested item\n");
});

test("compact markdown removes spaces around connectors when ASCII quote precedes connector", () => {
  const input = `No "this might be slow" - produce a number\nNo "baseline" — findings use absolute thresholds\n`;
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, `No "this might be slow"-produce a number\nNo "baseline"—findings use absolute thresholds\n`);
});

test("compact markdown removes spaces around connectors when typographic quote precedes connector", () => {
  const input = `\u201Cslow\u201D - produce a number\n\u201Cslow\u201D \u2014 produce a number\n`;
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, `\u201Cslow\u201D-produce a number\n\u201Cslow\u201D\u2014produce a number\n`);
});

test("compact markdown removes space after colon before word or template placeholder", () => {
  const input = "Default: all tiers\ntarget: {threshold}\nsubagent_type: \"Explore\"\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Default:all tiers\ntarget:{threshold}\nsubagent_type:\"Explore\"\n");
});

test("compact markdown applies punctuation rules only inside markdown fences", () => {
  const input = [
    "```markdown",
    "React, Astro, Tailwind",
    "backend / frontend / db / queue",
    "```",
    "```ts",
    "fn(a, b); // keep code spacing",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "```markdown\nReact,Astro,Tailwind\nbackend/frontend/db/queue\n```\n```ts\nfn(a, b); // keep code spacing\n```\n",
  );
});

test("compact markdown removes blank lines outside fences", () => {
  const input = [
    "# Title",
    "",
    "Intro text",
    "",
    "```ts",
    "const  x = 1;   ",
    "```",
    "",
    "## Next",
    "",
    "| A | B |",
    "|---|---|",
    "| 1 | 2 |",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "# Title\n\nIntro text\n\n```ts\nconst  x = 1;\n```\n\n## Next\n\n|A|B\n|--|--\n|1|2\n",
  );
});

test("compact markdown preserves blank lines around headings", () => {
  const input = "Text before\n\n## Heading\n\nText after\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n## Heading\n\nText after\n");
});

test("compact markdown inserts blank lines around any heading level", () => {
  const input = "Text before\n# Heading\nText after\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n# Heading\n\nText after\n");
});

test("compact markdown inserts blank line after heading", () => {
  const input = "<TASK>\n    ## Communication Mode\n    Apply rules from ./caveman.md.\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\n## Communication Mode\n\nApply rules from ./caveman.md.\n");
});

test("compact markdown removes blank line after H3 and deeper headings", () => {
  const input = "Text before\n### Phase 1\n\nContent after H3\n#### Detail\n\nContent after H4\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n### Phase 1\nContent after H3\n\n#### Detail\nContent after H4\n");
});

test("compact markdown keeps blank after H1/H2 before another heading", () => {
  const input = "# Title\n## Section\n### Detail\nContent\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "# Title\n\n## Section\n\n### Detail\nContent\n");
});

test("compact markdown preserves blank lines around thematic breaks", () => {
  const input = "Text before\n\n---\n\nText after\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n---\n\nText after\n");
});

test("compact markdown removes thematic breaks before headings", () => {
  const input = "Text before\n---\n\n## Heading\nText after\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n## Heading\n\nText after\n");
});

test("compact markdown removes tabs outside fences", () => {
  const input = "Text\t\twith\ttabs\n\tTabbed start\n```ts\nconst\tx = 1;\n```\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text with tabs\nTabbed start\n```ts\nconst\tx = 1;\n```\n");
});

test("compact markdown compacts table cells and separators", () => {
  const input = [
    "| Command | Description |",
    "|---------|-------------|",
    "| Run     | Execute task |",
    "| Left | Right |",
    "| :------ | ------: |",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "|Command|Description\n|--|--\n|Run|Execute task\n|Left|Right\n|:--|--:\n");
});

test("compact markdown keeps trailing pipe for empty final table cells", () => {
  const input = [
    "| Command | Notes |",
    "|---------|-------|",
    "| Run     |       |",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "|Command|Notes\n|--|--\n|Run||\n");
});

test("compact markdown normalizes unordered bullets only", () => {
  const input = [
    "* star item",
    "+ plus item",
    "- dash item",
    "1. first ordered",
    "2. second ordered",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "- star item\n- plus item\n- dash item\n1. first ordered\n2. second ordered\n");
});

test("compact markdown compacts blockquotes and preserves surrounding blanks", () => {
  const input = "Text before\n\n>   Important   text\n> >   Nested   text\n\nText after\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Text before\n\n> Important text\n> > Nested text\n\nText after\n");
});

test("compact markdown normalizes nested list indentation", () => {
  const input = [
    "- parent",
    "    - child from four spaces",
    "        - grandchild from eight spaces",
    "\t- sibling child from tab",
    "- next parent",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "- parent\n  - child from four spaces\n    - grandchild from eight spaces\n  - sibling child from tab\n- next parent\n",
  );
});

test("compact markdown inserts blank line after list before next block", () => {
  const input = [
    "- parent",
    "    - child",
    "Text after list",
    "1. ordered item",
    "2. ordered item",
    "```ts",
    "const value = 1;",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "- parent\n  - child\n\nText after list\n1. ordered item\n2. ordered item\n\n```ts\nconst value = 1;\n```\n",
  );
});

test("compact markdown removes html comments outside fences", () => {
  const input = "# Title\n\n<!-- remove me -->\nText\n";
  const output = toCompactMarkdown(input);

  assert.ok(!output.includes("remove me"));
  assert.ok(output.includes("Text"));
});

test("compact markdown removes multiline html comments outside fences", () => {
  const input = "Before\n<!--\nremove me\n-->\nAfter\n```ts\n<!-- keep me -->\n```\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Before\nAfter\n```ts\n<!-- keep me -->\n```\n");
});

test("compact markdown preserves frontmatter", () => {
  const input = "---\ntitle: Test\n---\n\n# Title\n";
  const output = toCompactMarkdown(input);

  assert.ok(output.startsWith("---\ntitle: Test\n---"));
});

test("human markdown collapses repeated blank lines", () => {
  const input = "# Title\n\n\n\nText\n";
  const output = toHumanMarkdown(input);

  assert.strictEqual(output, "# Title\n\nText\n");
});

test("compact markdown protects inline code from punctuation compaction", () => {
  const input = "Use `fn(a, b)` and `path / to / file` in code.\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "Use `fn(a, b)` and `path / to / file` in code.\n");
});

test("compact markdown compacts Markdown links", () => {
  const input = "See [ my link ]( https://example.com ) for details.\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "See [my link](https://example.com) for details.\n");
});

test("compact markdown compacts checklists", () => {
  const input = "-  [ ] unchecked\n-  [x]  done\n- [ ]  spaced\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "- [] unchecked\n- [x] done\n- [] spaced\n");
});

test("compact markdown collapses empty checkbox brackets", () => {
  const input = "- [ ] task one\n- [x] task done\n- [ ] {metric} via {tool}\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "- [] task one\n- [x] task done\n- [] {metric} via {tool}\n");
});

test("compact markdown collapses empty checkbox brackets inside protected blocks", () => {
  const input = "<TASK>\n    - [ ] Keyboard-only walk\n    - [ ] Screen reader test\n    - [x] Done\n</TASK>\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\n- [] Keyboard-only walk\n- [] Screen reader test\n- [x] Done\n</TASK>\n");
});

test("compact markdown compacts connectors before template placeholders", () => {
  const input = "1. **{finding}** (`{location}`) - {one-line action}\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "1. **{finding}** (`{location}`)-{one-line action}\n");
});

test("compact markdown applies full compaction inside markdown fences", () => {
  const input = [
    "```markdown",
    "<!-- remove me -->",
    "",
    "* star item",
    "    + nested item",
    "",
    ">   Quoted   text",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "```markdown\n- star item\n  - nested item\n\n> Quoted text\n```\n",
  );
});

test("compact markdown protects inline code inside markdown fences", () => {
  const input = [
    "```md",
    "Use `fn(a, b)` here",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "```md\nUse `fn(a, b)` here\n```\n");
});

test("compact markdown removes blank line after XML-like open tags", () => {
  const input = "<TASK>\nDo something\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\nDo something\n");
});

test("compact markdown forces blank line before H2/H3 when previous is not heading", () => {
  const input = "Some text\n## Section Two\nContent\n### Sub Section\n";
  const output = toCompactMarkdown(input);

  assert.ok(output.includes("Some text\n\n## Section Two"));
  assert.ok(output.includes("Content\n\n### Sub Section"));
});

test("compact markdown preserves trailing double-spaces inside markdown fences", () => {
  const input = [
    "```md",
    "Line with hard break  ",
    "Next line",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "```md\nLine with hard break  \nNext line\n```\n");
});

test("compact markdown removes leading and trailing blank lines inside protected blocks", () => {
  const input = [
    "<output_template>",
    "",
    "* Keep   this spacing",
    "React, Astro, Tailwind",
    "  indented content",
    "",
    "</output_template>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<output_template>\n* Keep   this spacing\nReact,Astro,Tailwind\n  indented content\n</output_template>\n",
  );
});

test("compact markdown removes blank lines between protected content", () => {
  const input = [
    "<prompt>",
    "Paragraph one",
    "",
    "",
    "Paragraph two",
    "",
    "| A | B |",
    "|---|---|",
    "",
    "Paragraph three",
    "</prompt>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<prompt>\nParagraph one\nParagraph two\n|A|B\n|--|--\nParagraph three\n</prompt>\n",
  );
});

test("compact markdown preserves one blank line around protected headings", () => {
  const input = [
    "<TASK>",
    "    ## Heading",
    "",
    "",
    "    Paragraph after heading",
    "",
    "    ---",
    "",
    "    ## Next Heading",
    "",
    "    Next paragraph",
    "</TASK>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<TASK>\n## Heading\n\nParagraph after heading\n\n## Next Heading\n\nNext paragraph\n</TASK>\n",
  );
});

test("compact markdown removes blank after H3 inside protected blocks", () => {
  const input = [
    "<TASK>",
    "    ## Phase",
    "    ### Step",
    "    Content under step",
    "</TASK>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\n## Phase\n\n### Step\nContent under step\n</TASK>\n");
});

test("compact markdown removes thematic breaks before headings inside markdown fences", () => {
  const input = [
    "```md",
    "Text before",
    "---",
    "## Heading",
    "Text after",
    "```",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "```md\nText before\n\n## Heading\n\nText after\n```\n");
});

test("compact markdown removes blank lines inside XML-like conditional blocks", () => {
  const input = [
    "<context>",
    "",
    "Some paragraph",
    "",
    "Another paragraph",
    "",
    "</context>",
    "<acceptance_criteria>",
    "",
    "- first",
    "",
    "- second",
    "</acceptance_criteria>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<context>\nSome paragraph\nAnother paragraph\n</context>\n<acceptance_criteria>\n- first\n- second\n</acceptance_criteria>\n",
  );
});

test("compact markdown normalizes nested list indentation inside protected blocks", () => {
  const input = [
    "<output_template>",
    "* parent",
    "    * child from four spaces",
    "        * grandchild from eight spaces",
    "\t* sibling child from tab",
    "* next parent",
    "</output_template>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<output_template>\n* parent\n  * child from four spaces\n    * grandchild from eight spaces\n  * sibling child from tab\n* next parent\n</output_template>\n",
  );
});

test("compact markdown preserves first-level ordered list indentation inside protected blocks", () => {
  const input = [
    "<prompt>",
    "  1. parent",
    "      1. child from six spaces",
    "  2. next parent",
    "</prompt>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<prompt>\n1. parent\n  1. child from six spaces\n2. next parent\n</prompt>\n");
});

test("compact markdown preserves first-level unordered list indentation inside protected blocks", () => {
  const input = [
    "<prompt>",
    "    - parent",
    "        - child from eight spaces",
    "            - grandchild from twelve spaces",
    "    - next parent",
    "</prompt>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<prompt>\n- parent\n  - child from eight spaces\n    - grandchild from twelve spaces\n- next parent\n</prompt>\n",
  );
});

test("compact markdown removes comma spacing inside protected blocks without touching inline code", () => {
  const input = [
    "<prompt>",
    "React, Astro, Tailwind and first; second and alpha - beta and alpha + beta and a > b and a < b and alpha → beta and (foo) - bar and {foo} + bar and {foo} → bar and `fn(a, b)` and `first; second` and `alpha - beta` and `alpha + beta`",
    "</prompt>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<prompt>\nReact,Astro,Tailwind and first;second and alpha-beta and alpha+beta and a>b and a<b and alpha→beta and (foo)-bar and {foo}+bar and {foo}→bar and `fn(a, b)` and `first; second` and `alpha - beta` and `alpha + beta`\n</prompt>\n",
  );
});

test("compact markdown strips uniform base indentation inside protected blocks", () => {
  const input = [
    "<TASK>",
    "    ## Heading",
    "    - parent",
    "        - child",
    "    Paragraph",
    "</TASK>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\n## Heading\n\n- parent\n  - child\nParagraph\n</TASK>\n");
});

test("compact markdown compacts tables inside protected blocks", () => {
  const input = [
    "<output_template>",
    "| Command | Description |",
    "|---------|-------------|",
    "| Run     | Execute     |",
    "</output_template>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<output_template>\n|Command|Description\n|--|--\n|Run|Execute\n</output_template>\n");
});

test("compact markdown compacts tables inside uppercase task protected blocks", () => {
  const input = [
    "<TASK>",
    "React, Astro, Tailwind",
    "| Command | Description |",
    "|---------|-------------|",
    "| Run     | Execute     |",
    "</TASK>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(
    output,
    "<TASK>\nReact,Astro,Tailwind\n|Command|Description\n|--|--\n|Run|Execute\n</TASK>\n",
  );
});

test("compact markdown trims trailing spaces in protected blocks", () => {
  const input = "<prompt>\nContent with trailing   \n</prompt>\n";
  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<prompt>\nContent with trailing\n</prompt>\n");
});

test("compact markdown protects task blocks only when they have a matching close tag", () => {
  const input = [
    "<TASK>",
    "* Keep   this spacing",
    "React, Astro, Tailwind",
    "</TASK>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<TASK>\n* Keep   this spacing\nReact,Astro,Tailwind\n</TASK>\n");
});

test("compact markdown protects instructions blocks with matching close tags", () => {
  const input = [
    "<instructions>",
    "+ Keep   this bullet",
    "backend / frontend / db",
    "</instructions>",
    "",
  ].join("\n");

  const output = toCompactMarkdown(input);

  assert.strictEqual(output, "<instructions>\n+ Keep   this bullet\nbackend/frontend/db\n</instructions>\n");
});

test("compact markdown forces blank before critical headings", () => {
  const input = "Normal text\n## Hard Rules\nContent\n## Output Template\n";
  const output = toCompactMarkdown(input);

  assert.ok(output.includes("Normal text\n\n## Hard Rules"));
  assert.ok(output.includes("Content\n\n## Output Template"));
});
