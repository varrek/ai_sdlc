# Mobile pack guidance

Use for native iOS, native Android, React Native, and Flutter changes. Prefer
repo-mined test commands and platform tooling over ad-hoc device guesses.

- Run smoke checks on a simulator or emulator before merge when behavior is user-visible.
- Platform-specific permissions, entitlements, and native bridge boundaries need explicit review.
- Device automation integrations are optional overlay bindings — this pack ships guidance only.
