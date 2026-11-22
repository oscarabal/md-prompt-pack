import * as path from "path";
import * as vscode from "vscode";
import { validateCompact, ValidationIssue } from "./compactValidation";
import {
  getConfiguration,
  getOutputUri,
  getWorkspaceRelativePath,
  isGeneratedMarkdown,
  isMarkdownFile,
  OutputKind
} from "./fileNaming";
import { toCompactMarkdown, toHumanMarkdown } from "./markdownTransform";
import { estimateTokens, formatTokenStats, TokenStats } from "./tokenEstimate";

export type GenerationMode = "human" | "compact" | "both";

interface CompactResult {
  written: boolean;
  issues: ValidationIssue[];
  stats: TokenStats;
}

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  outputChannel ??= vscode.window.createOutputChannel("MD Prompt Pack");
  return outputChannel;
}

export async function generateForFile(uri: vscode.Uri | undefined, mode: GenerationMode): Promise<void> {
  const input = uri ?? vscode.window.activeTextEditor?.document.uri;

  if (!input) {
    vscode.window.showErrorMessage("No Markdown file selected.");
    return;
  }

  if (!isMarkdownFile(input)) {
    vscode.window.showErrorMessage("Selected file is not a Markdown file.");
    return;
  }

  if (isGeneratedMarkdown(input)) {
    vscode.window.showWarningMessage("Generated Markdown files are skipped.");
    return;
  }

  const original = await readText(input);
  const relativePath = getWorkspaceRelativePath(input);

  if (mode === "human" || mode === "both") {
    await writeOutput(input, "human", toHumanMarkdown(original));
  }

  let summary = `Markdown ${mode} generation completed for ${relativePath}.`;

  if (mode === "compact" || mode === "both") {
    const result = await generateCompact(input, original);
    if (getConfiguration().showTokenStats) {
      summary += ` ${formatTokenStats(result.stats)}`;
    }

    if (result.issues.length > 0) {
      await reportIssues(result, relativePath, summary);
      return;
    }
  }

  vscode.window.showInformationMessage(summary);
}

export async function generateCompactForFolder(uri: vscode.Uri | undefined): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage("No folder selected.");
    return;
  }

  const files = await collectMarkdownFiles(uri);
  const totals: TokenStats = { before: 0, after: 0 };
  let written = 0;
  let filesWithIssues = 0;
  let blocked = 0;

  for (const file of files) {
    const original = await readText(file);
    const result = await generateCompact(file, original);
    totals.before += result.stats.before;
    totals.after += result.stats.after;

    if (result.written) {
      written++;
    } else {
      blocked++;
    }

    if (result.issues.length > 0) {
      filesWithIssues++;
      logIssues(getWorkspaceRelativePath(file), result.issues, result.written);
    }
  }

  let summary = `Generated ${written} compact Markdown file(s).`;
  if (getConfiguration().showTokenStats && files.length > 0) {
    summary += ` ${formatTokenStats(totals)}`;
  }

  if (filesWithIssues === 0) {
    vscode.window.showInformationMessage(summary);
    return;
  }

  const blockedText = blocked > 0 ? ` ${blocked} file(s) not written.` : "";
  const action = await vscode.window.showWarningMessage(
    `${summary} Compaction changed protected content in ${filesWithIssues} file(s).${blockedText}`,
    "Show details"
  );
  if (action === "Show details") {
    getOutputChannel().show(true);
  }
}

async function generateCompact(input: vscode.Uri, original: string): Promise<CompactResult> {
  const config = getConfiguration();
  const compact = toCompactMarkdown(original, {
    punctuation: config.compactPunctuation,
    blankLines: config.compactBlankLines
  });
  const issues = config.compactValidation === "off" ? [] : validateCompact(original, compact);
  const stats = { before: estimateTokens(original), after: estimateTokens(compact) };

  if (issues.length > 0 && config.compactValidation === "block") {
    return { written: false, issues, stats };
  }

  await writeOutput(input, "compact", compact);
  return { written: true, issues, stats };
}

async function reportIssues(result: CompactResult, relativePath: string, summary: string): Promise<void> {
  logIssues(relativePath, result.issues, result.written);

  const prefix = result.written
    ? `${summary} Warning: compaction changed protected content (${result.issues.length} issue(s)).`
    : `Compact file not written for ${relativePath}: compaction changed protected content (${result.issues.length} issue(s)).`;
  const action = result.written
    ? await vscode.window.showWarningMessage(prefix, "Show details")
    : await vscode.window.showErrorMessage(prefix, "Show details");

  if (action === "Show details") {
    getOutputChannel().show(true);
  }
}

function logIssues(relativePath: string, issues: ValidationIssue[], written: boolean): void {
  const channel = getOutputChannel();
  channel.appendLine(`[${new Date().toISOString()}] ${relativePath}${written ? "" : " (not written)"}`);
  for (const issue of issues) {
    channel.appendLine(`  - ${issue.message}`);
  }
}

async function collectMarkdownFiles(folder: vscode.Uri): Promise<vscode.Uri[]> {
  const pattern = new vscode.RelativePattern(folder.fsPath, "**/*.md");
  const config = getConfiguration();
  const files = await vscode.workspace.findFiles(
    pattern,
    "{**/node_modules/**,**/.git/**,**/.vscode/**,**/.mdpack/**}"
  );

  return files.filter(file => {
    if (!isMarkdownFile(file)) {
      return false;
    }

    if (config.excludeGeneratedFiles && isGeneratedMarkdown(file)) {
      return false;
    }

    return true;
  });
}

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

async function writeOutput(input: vscode.Uri, kind: OutputKind, content: string): Promise<void> {
  const config = getConfiguration();
  const output = getOutputUri(input, kind);

  if (kind !== "compact" && !config.overwrite && await exists(output)) {
    vscode.window.showWarningMessage(`Skipped existing file: ${getWorkspaceRelativePath(output)}`);
    return;
  }

  await ensureParentDirectory(output);
  await vscode.workspace.fs.writeFile(output, new TextEncoder().encode(content));
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function ensureParentDirectory(uri: vscode.Uri): Promise<void> {
  const dir = vscode.Uri.file(path.dirname(uri.fsPath));
  await vscode.workspace.fs.createDirectory(dir);
}
