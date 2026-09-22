import type { V1ListAllBranchesOutput } from "@supabase/api/effect";
import { Effect } from "effect";

import { LegacyPlatformApi } from "../../../auth/legacy-platform-api.service.ts";
import { mapLegacyHttpError } from "../../../shared/legacy-http-errors.ts";
import {
  LegacyAppsBranchesNetworkError,
  LegacyAppsBranchesUnexpectedStatusError,
} from "./serve.errors.ts";

export type LegacyAppsBranches = typeof V1ListAllBranchesOutput.Type;

const mapBranchesError = mapLegacyHttpError({
  networkError: LegacyAppsBranchesNetworkError,
  statusError: LegacyAppsBranchesUnexpectedStatusError,
  networkMessage: (cause) => `failed to list branch: ${cause}`,
  statusMessage: (status, body) => `unexpected list branch status ${status}: ${body}`,
});

/**
 * Fetches the preview branches for `ref`, shared by both the `list_branches`
 * tool callback and the `ui://apps/branches` resource read callback so both
 * surfaces stay in sync and share one tested failure mapping.
 */
export const legacyAppsFetchBranches = Effect.fnUntraced(function* (ref: string) {
  const api = yield* LegacyPlatformApi;
  return yield* api.v1.listAllBranches({ ref }).pipe(Effect.catch(mapBranchesError));
});
