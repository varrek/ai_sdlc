---
name: ui-smoke-check
description: Run a focused Playwright smoke pass on changed UI surfaces after Engineer writes land.
paths:
  - "**/*.{tsx,jsx,vue,svelte,css,scss}"
---

# UI smoke check

After implementation and before final review, run a **narrow** browser smoke pass
on surfaces touched by the change.

1. Identify critical user paths affected (navigation, forms, primary actions).
2. Invoke the bound Playwright MCP server per the `playwright` contract.
3. Capture failures with traces or screenshots referenced in the review handoff.
4. Do not disable failing tests to greenwash — file defects instead.

Requires overlay binding for `playwright`. Missing binding is a setup gap, not a
reason to skip the base test gate.
