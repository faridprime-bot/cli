# `supabase apps serve`

Starts an MCP server on stdio exposing an interactive MCP App (`list_branches`
tool + `ui://apps/branches` resource) that reads the linked project's preview
branches. Runs until stdin closes (client disconnect) or the transport
errors — this is a foreground, long-lived process, unlike every other legacy
command.

## Files Read

| Path                                           | Format                    | When                                                                                                     |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| keyring `"Supabase CLI"` / `<profile>`         | OS keychain               | when `SUPABASE_ACCESS_TOKEN` unset and keyring available; account = `LegacyCliSettings.profile`             |
| keyring `"Supabase CLI"` / `access-token`      | OS keychain               | legacy-key fallback when the profile-keyed lookup misses                                                    |
| `<workdir>/supabase/.temp/linked-project.json` | JSON (`ref` field)        | when `--project-ref` is unset, as the 2nd PARENT-ref candidate (same resolution `branches` itself uses)      |
| `<workdir>/supabase/.temp/project-ref`         | plain text                | when `--project-ref` and `SUPABASE_PROJECT_ID` are both unset, as the 3rd (last) PARENT-ref candidate        |
| `~/.supabase/access-token`                     | plain text (token string) | last-resort fallback after env + keyring miss                                                                |

Each `resources/read` of `ui://apps/branches` and each `tools/call` of
`list_branches` independently re-reads the resolved project ref's branches
from the Management API (see API Routes) — the ref itself is resolved once,
at startup.

## Files Written

| Path                                             | Format | When                                                           |
| ------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `~/.supabase/<workdir-hash>/linked-project.json` | JSON   | always (in `Effect.ensuring`), once, after `--project-ref` resolves at startup |
| `~/.supabase/telemetry.json`                     | JSON   | always (in `Effect.ensuring`), once, when the server process exits |

## API Routes

| Method | Path                          | Auth         | Request body | Response (used fields)                                              | When                                             |
| ------ | ------------------------------ | ------------ | ------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `GET`  | `/v1/projects/{ref}/branches` | Bearer token | none         | `[{id, name, is_default, git_branch?, status, persistent, ...}]`      | on every `tools/call list_branches` and every `resources/read ui://apps/branches` |

## Environment Variables

| Variable                | Purpose                                              | Required?                                                |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | auth token (bypasses credential file/keyring lookup)  | no (falls back to keyring → `~/.supabase/access-token`)    |
| `SUPABASE_PROFILE`      | selects Management API base URL                      | no (defaults to `supabase`)                                |
| `SUPABASE_PROJECT_ID`   | PARENT project ref fallback when `--project-ref` unset | no (also reads `linked-project.json` → `project-ref` file → prompts on TTY) |
| `SUPABASE_WORKDIR`      | base directory for the `.temp/project-ref` lookup     | no (walks up from CWD looking for `supabase/config.toml`) |

## Exit Codes

| Code | Condition                                                                          |
| ---- | ----------------------------------------------------------------------------------- |
| `0`  | the MCP client closed stdin (normal disconnect)                                     |
| `1`  | `LegacyPlatformAuthRequiredError` — no token in env/keyring/file, at startup         |
| `1`  | `LegacyProjectNotLinkedError` — `--project-ref` unset, env/file empty, non-TTY, at startup |
| `1`  | `LegacyInvalidProjectRefError` — resolved ref violates `^[a-z]{20}$`, at startup     |
| `1`  | `LegacyAppsServeTransportError` — the stdio transport itself errored                |

A `tools/call list_branches` or `resources/read ui://apps/branches` that
fails (network/API error) does **not** exit the process — the MCP SDK
surfaces it as a JSON-RPC/tool-level error to the connected client, and the
server keeps serving.

## Telemetry Events Fired

| Event                  | When                                                               | Notable properties / groups        |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `cli_command_executed` | once, when the server process exits (success or failure), via wrapper | `exit_code`, `duration_ms` (= server uptime), `flags` (`--project-ref` whitelisted) |

## Output

`apps serve` does not honor `--output`/`--output-format`: its stdout carries
**only** the newline-delimited MCP JSON-RPC stream, never CLI-formatted
output — a connected MCP host is parsing every byte on stdout as protocol
traffic. The one CLI-authored diagnostic line ("supabase apps serve: ready
(stdio)") is written to **stderr** unconditionally, regardless of
`--output-format` (see `DECISIONS.md` #6).

## Notes

- Not part of the Behavioral Stability Contract yet (first release of this
  command) — no established stdout/stderr byte-for-byte contract to preserve
  beyond "stdout is JSON-RPC only."
- The `list_branches` tool and the `ui://apps/branches` resource share one
  Effect (`legacyAppsFetchBranches`), so they can never disagree on the
  underlying data or its failure mapping.
