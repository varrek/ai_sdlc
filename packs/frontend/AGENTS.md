# Frontend pack guidance

Use for user-facing UI work. Browser automation runs through the Playwright
contract; library docs through Context7. Both bind via the project overlay — no
credentials ship in the pack.

- UI smoke checks supplement, never replace, the project test suite.
- Accessibility and visual regressions are human-review items when automation cannot decide.
