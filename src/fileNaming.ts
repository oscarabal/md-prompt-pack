import * as path from "path";
import * as vscode from "vscode";

export type OutputKind = "human" | "compact";

export interface MdPromptPackConfiguration {
  outputMode: "sibling" | "generatedFolder";
  generatedFolderName: string;
  overwrite: boolean;
  excludeGeneratedFiles: boolean;
  compactValidation: "off" | "warn" | "block";
  showTokenStats: boolean;
  compactPunctuation: boolean;
  compactBlankLines: "readable" | "minimal";
}

export function getConfiguration(): MdPromptPackConfiguration {
  const config = vscode.workspace.getConfiguration("mdPromptPack");

  return {
    outputMode: config.get<"sibling" | "generatedFolder">("outputMode", "sibling"),
    generatedFolderName: config.get<string>("generatedFolderName", ".mdpack"),
    overwrite: config.get<boolean>("overwrite", true),
    excludeGeneratedFiles: config.get<boolean>("excludeGeneratedFiles", true),
    compactValidation: config.get<"off" | "warn" | "block">("compactValidation", "warn"),
    showTokenStats: config.get<boolean>("showTokenStats", true),
    compactPunctuation: config.get<boolean>("compactPunctuation", false),
    compactBlankLines: config.get<"readable" | "minimal">("compactBlankLines", "readable")
  };
}

export function getOutputUri(input: vscode.Uri, kind: OutputKind): vscode.Uri {
  const config = getConfiguration();
  const parsed = path.parse(input.fsPath);

  if (config.outputMode === "generatedFolder") {
    const outputDir = path.join(parsed.dir, config.generatedFolderName);
    return vscode.Uri.file(path.join(outputDir, `${parsed.name}.${kind}${parsed.ext}`));
  }

  return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}.${kind}${parsed.ext}`));
}

export function isMarkdownFile(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith(".md");
}

export function isGeneratedMarkdown(uri: vscode.Uri): boolean {
  const lower = uri.fsPath.toLowerCase();
  return lower.endsWith(".human.md") || lower.endsWith(".compact.md");
}

export function getWorkspaceRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}
