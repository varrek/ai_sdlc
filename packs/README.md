# Extension packs

Curated reference packs extend the host-neutral base without forking it. They are
**additive**: duplicate pack, role, skill, or integration names fail at load time
instead of overriding base content.

| Pack | Focus | Integrations |
| --- | --- | --- |
| [backend-api](./backend-api/) | API contract review | `github`, `database` |
| [compliance](./compliance/) | Privacy and audit-sensitive review | — |
| [data-ml](./data-ml/) | Data pipelines, notebooks, ML reproducibility | — |
| [frontend](./frontend/) | UI review, browser smoke | `playwright`, `context7` |
| [infra](./infra/) | Deploy readiness | `linear` |
| [mobile](./mobile/) | Mobile review, simulator smoke | _(none — guidance only)_ |
| [security](./security/) | Threat modeling, security review | `sentry` |

See [docs/packs.md](../docs/packs.md) for usage, authoring, and safety constraints.

## Quick usage

From a project repo (paths relative to the ai-sdlc clone):

```bash
aisdlc compile \
  --base /path/to/ai_sdlc/sdlc-base \
  --packs /path/to/ai_sdlc/packs/security,/path/to/ai_sdlc/packs/frontend \
  --out .
```

Bind MCP servers for pack integrations in `.sdlc/overlay/.customize.yaml` the
same way as base GitLab/Jira — packs ship contracts only, not credentials.
