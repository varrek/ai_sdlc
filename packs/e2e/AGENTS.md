# E2E pack constitution

When this pack is active (browser E2E framework detected), generated E2E tests follow:

- **Explore before generate** — map the UI flow before writing selectors.
- **Test pyramid budget** — favor unit/integration; cap E2E count per feature.
- **Bounded self-healing** — at most 3 selector/heal retries before escalating.
- **Test bug vs app bug** — failing E2E requires classification before code changes.

Generated automation is deterministic; keep AI off the execution path (see base Constitution).
