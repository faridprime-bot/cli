import type { V1ListAllBranchesOutput } from "@supabase/api/effect";
import { describe, expect, it } from "vitest";

import { renderAppsBranchesHtml } from "./serve.view.ts";

type Branches = typeof V1ListAllBranchesOutput.Type;

function branch(overrides: Partial<Branches[number]> = {}): Branches[number] {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    name: "feat-1",
    project_ref: "aaaaaaaaaaaaaaaaaaaa",
    parent_project_ref: "bbbbbbbbbbbbbbbbbbbb",
    is_default: false,
    git_branch: "feat-1",
    persistent: false,
    status: "MIGRATIONS_PASSED",
    created_at: "2026-05-27T01:02:03Z",
    updated_at: "2026-05-27T01:02:04Z",
    with_data: true,
    ...overrides,
  };
}

describe("renderAppsBranchesHtml", () => {
  it("renders a placeholder message for an empty branch list", () => {
    const html = renderAppsBranchesHtml([]);
    expect(html).toContain("No preview branches.");
    expect(html).not.toContain("<table>");
  });

  it("renders one row per branch with the expected columns", () => {
    const html = renderAppsBranchesHtml([
      branch({ name: "feat-1", is_default: true, git_branch: "feat-1", status: "RUNNING_MIGRATIONS" }),
      branch({ name: "feat-2", is_default: false, git_branch: "feat-2", status: "MIGRATIONS_PASSED" }),
    ]);
    expect(html).toContain("<table>");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // 1 header row + 2 data rows
    expect(html).toContain("feat-1");
    expect(html).toContain("feat-2");
    expect(html).toContain("RUNNING_MIGRATIONS");
  });

  it("HTML-escapes branch and git-branch names", () => {
    const html = renderAppsBranchesHtml([
      branch({ name: '<img src=x onerror=alert(1)>', git_branch: "a&b" }),
    ]);
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("a&amp;b");
  });

  it("never embeds an external script or stylesheet reference", () => {
    const html = renderAppsBranchesHtml([branch()]);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
