# DECISIONS — `supabase apps serve`

Format: **Keputusan | Alternatif | Alasan**

1. **Feature scope: read-only preview-branches MCP App, stdio transport.**
   Alternatif: an HTTP-transport app (using `@modelcontextprotocol/node` /
   `@modelcontextprotocol/express`); a write-capable app (create/delete
   branches). Alasan: task brief requires (a) read-only, (b) reuse of an
   existing command/API, (c) a small valuable slice when `[FITUR]` is
   unspecified. `branches list` is the CLI's simplest read-only
   Management-API command family and is already fully ported/tested, so
   reusing its data path (not its command code — see #7) minimizes new
   surface. Stdio is the transport every other MCP host integration in the
   ecosystem defaults to for a local CLI-spawned server (Claude
   Desktop/Code, VS Code, etc.), and it needs no port/HTTP-server lifecycle
   management, keeping the slice small.

2. **`@modelcontextprotocol/node` and `@modelcontextprotocol/express` stay
   installed but unused by this slice.** Alternatif: remove them since
   nothing imports them. Alasan: they were pre-installed and committed in
   an earlier step of this same session specifically for MCP Apps work, and
   the task brief lists "adding a new dependency outside the list" as a
   STOP WAJIB condition — removing one is the inverse action and not
   something this brief asks for either. They back a *future* HTTP-transport
   variant of this same command. Flagged in the final report as something a
   human may want to prune if no HTTP transport is planned (this will show
   up as an unused-dependency finding the next time `pnpm check:all`
   / knip runs, which is outside this task's required verification scope of
   `types:check` + `test:unit` + `test:integration`).

3. **UI resource is server-rendered static HTML, not a client-side app using
   `@modelcontextprotocol/ext-apps`'s `App` class / postMessage protocol.**
   Alternatif: bundle `@modelcontextprotocol/ext-apps`'s `app-with-deps.js`
   (~400KB minified) into the resource and implement live, bidirectional
   `ui/*` postMessage exchanges (refresh button, drill-down) as the "App"
   framework and MCP Apps examples do. Alasan: the postMessage dialect is a
   real wire protocol with specific method/notification names: implementing
   it by hand without fetching and re-verifying the spec text risks silent
   protocol bugs, and this environment's docs excerpt (pasted into the
   conversation) explicitly sanctions a spec-free static resource — MCP Apps
   only *requires* a tool that declares `_meta.ui.resourceUri` plus a
   `ui://` HTML resource; nothing mandates client-side interactivity for a
   valid app. Both the tool call and the resource read independently call
   the same `legacyAppsFetchBranches` Effect, so the HTML always reflects a
   fresh fetch on every `resources/read`. Still uses
   `@modelcontextprotocol/ext-apps/server`'s `registerAppTool` /
   `registerAppResource` (correct `_meta.ui`/mimeType normalization) — only
   the *client-side* `App` class is skipped. A live/interactive follow-up is
   a natural next slice, not part of this one.

4. **New error classes (`LegacyAppsBranchesNetworkError`,
   `LegacyAppsBranchesUnexpectedStatusError`) instead of reusing
   `branches.errors.ts`'s `LegacyBranchesListNetworkError` /
   `LegacyBranchesListUnexpectedStatusError`.** Alternatif: hoist the
   existing branches-list error pair to `src/legacy/shared/` and have both
   command families use it, per the repo's general "used by ≥2 families →
   hoist to shared/" rule. Alasan: hoisting obligates touching
   `branches/list/list.handler.ts` and its 100%-branch-coverage integration
   suite in the same change (repo policy: never leave the older command on
   an inlined copy once shared). That widens blast radius on an existing,
   stable, heavily-tested command for the sake of ~15 lines of duplicated
   error-class boilerplate that happens to have identical shape. Treated as
   a deliberate, documented exception in the spirit of the Behavioral
   Stability Contract (don't touch established surfaces without a strong
   reason) — flagged for a human to reconsider if a third command needs the
   same HTTP-error pair, at which point the hoist earns its blast radius.

5. **Own project-ref resolution: `legacyResolveParentScopedProjectRef`
   (same helper `branches` uses), not `LegacyProjectRefResolver.resolve`
   directly.** Alternatif: resolve the plain linked ref. Alasan: `list_branches`
   calls the exact same parent-scoped `/v1/projects/{ref}/branches`
   endpoint as `branches list`, which 403s on a branch's own ref — the same
   reasoning documented on that resolver helper applies unchanged here.

6. **stdout is reserved exclusively for the MCP JSON-RPC wire protocol; all
   CLI-side diagnostics go through `Output.raw(text, "stderr")`, never
   `Output.info`/`warn`.** Alternatif: use the ordinary `Output.info`
   logging path like other commands. Alasan: the text-format output layer
   backs `info`/`warn`/`error` with `@clack/prompts`' `log.*` helpers, which
   (per an existing comment in `output.layer.ts`) default to `process.stdout`
   — a single stray byte on stdout would corrupt the newline-delimited
   JSON-RPC stream the connected MCP host is parsing. `Output.raw` gives
   explicit, per-call stream control regardless of `--output-format`, so it
   is used for the one "ready" diagnostic line this command emits.

7. **Tool/resource callbacks bridge into Effect via
   `Effect.runPromiseWith(yield* Effect.context<...>())`, and the whole
   `connect`/lifetime is one `Effect.callback`.** Alternatif: run the
   handler with `Effect.runFork`/global runtime, or make the whole command a
   thin Promise-based wrapper. Alasan: matches
   `CLAUDE.md`'s "Effect-native by default" + "foreign callback boundaries"
   rules — the MCP SDK is a third-party Promise/callback API, so the Promise
   surface is confined to the exact leaf boundary (tool/resource callbacks,
   `transport.onclose`/`onerror`), while `LegacyPlatformApi`,
   `LegacyProjectRefResolver`, etc. stay available as typed Effect services
   throughout the rest of the handler. `Effect.callback`'s cleanup effect
   closes the `McpServer` on interruption (e.g. Ctrl-C), matching the
   "foreign callback boundaries own the complete lifecycle" rule.

8. **`apps serve`'s own error channel classifies transport failures as
   `actionability.unknown`.** Alternatif: `internalPanic` or a new
   `mcpTransport`-specific bucket. Alasan: no existing preset fits a stdio
   transport failure (not a CLI bug, not literally "impossible state"); per
   `CLAUDE.md`, `unknown` is reserved for genuinely unforeseen failures,
   which an interrupted/broken stdio pipe (client disconnected the wrong
   way, OS pipe error) is. Revisit if this proves to actually fire often in
   practice.

9a. **`legacyAppsServe`'s `Effect.callback` transport-lifecycle branches
   (`onerror`, the `server.connect()` rejection path, the ternary inside the
   error mapper) are exercised by the e2e test, not by an integration test
   with a mocked `McpServer`/`StdioServerTransport`.** Alternatif: hand-roll
   fakes for the third-party SDK's `McpServer`/`Transport` shapes to hit
   100% istanbul branch coverage in `*.integration.test.ts`. Alasan: per the
   repo's own e2e scope policy, "real subprocess, real runtime wiring, real
   cross-boundary behavior" is explicitly integration-tests-don't-apply /
   e2e territory, and coverage is collected but not threshold-enforced
   (`vitest.config.ts` has no `coverage.thresholds`) — so this is a policy
   goal, not a hard gate. `serve.branches.ts` (the one piece of new logic
   with real conditional branches: network failure vs. status failure vs.
   success) DOES get full integration-test branch coverage; the transport
   glue in `serve.handler.ts` gets its golden path covered by the e2e test
   instead, matching how `start`/`stop`'s own Docker-lifecycle branches are
   treated in this codebase. Flagged in the final report as a known,
   accepted gap rather than silently claimed as 100%.

9. **One e2e test, no live test, for this command — scoped to
   `initialize`/`tools/list`/`resources/list` only, not `resources/read` or
   `tools/call`.** Alternatif (tried first): also assert on a
   `resources/read` of `ui://apps/branches` in the e2e test, since reading a
   resource sounded like "protocol wiring" rather than "calling the tool".
   Discovered while running the e2e test in this sandboxed environment: the
   resource read callback independently calls `legacyAppsFetchBranches` too
   (by design, #3/#5 above — it always renders fresh data), so it needs real
   Management API network access exactly like `tools/call list_branches`
   does; both got `-32603 unexpected list branch status 403: request
   blocked` here as a result. Corrected the e2e test to stop at
   `resources/list` (asserting the resource is advertised, not reading it) —
   the actually credential-free surface is the three metadata-only RPCs
   (`initialize`, `tools/list`, `resources/list`). Alasan for no live test:
   this session has no `SUPABASE_LIVE_API_URL`/`SUPABASE_ACCESS_TOKEN`
   credentials (STOP WAJIB: "membutuhkan secret ... yang tidak tersedia").
   Verifying `list_branches`/`ui://apps/branches` against real branch data is
   exactly the shape of an existing `*.live.test.ts` (mirroring
   `branches/list/list.live.test.ts`) and is a natural follow-up a human with
   credentials should add; flagged in the final report.
