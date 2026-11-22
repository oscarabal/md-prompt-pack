import * as vscode from "vscode";
import { generateCompactForFolder, generateForFile } from "./markdownPack";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("mdPromptPack.generateHuman", async (uri?: vscode.Uri) => {
      await generateForFile(uri, "human");
    }),

    vscode.commands.registerCommand("mdPromptPack.generateCompact", async (uri?: vscode.Uri) => {
      await generateForFile(uri, "compact");
    }),

    vscode.commands.registerCommand("mdPromptPack.generateBoth", async (uri?: vscode.Uri) => {
      await generateForFile(uri, "both");
    }),

    vscode.commands.registerCommand("mdPromptPack.generateFolderCompact", async (uri?: vscode.Uri) => {
      await generateCompactForFolder(uri);
    })
  );
}

export function deactivate(): void {
  // No resources to release.
}
