import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHn } from "../hn/runner";
import { readPinnedBlob, readPinnedTree, resolveCodeRevision } from "./repo";

export const reviewPolicyPath = ".hn/policy.json";
const field = "requireResolvedReviewThreads";
const limit = 1024 * 1024;

export async function readReviewThreadPolicy(repo: string) {
  const revision = resolveCodeRevision(repo);
  if (!revision?.branch) return { ok: false, error: { code: "unavailable", message: "The default branch is unavailable." } } as const;
  const base = { branch: revision.branch, commit: revision.commit };
  const entry = readPinnedTree(repo, base.commit, ".hn")?.entries.find(item => item.path === reviewPolicyPath);
  const before = entry?.type === "blob" && entry.mode !== "120000"
    ? readPinnedBlob(repo, entry.sha, entry.size, limit).content : null;
  if (before !== null) {
    try {
      const value = JSON.parse(before);
      const proposals = policyField(value, "proposals");
      const proposalOffset = member(before, before.indexOf("{"), "proposals");
      if (proposalOffset === null) throw new Error("Missing proposal policy");
      member(before, proposalOffset, field);
      const required = policyField(proposals, field);
      const checked = await runHn(repo, ["policy", "show", base.commit], 5000, { maxOutputBytes: 2 * limit, localRead: true });
      if (checked.exitCode === 0 && checked.envelope.ok && proposals && typeof proposals === "object" &&
          (required === undefined || required === null || typeof required === "boolean")) {
        return { ok: true, data: { base, required: required === true, before } } as const;
      }
    } catch {
      // Use the same unavailable state for unreadable or invalid committed policy.
    }
  }
  return { ok: false, error: { code: "policy_required", message: "A readable Hubnot policy on the default branch is required." } } as const;
}

function policyField(object: unknown, name: string): unknown {
  if (!object || typeof object !== "object" || Array.isArray(object)) return undefined;
  const matches = Object.entries(object).filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (matches.length > 1) throw new Error("Ambiguous policy field");
  return matches[0]?.[1];
}

// Locate a direct member of an already parsed JSON object without rewriting other values.
function member(source: string, offset: number, name: string) {
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,"]+/g;
  tokens.lastIndex = offset + 1;
  let depth = 0;
  let found: number | null = null;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(source))) {
    const value = token[0];
    if (depth === 0 && value === "}") return found;
    if (depth === 0 && value.startsWith('"') && JSON.parse(value).toLowerCase() === name.toLowerCase()) {
      const tail = /^\s*:\s*/.exec(source.slice(tokens.lastIndex));
      if (tail) {
        if (found !== null) throw new Error("Ambiguous policy field");
        found = tokens.lastIndex + tail[0].length;
      }
    }
    if (value === "{" || value === "[") depth++;
    if (value === "}" || value === "]") depth--;
  }
  return null;
}

export function editReviewThreadPolicy(before: string, required: boolean) {
  const proposals = member(before, before.indexOf("{"), "proposals");
  if (proposals === null || before[proposals] !== "{") return null;
  const value = member(before, proposals, field);
  if (value !== null) {
    const previous = /^(true|false|null)\b/.exec(before.slice(value));
    return previous ? before.slice(0, value) + String(required) + before.slice(value + previous[0].length) : null;
  }
  const rest = before.slice(proposals + 1);
  const spacing = /^\s*/.exec(rest)![0];
  const empty = rest[spacing.length] === "}";
  const property = `"${field}": ${required}`;
  return before.slice(0, proposals + 1) + (spacing || " ") + property +
    (empty ? rest : "," + rest);
}

export async function validateReviewThreadPolicy(repo: string, commit: string, draft: string) {
  const scratch = await mkdtemp(join(tmpdir(), "workbox-policy-"));
  try {
    const file = join(scratch, "policy.json");
    await writeFile(file, draft, { mode: 0o600 });
    const checked = await runHn(repo, ["policy", "check", "--base", commit, "--file", file], 5000,
      { maxOutputBytes: 4 * limit, localRead: true });
    return checked.exitCode === 0 && checked.envelope.ok;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
