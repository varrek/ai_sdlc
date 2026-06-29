---
name: mobile-smoke-check
description: Run a focused simulator or emulator smoke pass on changed mobile surfaces after Engineer writes land.
paths:
  - "**/*.{swift,m,h,kts,kt,java,dart,tsx,jsx}"
  - "**/{ios,android}/**/*"
  - "**/pubspec.yaml"
  - "**/Podfile"
  - "**/build.gradle*"
---

# Mobile smoke check

After implementation and before final review, run a **narrow** smoke pass on
simulator or emulator for surfaces touched by the change.

1. Identify the platform stack (iOS, Android, React Native, Flutter) from changed files.
2. Use the repo-mined or package-local test command when available — do not invent runners.
3. For UI changes, exercise critical paths on simulator/emulator (launch, navigation, primary actions).
4. Capture failures with logs or screenshots referenced in the review handoff.
5. Do not disable failing tests to greenwash — file defects instead.

Optional device-farm or Maestro/Detox MCP bindings belong in the project overlay
when configured. Missing automation binding is a setup gap, not a reason to skip
the base test gate.
