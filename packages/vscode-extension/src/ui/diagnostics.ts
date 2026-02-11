import * as vscode from "vscode";
import type { CodeIssue } from "../types";

export function applyDiagnostics(
  collection: vscode.DiagnosticCollection,
  issues: CodeIssue[],
  workspaceRoot: string
) {
  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const issue of issues) {
    const filePath = vscode.Uri.file(`${workspaceRoot}/${issue.file}`);
    const key = filePath.toString();

    if (!byFile.has(key)) {
      byFile.set(key, []);
    }

    const line = Math.max(0, issue.line - 1); // VSCode is 0-indexed
    const endLine = issue.endLine ? Math.max(0, issue.endLine - 1) : line;
    const range = new vscode.Range(line, 0, endLine, Number.MAX_SAFE_INTEGER);

    const severity = mapSeverity(issue.severity);
    const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
    diagnostic.source = "OpenDiff";
    diagnostic.code = issue.type;

    if (issue.suggestion) {
      diagnostic.message += `\n\nSuggestion: ${issue.suggestion}`;
    }

    byFile.get(key)?.push(diagnostic);
  }

  for (const [uriStr, diagnostics] of byFile) {
    collection.set(vscode.Uri.parse(uriStr), diagnostics);
  }
}

function mapSeverity(severity: CodeIssue["severity"]): vscode.DiagnosticSeverity {
  switch (severity) {
    case "critical":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "suggestion":
      return vscode.DiagnosticSeverity.Information;
  }
}
