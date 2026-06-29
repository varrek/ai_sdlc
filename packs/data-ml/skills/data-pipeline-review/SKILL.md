---
name: data-pipeline-review
description: Checklist for reviewing data pipelines, notebooks, migrations, and ML training changes.
paths:
  - "**/*.{ipynb,sql}"
  - "**/dbt/**"
  - "**/airflow/**"
  - "**/dagster/**"
  - "**/prefect/**"
  - "**/mlflow/**"
  - "**/*pipeline*"
  - "**/migrations/**"
---

# Data pipeline review

Run during review when batch jobs, notebooks, migrations, or model artifacts change.

1. **Scope** — sources, sinks, schedule, and blast radius of backfill or replay.
2. **Idempotency** — job can rerun safely; dedupe keys and late-arriving data handled.
3. **Schema** — migration order documented; breaking changes flagged for consumers.
4. **Reproducibility** — pinned libs, dataset versions, and seed/config for training.
5. **Validation** — row counts, sampling checks, or tests cited; no silent data loss.
6. **PII** — unexpected fields in logs or exports; escalate when retention is unclear.

Findings feed the Data Reviewer or base Reviewer handoff. Does not bypass tests
or Approved? gate.
