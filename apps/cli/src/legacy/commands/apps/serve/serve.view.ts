import type { LegacyAppsBranches } from "./serve.branches.ts";

// Escapes text for safe interpolation into HTML element content. This view
// has no external script/style/network dependencies (DECISIONS.md #3), so
// this is the only sanitization the resource body needs.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRow(branch: LegacyAppsBranches[number]): string {
  const cells = [
    branch.name,
    branch.is_default ? "yes" : "no",
    branch.git_branch ?? "",
    branch.status,
    branch.persistent ? "yes" : "no",
  ];
  return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
}

/**
 * Renders the `ui://apps/branches` resource body: a static, self-contained
 * HTML table of preview branches. No client-side script — see DECISIONS.md
 * #3 for why this view does not use `@modelcontextprotocol/ext-apps`'s `App`
 * class / postMessage protocol.
 */
export function renderAppsBranchesHtml(branches: LegacyAppsBranches): string {
  const body =
    branches.length === 0
      ? "<p>No preview branches.</p>"
      : [
          "<table>",
          "<thead><tr><th>Name</th><th>Default</th><th>Git branch</th><th>Status</th><th>Persistent</th></tr></thead>",
          "<tbody>",
          ...branches.map(renderRow),
          "</tbody>",
          "</table>",
        ].join("");

  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    "<style>",
    "body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:12px;color:#1a1a1a}",
    "table{border-collapse:collapse;width:100%}",
    "th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e2e2e2}",
    "th{font-weight:600;color:#555}",
    "</style>",
    "</head><body>",
    body,
    "</body></html>",
  ].join("");
}
