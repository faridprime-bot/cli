import { Data } from "effect";
import {
  actionability,
  ErrorActionabilityId,
  statusCodeActionability,
  type CliErrorActionabilityDeclaration,
} from "../../../../shared/telemetry/error-actionability.ts";

// ---------------------------------------------------------------------------
// `list_branches` tool / `ui://apps/branches` resource — same endpoint and
// same failure shape as `branches list` (`/v1/projects/{ref}/branches`), kept
// as its own error pair rather than reused from `branches.errors.ts` — see
// DECISIONS.md #4.
// ---------------------------------------------------------------------------

export class LegacyAppsBranchesNetworkError extends Data.TaggedError(
  "LegacyAppsBranchesNetworkError",
)<{
  readonly message: string;
  readonly decode?: boolean;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return this.decode === true
      ? { ...actionability.apiStatus, fingerprint_suffix: "api_response" }
      : actionability.externalNetwork;
  }
}

export class LegacyAppsBranchesUnexpectedStatusError extends Data.TaggedError(
  "LegacyAppsBranchesUnexpectedStatusError",
)<{
  readonly status: number;
  readonly body: string;
  readonly message: string;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return statusCodeActionability(this.status, { notFoundIsInvalidInput: true });
  }
}

// ---------------------------------------------------------------------------
// stdio transport lifecycle — see DECISIONS.md #8 for the `unknown` choice.
// ---------------------------------------------------------------------------

export class LegacyAppsServeTransportError extends Data.TaggedError(
  "LegacyAppsServeTransportError",
)<{
  readonly message: string;
}> {
  get [ErrorActionabilityId](): CliErrorActionabilityDeclaration {
    return actionability.unknown;
  }
}
