import * as vscode from "vscode";
import { postLocalReview } from "../api/client";
import { getDiffFiles } from "../git/diff";
import { applyDiagnostics } from "../ui/diagnostics";
import { pickDiffScope } from "../ui/picker";

export async function reviewChanges(diagnosticCollection: vscode.DiagnosticCollection) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("OpenDiff: No workspace folder open.");
    return;
  }

  const scope = await pickDiffScope();
  if (!scope) {
    return; // user cancelled
  }

  const config = vscode.workspace.getConfiguration("opendiff");
  const serverUrl = config.get<string>("serverUrl", "http://localhost:3001");
  const sensitivity = config.get<number>("sensitivity", 50);
  const baseBranch = config.get<string>("baseBranch", "main");

  // Get GitHub token via VSCode's built-in auth provider
  let session: vscode.AuthenticationSession;
  try {
    session = await vscode.authentication.getSession("github", ["read:user"], {
      createIfNone: true,
    });
  } catch {
    vscode.window.showErrorMessage("OpenDiff: GitHub sign-in is required.");
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "OpenDiff: Reviewing changes...",
      cancellable: false,
    },
    async () => {
      try {
        const files = getDiffFiles(cwd, scope, baseBranch);
        if (files.length === 0) {
          vscode.window.showInformationMessage("OpenDiff: No changes found.");
          return;
        }

        const title = scope === "branch" ? `Branch changes vs ${baseBranch}` : "Working tree changes";
        const result = await postLocalReview(serverUrl, session.accessToken, {
          files,
          title,
          sensitivity,
        });

        diagnosticCollection.clear();
        applyDiagnostics(diagnosticCollection, result.issues, cwd);

        const issueCount = result.issues.length;
        const msg = `OpenDiff: ${issueCount} issue${issueCount !== 1 ? "s" : ""} found. Verdict: ${result.verdict}`;
        vscode.window.showInformationMessage(msg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`OpenDiff: ${message}`);
      }
    }
  );
}
