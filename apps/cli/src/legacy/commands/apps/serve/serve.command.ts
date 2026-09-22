import { Command, Flag } from "effect/unstable/cli";
import type * as CliCommand from "effect/unstable/cli/Command";

import { withJsonErrorHandling } from "../../../../shared/output/json-error-handling.ts";
import { legacyManagementApiRuntimeLayer } from "../../../shared/legacy-management-api-runtime.layer.ts";
import { withLegacyCommandInstrumentation } from "../../../telemetry/legacy-command-instrumentation.ts";
import { legacyAppsServe } from "./serve.handler.ts";

const config = {
  projectRef: Flag.string("project-ref").pipe(
    Flag.withDescription("Project ref of the Supabase project."),
    Flag.optional,
  ),
} as const;

export type LegacyAppsServeFlags = CliCommand.Command.Config.Infer<typeof config>;

export const legacyAppsServeCommand = Command.make("serve", config).pipe(
  Command.withDescription(
    "Start an MCP server (stdio) exposing an interactive MCP App to view preview branches.",
  ),
  Command.withShortDescription("Start the MCP Apps server"),
  Command.withHandler((flags) =>
    legacyAppsServe(flags).pipe(
      withLegacyCommandInstrumentation({ flags, safeFlags: ["project-ref"] }),
      withJsonErrorHandling,
    ),
  ),
  Command.provide(legacyManagementApiRuntimeLayer(["apps", "serve"])),
);
