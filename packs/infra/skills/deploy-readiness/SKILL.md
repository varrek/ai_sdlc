---
name: deploy-readiness
description: Pre-merge checklist for infrastructure and deployment changes.
paths:
  - "**/.github/workflows/**"
  - "**/Dockerfile*"
  - "**/*.{tf,yml,yaml}"
  - "**/helm/**"
  - "**/k8s/**"
---

# Deploy readiness

Run before approving infra or pipeline changes.

1. **Scope** — which services/environments change; canary vs big-bang.
2. **Secrets** — no plaintext credentials; rotation path documented if keys change.
3. **Rollback** — revert plan or feature flag off-ramp exists.
4. **Observability** — alerts/dashboards updated for new failure modes.
5. **Ticket link** — Linear issue referenced when change tracks ops work.

Block merge when prod impact lacks rollback or test evidence. Does not replace
the base test gate.
