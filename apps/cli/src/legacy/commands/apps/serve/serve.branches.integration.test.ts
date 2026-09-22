import type { V1ListAllBranchesOutput } from "@supabase/api/effect";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { mockLegacyPlatformApi } from "../../../../../tests/helpers/legacy-mocks.ts";
import { legacyAppsFetchBranches } from "./serve.branches.ts";

type Branches = typeof V1ListAllBranchesOutput.Type;

const REF = "aaaaaaaaaaaaaaaaaaaa";

const SAMPLE_BRANCH: Branches[number] = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "feat-1",
  project_ref: REF,
  parent_project_ref: "bbbbbbbbbbbbbbbbbbbb",
  is_default: false,
  git_branch: "feat-1",
  persistent: false,
  status: "MIGRATIONS_PASSED",
  created_at: "2026-05-27T01:02:03Z",
  updated_at: "2026-05-27T01:02:04Z",
  with_data: true,
};

describe("legacyAppsFetchBranches", () => {
  it.live("returns the branch list on success", () => {
    const api = mockLegacyPlatformApi({ response: { status: 200, body: [SAMPLE_BRANCH] } });
    return Effect.gen(function* () {
      const branches = yield* legacyAppsFetchBranches(REF);
      expect(branches).toEqual([SAMPLE_BRANCH]);
    }).pipe(Effect.provide(api.layer));
  });

  it.live("returns an empty array when the project has no branches", () => {
    const api = mockLegacyPlatformApi({ response: { status: 200, body: [] } });
    return Effect.gen(function* () {
      const branches = yield* legacyAppsFetchBranches(REF);
      expect(branches).toEqual([]);
    }).pipe(Effect.provide(api.layer));
  });

  it.live("fails with LegacyAppsBranchesNetworkError on a transport failure", () => {
    const api = mockLegacyPlatformApi({ network: "fail" });
    return Effect.gen(function* () {
      const exit = yield* legacyAppsFetchBranches(REF).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const json = JSON.stringify(exit.cause);
        expect(json).toContain("LegacyAppsBranchesNetworkError");
        expect(json).toContain("failed to list branch");
      }
    }).pipe(Effect.provide(api.layer));
  });

  it.live("fails with LegacyAppsBranchesUnexpectedStatusError on a non-2xx response", () => {
    const api = mockLegacyPlatformApi({ response: { status: 500, body: { message: "boom" } } });
    return Effect.gen(function* () {
      const exit = yield* legacyAppsFetchBranches(REF).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const json = JSON.stringify(exit.cause);
        expect(json).toContain("LegacyAppsBranchesUnexpectedStatusError");
        expect(json).toContain("unexpected list branch status 500");
      }
    }).pipe(Effect.provide(api.layer));
  });
});
