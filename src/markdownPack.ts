import * as path from "path";
import * as vscode from "vscode";
import {
  getConfiguration,
  getOutputUri,
  getWorkspaceRelativePath,
  isGeneratedMarkdown,
  isMarkdownFile,
  OutputKind
} from "./fileNaming";
import { toCompactMarkdown, toHumanMarkdown } from "./markdownTransform";

export type GenerationMode = "human" | "compact" | "both";

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

  if (mode === "human" || mode === "both") {
    await writeOutput(input, "human", toHumanMarkdown(original));
  }

  if (mode === "compact" || mode === "both") {
    await writeOutput(input, "compact", toCompactMarkdown(original));
  }

  vscode.window.showInformationMessage(`Markdown ${mode} generation completed for ${getWorkspaceRelativePath(input)}.`);
}

export async function generateCompactForFolder(uri: vscode.Uri | undefined): Promise<void> {
  if (!uri) {
    vscode.window.showErrorMessage("No folder selected.");
    return;
  }

  const files = await collectMarkdownFiles(uri);
  let count = 0;

  for (const file of files) {
    const original = await readText(file);
    await writeOutput(file, "compact", toCompactMarkdown(original));
    count++;
  }

  vscode.window.showInformationMessage(`Generated ${count} compact Markdown file(s).`);
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
