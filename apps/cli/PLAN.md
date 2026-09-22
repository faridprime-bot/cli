# PLAN — `supabase apps serve` (MCP App: preview branches viewer)

Autonomous implementation plan for the first MCP App feature in the CLI. See
`DECISIONS.md` for the rationale behind each non-obvious choice made while
executing this plan.

## Feature

`supabase apps serve` starts an MCP server on stdio that exposes:

- A tool `list_branches` — lists the linked project's preview branches
  (reuses the same Management API call as `branches list`), declaring
  `_meta.ui.resourceUri` so MCP-Apps-aware hosts render an interactive view.
- A UI resource `ui://apps/branches` — a self-contained, server-rendered HTML
  table of the same branch data.

Read-only, reuses the existing `branches list` data path, small vertical
slice — matches the autonomy brief's selection criteria.

## Steps

1. **`serve.errors.ts`** — typed errors for the branches fetch
   (`LegacyAppsBranchesNetworkError`, `LegacyAppsBranchesUnexpectedStatusError`)
   and the stdio transport (`LegacyAppsServeTransportError`), each with an
   `[ErrorActionabilityId]` declaration.
   - Verify: `pnpm types:check`.

2. **`serve.branches.ts`** — `legacyAppsFetchBranches(ref)`, an Effect that
   calls `LegacyPlatformApi.v1.listAllBranches` and maps failures via
   `mapLegacyHttpError`. Pure aside from the `LegacyPlatformApi` dependency.
   - Verify: `serve.branches.integration.test.ts` (success, network error,
     unexpected-status error, empty list) + `pnpm test:integration`.

3. **`serve.view.ts`** — `renderAppsBranchesHtml(branches)`, a pure function
   building the static HTML resource body (escaped, no external requests).
   - Verify: `serve.view.unit.test.ts` (empty list, one branch, HTML-escaping
     of a branch/git-branch name) + `pnpm test:unit`.

4. **`serve.command.ts` + `serve.handler.ts`** — wires flags
   (`--project-ref`, matching `branches list`), resolves the PARENT-scoped
   project ref (same helper `branches` itself uses), builds the `McpServer`,
   registers the tool + resource via `@modelcontextprotocol/ext-apps/server`'s
   `registerAppTool`/`registerAppResource`, connects a `StdioServerTransport`,
   and blocks (via `Effect.callback`) until the transport closes or errors.
   - Verify: `pnpm types:check`.

5. **`apps.command.ts`** + registration in `legacy/cli/root.ts` (alphabetical
   slot, before `backups`).
   - Verify: `pnpm types:check`.

6. **`SIDE_EFFECTS.md`** for `apps serve`.

7. **E2e golden path** — `serve.e2e.test.ts`: spawns the built CLI, speaks the
   newline-delimited JSON-RPC stdio protocol directly (`initialize`,
   `tools/list`, `resources/list`), asserts the tool/resource are advertised
   correctly (including `_meta.ui.resourceUri`), then closes stdin and
   asserts a clean exit. No Management API credentials needed for this path
   — `resources/read`/`tools/call` both fetch live data and are deliberately
   NOT exercised here (see DECISIONS.md #9).
   - Verify: `pnpm exec turbo run supabase#build && pnpm --filter supabase exec vitest run --project e2e src/legacy/commands/apps/serve/serve.e2e.test.ts`.

8. **Final verification**: `pnpm types:check`, `pnpm test:unit`,
   `pnpm test:integration` — diff failing-test list against the recorded
   baseline (must be identical: the 2 known root-chmod unit failures + 1
   known root-chmod integration failure, nothing else new).

## Definition of done

- `supabase apps serve` runs and can be exercised manually (see PR
  description for the exact `initialize`/`tools/list` transcript).
- Unit tests for `serve.view.ts`; integration tests for
  `serve.branches.ts` (100% branch coverage of the new testable units); one
  e2e test for the stdio protocol golden path.
- Error classification (`ErrorActionabilityId`) and telemetry
  (`withLegacyCommandInstrumentation`) follow the established conventions.
- No regressions vs. the recorded baseline.
- `SIDE_EFFECTS.md` added; this PLAN.md and DECISIONS.md left in the repo for
  reviewer context (may be deleted by the reviewer after merge).
