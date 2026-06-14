---
name: wrap-up
description: On approval, open/update the GitLab MR and update the Jira issue via least-privilege MCP, validating responses against the integration contracts.
disableModelInvocation: true
---

# /wrap-up

The final step of the SDLC loop. Runs **only after** the Reviewer approves and the
`Approved?` gate passes. Performed by the Engineer role (the sole writer); other
roles are denied these MCP calls by least-privilege.

## Steps

1. **Read bindings.** The MCP server ids for `gitlab` and `jira` come from the
   project overlay (`/customize` produced them). The base never hardcodes them.
2. **Open/update the MR.** Call the GitLab `create-mr` (or `update-mr`) tool on the
   bound server with the source/target branches, title, and description.
3. **Update Jira.** Add a comment linking the MR and transition the issue per the
   `jira` contract.
4. **Validate responses.** Each response is checked against the thin integration
   contract. A shape mismatch (missing required field, wrong type) is **recorded as
   a contract gap** for the next `/customize` — never silently passed.

## Guarantees

- **Least-privilege:** a role without the `gitlab`/`jira` integration (e.g. the
  read-only Reviewer) is denied — the call raises rather than executing.
- **Contract-checked:** the wrap-up reports gaps instead of trusting the server
  blindly, so drift in the internal Jira/GitLab MCP surfaces early.
- **No live creds in CI:** the smoke gate exercises this path against MCP mocks.
