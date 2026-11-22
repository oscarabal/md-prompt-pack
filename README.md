# Markdown Prompt Pack

VS Code extension that generates human and compact Markdown versions for AI prompts and documentation.

## Purpose

This extension helps prepare Markdown files for AI workflows by generating cleaner and more compact variants while preserving the structure that matters for Markdown parsing, readability, and prompt consumption.

## Features

- Generate `*.human.md`
- Generate `*.compact.md`
- Generate both from a Markdown file
- Generate compact versions for every Markdown file in a folder
- Preserves code fences and YAML frontmatter
- Removes global blank lines and tabs where safe
- Keeps semantic spacing around headings, code fences, tables, blockquotes, and thematic breaks
- Compacts tables, blockquotes, links, and checklist markers
- Normalizes unordered bullets and nested list indentation
- Removes spaces after commas, around word connectors and after colons
- Protected block support for XML-like tags (`<TASK>`, `<instructions>`, `<prompt>`, etc.)
- Skips generated files like `*.human.md` and `*.compact.md`

## Commands

| Command | Description |
|---------|-------------|
| `MD Pack: Generate Human Version` | Creates `file.human.md` |
| `MD Pack: Generate Compact Version` | Creates `file.compact.md` |
| `MD Pack: Generate Human + Compact Versions` | Creates both outputs |
| `MD Pack: Generate Compact Versions for Folder` | Processes all Markdown files in a folder |

Commands are available from the Command Palette (`Ctrl+Shift+P`) and the right-click context menu in the editor and Explorer.

## Output

By default, generated files are created next to the source file:

```text
instructions/spec.md
instructions/spec.human.md
instructions/spec.compact.md
```

You can change output mode in settings:

```json
{
  "mdPromptPack.outputMode": "generatedFolder",
  "mdPromptPack.generatedFolderName": ".mdpack"
}
```

Then generated files are written to:

```text
instructions/.mdpack/spec.human.md
instructions/.mdpack/spec.compact.md
```

Compact outputs overwrite existing `*.compact.md` files automatically. The `mdPromptPack.overwrite` setting only controls whether non-compact generated files such as `*.human.md` can be overwritten.

## Human Mode

Human mode improves readability of any Markdown file, including previously generated `*.compact.md` files.

Transformations applied (YAML frontmatter and code fence content are preserved):

- Collapses repeated blank lines to a single blank line
- Preserves trailing spaces inside code fences
- Expands compact Markdown tables with padded columns
- Expands table separators while preserving alignment (`:---`, `---:`, `:---:`)
- Inserts blank lines around semantic blocks: headings, code fences, tables, blockquotes, and thematic breaks
- Inserts a blank line after headings before following content
- Inserts a blank line after the last list item before the next non-list block

Human mode does not try to reverse lossy compact transformations such as removed HTML comments, normalized bullets, or compacted punctuation.

## Compact Mode

Compact mode reduces Markdown size while preserving structure that affects parsing and prompt readability.

Transformations applied (YAML frontmatter is preserved verbatim; code fence content is preserved except trailing whitespace):

### Blank lines and spacing

- Removes repeated blank lines unless they separate semantic blocks
- Preserves one blank line before headings and after H1/H2 headings, code fences, tables, blockquotes, and thematic breaks
- Forces a blank line before headings unless the previous line is an XML-like open tag
- Keeps a blank line after H1/H2 headings; H3 and deeper headings start content on the next line without an extra blank
- Removes blank lines after XML-like open tags (`<TASK>`, `<context>`, `<instructions>`, etc.)
- Removes thematic breaks (`---`) when the next non-blank line is a heading
- Forces a blank line before critical section headings: `Hard Rules`, `Required Inputs`, `Output Template`, `Critical Rules`, `Important`
- Removes tabs; normalizes multiple spaces to single spaces

### Punctuation compaction

Applied outside real code fences; inline code spans are always protected:

- Removes spaces after commas: `a, b` → `a,b`
- Removes spaces after semicolons: `a; b` → `a;b`
- Removes spaces around `/` between words: `a / b` → `a/b`
- Removes spaces around word connectors `-`, `+`, `<`, `>`, `→`, `—` when there is a word, `)`, `` ` ``, `}`, or closing quote on the left and a word or `{` on the right: `a - b` → `a-b`, `` `cmd` → word `` → `` `cmd`→word ``, `"slow" — produce` → `"slow"—produce`
- Does not compact connectors preceded by `*` (bold/italic markers): `**LCP** — render` is left unchanged
- Does not compact list marker dashes (no word before the `-`)
- Removes space after `:` when followed by a word, `{`, or `"`: `Default: all` → `Default:all`, `key: "value"` → `key:"value"`
- Compacts Markdown links by removing extra spaces inside brackets and parentheses
- Collapses empty checkbox brackets: `[ ]` → `[]`; normalizes checked boxes to `[x]`

### Structure

- Preserves trailing spaces at end of lines (removed everywhere including inside code fences, except double-space hard line breaks inside `md`/`markdown` fences)
- Normalizes nested list indentation to the parent's content column (2 spaces under `- `, 3 under `1. `, 4 under `10. `), so nesting stays valid CommonMark
- Keeps indented continuation paragraphs inside their list item
- Preserves indented code blocks (4+ spaces or a tab after a blank line) verbatim, except inside XML-like prompt tags where indentation is treated as visual
- Matches code fences by character and length (a ```` ``` ```` line does not close a `~~~` or ```` ```` ```` fence)
- Preserves one blank line after the last item of a list before the next block
- Normalizes unordered bullets from `*` and `+` to `-`; does not normalize ordered list numbers
- Removes inline and multiline HTML comments (comments inside inline code spans are kept)
- Compacts table cells and separators; removes final pipe when last cell is not empty
- Applies full Markdown compaction inside `md` and `markdown` code fences

### Protected blocks

XML-like blocks receive lighter compaction to preserve intent:

- Always protected: `<output_template>`, `<output-template>`, `<prompt>`
- Conditionally protected when a matching close tag exists (case-insensitive): `<task>`, `<instructions>`, `<context>`, `<files>`, `<rules>`, `<example>`, `<output>`, `<acceptance_criteria>`, `<acceptance-criteria>`

Inside protected blocks:
- Code fences are copied verbatim (only trailing whitespace is trimmed)
- All internal blank lines removed except one blank before headings and after H1/H2 headings
- No blank forced if heading is the first line after the open tag or the last line before the close tag
- Uniform base indentation is removed while preserving relative indentation
- Tables compacted; list indentation normalized (first-level preserved, children aligned to the parent's content column)
- Commas, word connectors, colons, links, and checkbox brackets compacted (same rules as outside)
- Trailing spaces trimmed

### Example

```md
## Title

Text   with    extra spacing.

| Command | Description |
|---------|-------------|
| Run     | Execute     |

* item
    * child

- [ ] pending task
- [x] done task
```

Becomes:

```md
## Title

Text with extra spacing.

|Command|Description|
|--|--|
|Run|Execute|

- item
  - child

- [] pending task
- [x] done task
```

## Development

### Run the extension locally

1. Open this folder in VS Code.

2. Install dependencies:

```bash
npm install
```

3. Compile the extension:

```bash
npm run compile
```

4. Start the extension in a new Extension Development Host window:

```text
Press F5 in VS Code and select "Run Extension" if prompted.
```

5. In the Extension Development Host window, open or create a Markdown file and run one of the commands from the Command Palette (`Ctrl+Shift+P`) or the right-click context menu.

6. Check the generated output next to the source file, or inside the configured generated folder.

### Validate changes

Run unit tests:

```bash
npm run test:unit
```

For continuous compilation while editing:

```bash
npm run watch
```

### Package the extension

Build a local VSIX package:

```bash
npm run package
```

Each run of `npm run package` automatically increments the patch version in `package.json` before creating the VSIX.

Install the generated VSIX from the terminal:

```bash
code --install-extension .\md-prompt-pack-<version>.vsix --force
```

## Notes

Compact mode does not collapse everything into a single line because that breaks Markdown semantics and prompt readability. The goal is to remove noise (blank lines, padding, comments, extra spaces) while keeping the document parseable and structurally intact.
