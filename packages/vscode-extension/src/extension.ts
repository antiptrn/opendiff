import * as vscode from "vscode";
import { reviewChanges } from "./commands/review";
import { ReviewPanelProvider } from "./ui/review-panel";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("opendiff");
  context.subscriptions.push(diagnosticCollection);

  // Register the SCM panel view
  const panelProvider = new ReviewPanelProvider(diagnosticCollection);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReviewPanelProvider.viewType, panelProvider)
  );

  // Keep the command for palette / menu access
  const disposable = vscode.commands.registerCommand("opendiff.reviewChanges", () =>
    reviewChanges(diagnosticCollection)
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {
  diagnosticCollection?.dispose();
}
