# articles

Local markdown source for website blog posts.

## File location

- Store articles in `entries/`.
- Use the article slug as the filename, for example: `my-first-post.md`.

## Supported frontmatter

```md
---
title: Your article title
description: Short summary used in blog cards
date: 2026-02-10
author: OpenDiff Team
---
```

## Notes

- `title`: optional (falls back to first `# Heading` or slug-based title).
- `description`: optional (falls back to first paragraph excerpt).
- `date`: optional, expected format `YYYY-MM-DD`.
- `author`: optional (defaults to `OpenDiff Team`).
