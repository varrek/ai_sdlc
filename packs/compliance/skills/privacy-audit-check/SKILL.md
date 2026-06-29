---
name: privacy-audit-check
description: Pre-merge checklist for privacy, logging, and audit-sensitive changes.
paths:
  - "**/*auth*"
  - "**/*privacy*"
  - "**/*consent*"
  - "**/*audit*"
  - "**/logging/**"
  - "**/*.{env,yaml,yml,toml}"
---

# Privacy and audit check

Run when changes touch user data, authentication, logging, retention, or
export/deletion flows.

1. **Data inventory** — new or changed fields classified (PII, sensitive, public).
2. **Purpose limitation** — use matches documented product or policy purpose.
3. **Logging** — no raw secrets, tokens, or unnecessary PII in logs or metrics.
4. **Retention** — storage duration and deletion path documented or unchanged.
5. **Audit evidence** — ticket, approval, or policy reference linked in PR or commit.
6. **Cross-border / subprocessors** — flag when data flows to new vendors or regions.

Block merge on undocumented PII collection or missing audit reference for
regulated changes. Does not replace security threat modeling or base test gates.
