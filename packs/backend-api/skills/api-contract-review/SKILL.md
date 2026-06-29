---
name: api-contract-review
description: Checklist for reviewing HTTP/RPC API changes before merge.
paths:
  - "**/*.{py,ts,go,rs,java}"
  - "**/openapi.*"
  - "**/swagger.*"
---

# API contract review

Run during review when handlers, schemas, or OpenAPI specs change.

1. **Surface** — routes/methods, auth requirements, idempotency for mutating ops.
2. **Schema** — request/response types, nullable fields, pagination, error envelope.
3. **Compatibility** — breaking vs additive changes; version or feature-flag strategy.
4. **Persistence** — migrations indexed; read-only DB introspection validates assumptions.
5. **Observability** — structured errors without leaking secrets.

Findings feed the API Reviewer or base Reviewer handoff. Does not bypass tests or
Approved? gate.
