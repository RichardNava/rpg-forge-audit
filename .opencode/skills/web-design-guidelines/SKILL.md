---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to review UI, accessibility, UX, or interface best practices.
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review the requested UI files for interface quality, accessibility, responsive
behavior, interaction clarity, and visual hierarchy. Report concise findings
with `file:line` references and concrete recommendations. Do not edit files
unless explicitly asked to implement corrections.

## Current Source

For a fresh upstream review, fetch:

```text
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Apply its current rules to the supplied scope. If no scope is supplied, ask for
the file or pattern to review.
