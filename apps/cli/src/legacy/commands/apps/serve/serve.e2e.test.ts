import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { makeTempHome } from "../../../../../tests/helpers/cli.ts";
import { LEGACY_APPS_BRANCHES_RESOURCE_URI, LEGACY_APPS_LIST_BRANCHES_TOOL } from "./serve.handler.ts";

// `apps serve` is a long-lived stdio server, not a one-shot command: it needs
// an incrementally-writable stdin and response-by-response reading, which
// `tests/helpers/cli.ts`'s `spawnSupabase` (a single `stdin` string written
// and closed at spawn time) does not support. This test therefore drives the
// child process directly — see DECISIONS.md.
const SHIM_PATH = fileURLToPath(new URL("../../../../../dist/supabase.js", import.meta.url));
const LEGACY_BINARY_PATH = fileURLToPath(
  new URL(`../../../../../dist/supabase-legacy${process.platform === "win32" ? ".exe" : ""}`, import.meta.url),
);

const E2E_TIMEOUT_MS = 30_000;
// Protocol-only golden path (DECISIONS.md #9): `list_branches`/`ui://apps/branches`
// are never actually invoked here, so no real Management API access is
// needed — only project-ref resolution has to succeed, which is a local
// format check, not a network call.
const FAKE_TOKEN = "sbp_" + "a".repeat(40);
const FAKE_PROJECT_REF = "aaaaaaaaaaaaaaaaaaaa";

interface JsonRpcMessage {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly params?: unknown;
}

/** Minimal newline-delimited JSON-RPC client over a spawned MCP stdio server. */
function mcpStdioClient(proc: ChildProcessWithoutNullStreams) {
  let buffer = "";
  const pending = new Map<number, (message: JsonRpcMessage) => void>();
  const stderrChunks: string[] = [];

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim() === "") continue;
      const message = JSON.parse(line) as JsonRpcMessage;
      if (typeof message.id === "number") {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    }
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString("utf8"));
  });

  let nextId = 1;

  function request(method: string, params?: unknown): Promise<JsonRpcMessage> {
    const id = nextId++;
    const promise = new Promise<JsonRpcMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for response to ${method} (id ${id})`));
      }, E2E_TIMEOUT_MS);
      pending.set(id, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
    return promise;
  }

  function notify(method: string, params?: unknown): void {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params: params ?? {} }) + "\n");
  }

  return { request, notify, stderr: () => stderrChunks.join("") };
}

describe("supabase apps serve (legacy) — MCP stdio protocol golden path", () => {
  let proc: ChildProcessWithoutNullStreams | undefined;

  afterEach(() => {
    proc?.kill("SIGKILL");
    proc = undefined;
  });

  test(
    "advertises list_branches and the ui://apps/branches resource, then exits cleanly on stdin close",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
      using home = makeTempHome();
      proc = spawn("node", [SHIM_PATH, "apps", "serve"], {
        env: {
          ...process.env,
          SUPABASE_HOME: home.dir,
          SUPABASE_NO_KEYRING: "1",
          SUPABASE_TELEMETRY_DISABLED: "1",
          SUPABASE_NO_UPDATE_NOTIFIER: "1",
          SUPABASE_CLI_BINARY_OVERRIDE: LEGACY_BINARY_PATH,
          SUPABASE_ACCESS_TOKEN: FAKE_TOKEN,
          SUPABASE_PROJECT_ID: FAKE_PROJECT_REF,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const client = mcpStdioClient(proc);

      const exitPromise = new Promise<number | null>((resolve) => {
        proc!.once("close", (code) => resolve(code));
      });

      const initResponse = await client.request("initialize", {
        protocolVersion: "2026-07-28",
        capabilities: {},
        clientInfo: { name: "supabase-cli-e2e", version: "0.0.0" },
      });
      expect(initResponse.error, JSON.stringify(initResponse)).toBeUndefined();
      client.notify("notifications/initialized");

      const toolsResponse = await client.request("tools/list");
      expect(toolsResponse.error, JSON.stringify(toolsResponse)).toBeUndefined();
      const tools = (toolsResponse.result as { tools: Array<{ name: string; _meta?: unknown }> }).tools;
      const listBranchesTool = tools.find((t) => t.name === LEGACY_APPS_LIST_BRANCHES_TOOL);
      expect(listBranchesTool, JSON.stringify(tools)).toBeDefined();
      const meta = listBranchesTool!._meta as { ui?: { resourceUri?: string } } | undefined;
      expect(meta?.ui?.resourceUri).toBe(LEGACY_APPS_BRANCHES_RESOURCE_URI);

      const resourcesResponse = await client.request("resources/list");
      expect(resourcesResponse.error, JSON.stringify(resourcesResponse)).toBeUndefined();
      const resources = (resourcesResponse.result as { resources: Array<{ uri: string }> }).resources;
      expect(resources.map((r) => r.uri)).toContain(LEGACY_APPS_BRANCHES_RESOURCE_URI);

      // `resources/read` and `tools/call` both fetch live branch data from the
      // Management API (DECISIONS.md #3/#9) — not exercised here, since this
      // golden path is deliberately credential-free. A `*.live.test.ts` is
      // the natural home for that assertion.

      // stdout must carry ONLY the JSON-RPC stream — every diagnostic line
      // this command emits goes to stderr (DECISIONS.md #6).
      expect(client.stderr()).toContain("supabase apps serve: ready (stdio)");

      proc.stdin.end();
      const exitCode = await exitPromise;
      expect(exitCode).toBe(0);
    },
  );
});
