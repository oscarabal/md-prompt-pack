# Changelog

## Unreleased

- **Behavior change:** punctuation compaction is now optional and disabled by default (`mdPromptPack.compactPunctuation`). This covers spaces after `,` `;` `:`, around `/` and word connectors, and `[ ]` → `[]`. `toCompactMarkdown` takes `{ punctuation: true }` to enable it.
- Add a compact safety check (`mdPromptPack.compactValidation`: `warn`, `block`, `off`) that verifies code blocks, headings, inline code, URLs and list item counts are unchanged; details go to the "MD Prompt Pack" output channel.
- Show approximate token counts before and after compaction (`mdPromptPack.showTokenStats`), per file and per folder.
- Fix: repeated spaces inside inline code are no longer collapsed.
- Fix: text after a bare URL followed by `,`, `;` or `:` is no longer glued to the URL.
- Fix: `a: / b` style spacing no longer creates URLs such as `http://x` from `http: //x`.
- Fix: starred thematic breaks (`* * *`) are no longer turned into list items.
- Fix: escaped pipes (`\|`) inside table cells are no longer treated as cell separators.
- Fix: code fences inside protected blocks (`<prompt>`, `<task>`, ...) are no longer compacted.
- Fix: indented code blocks are preserved verbatim instead of being flattened and compacted.
- Fix: code fences now match opening character and length; nested and mixed fences no longer flip fence state.
- Fix: thematic breaks inside code fences are no longer removed (compact and human modes).
- Fix: unclosed `md` fences no longer drop their content; closing fences no longer get a blank line inserted before them.
- Fix: list nesting uses the parent's content column (3 spaces under `1. `), so ordered-list children stay nested.
- Fix: indented continuation paragraphs stay inside their list item; ordered list items with `)` are recognized.
- Fix: HTML comments inside inline code spans are kept.

## 0.0.19

- Remove explicit source blank lines after H3 and deeper headings in compact mode; H1/H2 still keep a blank line after them.

## 0.0.18

- Keep a blank line after H1/H2 headings, including before another heading.
- Remove the extra blank line after H3 and deeper headings so content starts directly below them.

## 0.0.17

- Remove spaces after semicolons in compact mode while preserving inline code spans.
- Strip uniform base indentation inside protected blocks while preserving relative indentation.

## 0.0.16

- Update README: remove `sample/plan.md` references, document all current compact rules including punctuation compaction, protected blocks, `[ ]` → `[]`, and colon spacing.

## 0.0.15

- Apply `compactLinks` (including `[ ]` → `[]`) inside protected blocks (`<TASK>`, `<instructions>`, etc.).

## 0.0.14

- Compact connectors (`-`, `→`, `—`, etc.) when followed by `{` template placeholders (e.g. `` (`{location}`) - {one-line action} `` → `` (`{location}`)-{one-line action} ``).
- Collapse empty checkbox brackets: `[ ]` → `[]`.

## 0.0.13

- Add ASCII `"` and typographic closing quotes `"` `'` (U+201D, U+2019) to the allowed left-context set for word connector compaction (e.g. `"slow" - produce` → `"slow"-produce`).
- Remove space after `:` when followed by a word, `{`, or `"` (e.g. `Default: all` → `Default:all`, `target: {threshold}` → `target:{threshold}`, `subagent_type: "Explore"` → `subagent_type:"Explore"`). Inline code spans are protected.

## 0.0.12

- Add em dash `—` (U+2014) as a compactable word connector: `word — word` → `word—word`.
- `**bold** — word` is not compacted (`*` is not in the allowed left-context set).

## 0.0.11

- Compact word connectors (`-`, `+`, `→`, `<`, `>`) when preceded by a closing backtick (e.g. `` `--full` → audit `` → `` `--full`→audit ``).
- List marker dashes (no word before the `-`) are never compacted.
- `**` before a connector is never compacted (asterisk is not in the allowed left-context set).

## 0.0.10

- No user-facing changes; version bump from packaging.

## 0.0.9

- Preserve a single blank line before and after headings inside protected/XML-like blocks.
- Keep compact-mode heading spacing while still removing other internal blank lines inside protected blocks.

## 0.0.8

- Remove blank lines after XML-like open tags and inside protected/XML-like blocks.
- Extend protected XML-like block handling to `context`, `files`, `rules`, `example`, `output`, and `acceptance_criteria`.
- Preserve blank lines before and after headings in compact mode, except immediately after XML-like open tags.
- Remove thematic breaks (`---`) when the next non-blank line is a heading, including inside Markdown fences.

## 0.0.7

- Remove final table pipes in compact output when the last cell is not empty.
- Keep final table pipes when the last cell is empty to preserve column structure.

## 0.0.6

- Compact table lines inside protected blocks.
- Normalize nested list indentation inside protected blocks.
- Remove spaces after commas and around word connectors such as `/`, `-`, `<`, and `>`.
- Preserve inline code while applying protected-block compaction rules.

## 0.0.5

- Regenerate extension VSIX package.

## 0.0.4

- Add extension icon from `assets/icon.png`.
- Change publisher identifier to `oscarabal` for VSIX packaging.

## 0.0.3

- Improve Human mode readability for compact Markdown inputs.
- Expand compact Markdown tables with padded columns and aligned separators.
- Insert semantic blank lines around headings, code fences, tables, blockquotes, and thematic breaks.
- Preserve YAML frontmatter and code fence content, including trailing spaces inside fences.
- Document Human mode behavior and lossy compact transformations.

## 0.0.2

- Protect inline code spans from punctuation compaction.
- Apply full Markdown compaction inside `md` and `markdown` fences.
- Compact Markdown links and checklist markers.
- Preserve trailing double-spaces inside Markdown fences for hard line breaks.
- Preserve semantic spacing after XML-like open tags and before H2/H3 headings.
- Preserve extra spacing before critical sections such as `Hard Rules`, `Required Inputs`, and `Output Template`.
- Add protected block handling for `<output_template>`, `<prompt>`, and matching `<task>` / `<instructions>` blocks, including uppercase tags like `<TASK>`.
- Expand unit coverage for compact Markdown edge cases.

## 0.0.1

- Initial extension scaffold.
- Generate human Markdown.
- Generate compact Markdown.
- Generate both outputs.
- Generate compact outputs for folders.
