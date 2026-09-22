import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Effect } from "effect";

import { CLI_VERSION } from "../../../../shared/cli/version.ts";
import { Output } from "../../../../shared/output/output.service.ts";
import { LegacyPlatformApi } from "../../../auth/legacy-platform-api.service.ts";
import { legacyResolveParentScopedProjectRef } from "../../../shared/legacy-parent-project-ref.ts";
import { LegacyLinkedProjectCache } from "../../../telemetry/legacy-linked-project-cache.service.ts";
import { LegacyTelemetryState } from "../../../telemetry/legacy-telemetry-state.service.ts";
import { legacyAppsFetchBranches } from "./serve.branches.ts";
import type { LegacyAppsServeFlags } from "./serve.command.ts";
import { LegacyAppsServeTransportError } from "./serve.errors.ts";
import { renderAppsBranchesHtml } from "./serve.view.ts";

export const LEGACY_APPS_BRANCHES_RESOURCE_URI = "ui://apps/branches";
export const LEGACY_APPS_LIST_BRANCHES_TOOL = "list_branches";

/**
 * Wires the `list_branches` tool and `ui://apps/branches` resource onto an
 * `McpServer`, bridging into the resolved `ref`'s `LegacyPlatformApi` Effect
 * dependency via `runPromise` at the tool/resource callback boundary — see
 * DECISIONS.md #7.
 */
function legacyAppsRegisterServer(
  server: McpServer,
  ref: string,
  runPromise: <A, E>(effect: Effect.Effect<A, E, LegacyPlatformApi>) => Promise<A>,
): void {
  registerAppResource(
    server,
    "Preview Branches",
    LEGACY_APPS_BRANCHES_RESOURCE_URI,
    { description: "Preview branches for the linked Supabase project." },
    async () => {
      const branches = await runPromise(legacyAppsFetchBranches(ref));
      return {
        contents: [
          {
            uri: LEGACY_APPS_BRANCHES_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: renderAppsBranchesHtml(branches),
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    LEGACY_APPS_LIST_BRANCHES_TOOL,
    {
      title: "List Preview Branches",
      description: "List Supabase preview branches for the linked project.",
      _meta: { ui: { resourceUri: LEGACY_APPS_BRANCHES_RESOURCE_URI } },
    },
    async () => {
      const branches = await runPromise(legacyAppsFetchBranches(ref));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(branches) }],
        structuredContent: { branches },
      };
    },
  );
}

/**
 * Serves the MCP Apps server over stdio until the transport closes (client
 * disconnect / stdin EOF) or errors. Blocks the command for its whole
 * lifetime, like a foreground process — see DECISIONS.md #7 for why this is
 * one `Effect.callback` around `server.connect(transport)` rather than a
 * `Promise`-returning handler.
 */
export const legacyAppsServe = Effect.fn("legacy.apps.serve")(function* (
  flags: LegacyAppsServeFlags,
) {
  const output = yield* Output;
  const linkedProjectCache = yield* LegacyLinkedProjectCache;
  const telemetryState = yield* LegacyTelemetryState;

  const ref = yield* legacyResolveParentScopedProjectRef(flags.projectRef);

  yield* Effect.gen(function* () {
    const context = yield* Effect.context<LegacyPlatformApi>();
    const runPromise = Effect.runPromiseWith(context);

    const server = new McpServer({ name: "supabase-cli", version: CLI_VERSION });
    legacyAppsRegisterServer(server, ref, runPromise);

    yield* Effect.callback<void, LegacyAppsServeTransportError>((resume) => {
      const transport = new StdioServerTransport();
      transport.onerror = (error: Error) => {
        resume(Effect.fail(new LegacyAppsServeTransportError({ message: error.message })));
      };
      transport.onclose = () => {
        resume(Effect.void);
      };
      // `StdioServerTransport` only listens for `data`/`error` on stdin — it
      // never observes stdin EOF itself (the MCP client disconnecting is
      // exactly that: closing our stdin). Close the transport explicitly on
      // `end` so `onclose` above still owns the single `resume` call.
      process.stdin.once("end", () => {
        transport.close().catch(() => {});
      });

      server
        .connect(transport)
        .then(() =>
          runPromise(output.raw("supabase apps serve: ready (stdio)\n", "stderr")).catch(
            () => {},
          ),
        )
        .catch((error: unknown) => {
          resume(
            Effect.fail(
              new LegacyAppsServeTransportError({
                message: error instanceof Error ? error.message : String(error),
              }),
            ),
          );
        });

      return Effect.promise(() => server.close());
    });
  }).pipe(Effect.ensuring(linkedProjectCache.cache(ref)), Effect.ensuring(telemetryState.flush));
});
