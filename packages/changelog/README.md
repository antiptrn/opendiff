# changelog

Local markdown source for website changelog entries.

## File location

- Store changelog files in `entries/`.
- Use a date filename when possible, for example: `2026-02-15.md`.

## Supported frontmatter

```md
---
title: OpenDiff v1.2.3
version: v1.2.3
date: 2026-02-15
---
```

## Notes

- `title`: optional (falls back to first markdown heading).
- `version`: optional (parsed from heading if omitted).
- `date`: optional (falls back to `Released:` line or date in filename).
- Markdown content is rendered directly by the website changelog feature.
