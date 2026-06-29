# Extension packs

Extension packs let teams opt into domain-specific roles, skills, and MCP
integration contracts without forking `sdlc-base/`. The compiler merges packs
additively at load time.

## Using reference packs

Pass one or more pack directories to `compile` and `smoke`:

```bash
aisdlc compile \
  --base /path/to/ai_sdlc/sdlc-base \
  --packs /path/to/ai_sdlc/packs/security,/path/to/ai_sdlc/packs/backend-api \
  --out .

aisdlc smoke --repo . --config . \
  --packs /path/to/ai_sdlc/packs/security,/path/to/ai_sdlc/packs/backend-api \
  --compile
```

Shipped reference packs live under [`packs/`](../packs/README.md):

- **security** — `security-reviewer`, `threat-model`, Sentry contract
- **frontend** — `frontend-reviewer`, `ui-smoke-check`, Playwright + Context7
- **backend-api** — `api-reviewer`, `api-contract-review`, GitHub + database
- **infra** — `infra-reviewer`, `deploy-readiness`, Linear

Pick packs that match the work. Combining all four is valid when names stay
unique across base + packs.

### Binding MCP servers

Packs ship **integration contracts** (tool names and shapes), not live servers.
Bind each contract in the project overlay:

```yaml
version: 1
integrations:
  sentry:
    serverId: sentry-mcp
    allowedRoles:
      - security-reviewer
    server:
      command: sentry-mcp-server
      env:
        SENTRY_AUTH_TOKEN: SENTRY_AUTH_TOKEN
  github:
    serverId: github-mcp
    allowedRoles:
      - api-reviewer
    server:
      command: github-mcp-server
      env:
        GITHUB_TOKEN: GITHUB_TOKEN
```

Only roles listed in `allowedRoles` (and declared on the role's `integrations:`
list) may invoke tools for that contract. This preserves least-privilege across
hosts.

Integrations are **not blocking** during first-run `/customize` — bind them
just-in-time when a workflow step needs them, same as base GitLab/Jira.

## Pack anatomy

Each pack is a directory:

```
packs/my-pack/
├── pack.yaml          # required manifest (version, name, description)
├── AGENTS.md          # optional constitution addendum
├── roles/             # optional role markdown files
├── skills/            # optional skills/<name>/SKILL.md
└── integrations/      # optional *.contract.yaml
```

### `pack.yaml`

```yaml
version: 1
name: my-pack
description: One-line summary (lowercase slug name)
```

`name` must match `^[a-z][a-z0-9-]*$` and be unique among loaded packs.

### Roles

Roles follow the same schema as base roles (`roles/*.md` with YAML frontmatter):

```markdown
---
name: my-reviewer
description: What this role does
posture: read-only
integrations:
  - sentry
---

System prompt body…
```

Postures: `read-only`, `read-run`, `write`. Prefer `read-only` for reviewers.

### Skills

Skills live at `skills/<slug>/SKILL.md`:

```markdown
---
name: my-skill
description: When to use this skill
paths:
  - "**/*.ts"
---

Skill body…
```

### Integration contracts

Contracts describe MCP tool mappings validated at wrap-up time:

```yaml
name: sentry
description: Read Sentry issues for triage
operations:
  - id: get-issue
    tool: sentry_get_issue
    inputs:
      - name: issueId
        type: string
        required: true
    outputs:
      - name: title
        type: string
```

Place new contracts in a pack's `integrations/` directory unless they belong in
the universal base (GitLab/Jira wrap-up for all teams).

## Authoring checklist

1. **Unique names** — role, skill, integration, and pack slugs must not collide
   with the base or other loaded packs.
2. **Additive only** — packs cannot disable gates, change base role postures, or
   override existing artifacts. There is no pack field for gate configuration.
3. **Least privilege** — declare `integrations:` on roles sparingly; use
   read-only contracts for review roles; scope `allowedRoles` in the overlay.
4. **No secrets in pack content** — reference env var *names* in overlay
   bindings, never literal tokens.
5. **Evidence over prose** — skills and roles should point at files, tests, and
   contracts rather than bypassing Approved? or test requirements.

## Safety constraints

| Constraint | Enforcement |
| --- | --- |
| Hard gates (review, tests, Approved?, least-privilege MCP) | Base constitution; not overridable by packs or overlay typos |
| No artifact override | Loader throws on duplicate pack/role/skill/integration names |
| No gate fields in overlay | Overlay schema rejects unknown keys like `reviewRequired: false` |
| MCP access | Role `integrations:` + overlay `allowedRoles` + host permission emit |

Packs that attempt to replace base skills (e.g. a second `customize` skill) fail
at compile time:

```
Duplicate skill 'customize' found while loading base packs.
```

## Example: minimal custom pack

```bash
mkdir -p packs/team-data/skills/data-review
cat > packs/team-data/pack.yaml <<'EOF'
version: 1
name: team-data
description: Data pipeline review checklist
EOF
cat > packs/team-data/skills/data-review/SKILL.md <<'EOF'
---
name: data-review
description: Review batch pipeline changes for idempotency and backfill safety
---

Check partitioning, replay, and PII handling before merge.
EOF
```

```bash
aisdlc compile --base ./sdlc-base --packs ./packs/team-data --out /tmp/emit-check
```

## Related

- [`CONCEPTS.md`](../CONCEPTS.md) — base, overlay, integration binding vocabulary
- [`README.md`](../README.md) — CLI quickstart with `--packs`
- Plan: [`docs/plans/2026-06-29-002-feat-reference-packs-mcp-contracts-plan.md`](./plans/2026-06-29-002-feat-reference-packs-mcp-contracts-plan.md)
