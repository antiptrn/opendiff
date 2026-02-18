# OpenDiff for VS Code

Review your local Git changes with AI before you push.

## Features

- Reviews local unstaged/staged changes from your current repository.
- Shows review feedback directly in VS Code.
- Lets you tune review strictness with a sensitivity setting.
- Supports comparing against a configurable base branch.

## Commands

- `OpenDiff: Review Local Changes` (`opendiff.reviewChanges`)

## Configuration

- `opendiff.serverUrl` (default: `http://localhost:3001`)
  - URL of the OpenDiff BFF server.
- `opendiff.sensitivity` (default: `50`)
  - Review sensitivity from `0` (lenient) to `100` (strict).
- `opendiff.baseBranch` (default: `main`)
  - Base branch used for branch diff comparison.

## Requirements

- A running OpenDiff backend server reachable from VS Code.

## Development

```bash
bun install
bun run build
```

## License

Licensed under AGPL-3.0-only. See `LICENSE.md`.
