---
title: Introducing our local markdown blog
description: We moved blog content into versioned markdown files so writing and shipping articles matches our release workflow.
date: 2026-02-10
author: OpenDiff Team
---

# Introducing our local markdown blog

We now publish blog posts from markdown files in the repository.

This gives us a simple publishing flow:

- Draft content in markdown.
- Open a pull request for review.
- Deploy with the rest of the codebase.

The website reads these files at build time, so there is no database CRUD path for blog content.
