import * as vscode from "vscode";
import type { DiffScope } from "../git/diff";

export async function pickDiffScope(): Promise<DiffScope | undefined> {
  const items: vscode.QuickPickItem[] = [
    {
      label: "Working tree changes",
      description: "Unstaged changes in your working directory",
    },
    {
      label: "Branch changes",
      description: "All commits on this branch vs base branch",
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "What should OpenDiff review?",
  });

  if (!picked) return undefined;
  return picked.label === "Working tree changes" ? "working" : "branch";
}
