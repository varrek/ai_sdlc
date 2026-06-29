---
name: threat-model
description: Produce a lightweight threat model before implementing security-sensitive changes.
paths:
  - "**/*auth*"
  - "**/*security*"
---

# Threat model (lightweight)

Run **before** implementation when a change touches auth, payments, PII, or
administrative actions.

1. Name the **assets** (data, credentials, capabilities) at risk.
2. Draw **trust boundaries** (user, service, database, third party).
3. List **threats** (spoofing, tampering, elevation, data exposure) per boundary.
4. Map **mitigations** already in the design vs gaps that need work.
5. Stop at **Approved?** if unresolved high-severity gaps remain.

Keep the model short — one page. Link evidence (files, contracts) rather than
speculating.
