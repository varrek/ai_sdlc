# Security pack guidance

Apply this pack when changes touch authentication, authorization, secrets, or user
data. Security reviews are **read-only** — findings go to the Engineer and human
reviewers; this pack never weakens the base Approved? gate or test requirements.

- Prefer least-privilege integration access: Sentry is for read-only triage during
  review, not mutating production configuration.
- Record unresolved findings as blockers before merge.
