# Releasing the VS Code Extension

This repository publishes the extension to both VS Code Marketplace and Open VSX from a GitHub Release.

## Prerequisites

- Repository secrets are set:
  - `VSCE_PAT`
  - `OVSX_PAT`
- Extension package exists at `packages/vscode-extension/package.json`.

## Release Steps

1. Update extension version:

```bash
# edit packages/vscode-extension/package.json
# bump "version" (example: 0.1.0 -> 0.1.1)
```

2. Commit and merge to `main`.

3. Create a GitHub Release with tag format:

```text
vscode-extension-v<version>
```

Example:

```text
vscode-extension-v0.1.1
```

4. Publish workflow runs automatically:

- Workflow: `.github/workflows/publish-vscode-extension.yml`
- Trigger: `release.published`
- It builds once, packages one VSIX, and publishes to both marketplaces.

## Important Validation

The workflow validates that:

- Tag starts with `vscode-extension-v`
- Tag version matches `packages/vscode-extension/package.json` version exactly

If they do not match, publishing fails.

## Manual Publish (Optional)

You can also run the workflow manually with `workflow_dispatch` from the Actions tab.

## Local Sanity Check (Optional)

```bash
bun run --cwd packages/vscode-extension build
bunx @vscode/vsce package --no-dependencies
```
