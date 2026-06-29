# Sample Repo Fixtures

These fixtures are the offline regression gate for ai-sdlc repo mining, compile, smoke, and behavior-eval checks.

When `aisdlc bench` finds a product issue in an external GitHub repo:

1. Confirm the failure is an ai-sdlc bug or limitation, not just upstream drift or a local network problem.
2. Reduce the external repo shape to the smallest fixture that still reproduces the mined signal or setup failure.
3. Add the fixture under `tests/fixtures/sample-repos/<name>/`.
4. Add or update a corpus expectation in `tests/corpus/corpus-expectations.ts`.
5. Keep the fixture focused on evidence ai-sdlc needs to mine. Do not vendor full external projects.
6. If the failure cannot be reduced, keep the bench report residual and link it from the follow-up issue or PR notes.

The checked-in fixture should be enough for default `npm test` to catch the regression without network access.
