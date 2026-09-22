import { Command } from "effect/unstable/cli";
import { legacyAppsServeCommand } from "./serve/serve.command.ts";

export const legacyAppsCommand = Command.make("apps").pipe(
  Command.withDescription("Run interactive MCP Apps backed by the Supabase CLI."),
  Command.withShortDescription("Run MCP Apps"),
  Command.withSubcommands([legacyAppsServeCommand]),
);
