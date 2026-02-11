import * as vscode from "vscode";
import { postLocalReview } from "../api/client";
import { getDiffFiles, type DiffScope } from "../git/diff";
import type { ReviewResult } from "../types";
import { applyDiagnostics } from "./diagnostics";

export class ReviewPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "opendiff.reviewPanel";

  private view?: vscode.WebviewView;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private lastResult?: ReviewResult;

  constructor(diagnosticCollection: vscode.DiagnosticCollection) {
    this.diagnosticCollection = diagnosticCollection;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "review") {
        await this.runReview(message.scope as DiffScope);
      } else if (message.type === "goToIssue") {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const fileUri = vscode.Uri.file(`${workspaceFolder.uri.fsPath}/${message.file}`);
          const line = Math.max(0, (message.line || 1) - 1);
          const doc = await vscode.workspace.openTextDocument(fileUri);
          const editor = await vscode.window.showTextDocument(doc);
          const range = new vscode.Range(line, 0, line, 0);
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
      }
    });

    this.renderIdle();
  }

  private async runReview(scope: DiffScope) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.renderError("No workspace folder open.");
      return;
    }

    let session: vscode.AuthenticationSession;
    try {
      session = await vscode.authentication.getSession("github", ["read:user"], {
        createIfNone: true,
      });
    } catch {
      this.renderError("GitHub sign-in is required.");
      return;
    }

    const config = vscode.workspace.getConfiguration("opendiff");
    const serverUrl = config.get<string>("serverUrl", "http://localhost:3001");
    const sensitivity = config.get<number>("sensitivity", 50);
    const baseBranch = config.get<string>("baseBranch", "main");
    const cwd = workspaceFolder.uri.fsPath;

    this.renderLoading();

    try {
      const files = getDiffFiles(cwd, scope, baseBranch);
      if (files.length === 0) {
        this.renderError("No changes found.");
        return;
      }

      const title = scope === "branch" ? `Branch changes vs ${baseBranch}` : "Working tree changes";
      const result = await postLocalReview(serverUrl, session.accessToken, {
        files,
        title,
        sensitivity,
      });

      this.lastResult = result;
      this.diagnosticCollection.clear();
      applyDiagnostics(this.diagnosticCollection, result.issues, cwd);
      this.renderResults(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.renderError(message);
    }
  }

  private renderIdle() {
    if (!this.view) return;
    this.view.webview.html = this.getHtml(/* language=html */ `
      <div class="actions">
        <button onclick="review('working')">Review Working Tree</button>
        <button onclick="review('branch')" class="secondary">Review Branch</button>
      </div>
      <p class="hint">Review your local changes before pushing.</p>
    `);
  }

  private renderLoading() {
    if (!this.view) return;
    this.view.webview.html = this.getHtml(/* language=html */ `
      <div class="loading">
        <div class="spinner"></div>
        <p>Reviewing changes...</p>
      </div>
    `);
  }

  private renderError(message: string) {
    if (!this.view) return;
    this.view.webview.html = this.getHtml(/* language=html */ `
      <div class="error">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="actions">
        <button onclick="review('working')">Retry Working Tree</button>
        <button onclick="review('branch')" class="secondary">Retry Branch</button>
      </div>
    `);
  }

  private renderResults(result: ReviewResult) {
    if (!this.view) return;

    const verdictClass =
      result.verdict === "approve" ? "approve" : result.verdict === "request_changes" ? "reject" : "comment";
    const verdictLabel =
      result.verdict === "approve"
        ? "Approved"
        : result.verdict === "request_changes"
          ? "Changes Requested"
          : "Comment";

    const issuesHtml = result.issues.length === 0
      ? '<p class="no-issues">No issues found.</p>'
      : result.issues
          .map(
            (issue) => /* language=html */ `
        <div class="issue issue-${issue.severity}" onclick="goToIssue('${escapeAttr(issue.file)}', ${issue.line})">
          <div class="issue-header">
            <span class="severity ${issue.severity}">${issue.severity}</span>
            <span class="type">${issue.type}</span>
          </div>
          <div class="issue-message">${escapeHtml(issue.message)}</div>
          <div class="issue-location">${escapeHtml(issue.file)}:${issue.line}</div>
        </div>`
          )
          .join("\n");

    this.view.webview.html = this.getHtml(/* language=html */ `
      <div class="verdict ${verdictClass}">
        <span class="verdict-label">${verdictLabel}</span>
        <span class="issue-count">${result.issues.length} issue${result.issues.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="summary">${escapeHtml(result.summary)}</div>
      <div class="issues">${issuesHtml}</div>
      <div class="actions">
        <button onclick="review('working')">Review Again</button>
        <button onclick="review('branch')" class="secondary">Review Branch</button>
      </div>
    `);
  }

  private getHtml(body: string): string {
    return /* language=html */ `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 12px;
  }
  .actions { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  button {
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .hint { color: var(--vscode-descriptionForeground); font-size: 12px; text-align: center; }
  .loading { text-align: center; padding: 24px 0; }
  .spinner {
    width: 24px; height: 24px; margin: 0 auto 12px;
    border: 2px solid var(--vscode-foreground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { padding: 8px; margin-bottom: 12px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
  .verdict {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600;
  }
  .verdict.approve { background: rgba(35, 134, 54, 0.2); }
  .verdict.reject { background: rgba(218, 54, 51, 0.2); }
  .verdict.comment { background: rgba(210, 153, 34, 0.2); }
  .issue-count { font-weight: normal; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .summary { font-size: 12px; margin-bottom: 12px; color: var(--vscode-descriptionForeground); line-height: 1.4; }
  .issues { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .issue {
    padding: 8px; border-radius: 4px; cursor: pointer;
    border-left: 3px solid transparent;
    background: var(--vscode-list-hoverBackground);
  }
  .issue:hover { background: var(--vscode-list-activeSelectionBackground); }
  .issue-critical { border-left-color: var(--vscode-errorForeground); }
  .issue-warning { border-left-color: var(--vscode-editorWarning-foreground); }
  .issue-suggestion { border-left-color: var(--vscode-editorInfo-foreground); }
  .issue-header { display: flex; gap: 6px; margin-bottom: 4px; }
  .severity {
    font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 1px 5px;
    border-radius: 3px;
  }
  .severity.critical { background: var(--vscode-errorForeground); color: var(--vscode-editor-background); }
  .severity.warning { background: var(--vscode-editorWarning-foreground); color: var(--vscode-editor-background); }
  .severity.suggestion { background: var(--vscode-editorInfo-foreground); color: var(--vscode-editor-background); }
  .type { font-size: 10px; color: var(--vscode-descriptionForeground); align-self: center; }
  .issue-message { font-size: 13px; margin-bottom: 2px; }
  .issue-location { font-size: 11px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
  .no-issues { color: var(--vscode-descriptionForeground); font-size: 12px; text-align: center; padding: 12px 0; }
</style>
</head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    function review(scope) { vscode.postMessage({ type: 'review', scope }); }
    function goToIssue(file, line) { vscode.postMessage({ type: 'goToIssue', file, line }); }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
