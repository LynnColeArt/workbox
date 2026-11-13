import { workboxPageSize } from "./list-settings";
import { spawnSync } from "node:child_process";

const FILE_LIST_BYTES = 128 * 1024;
const MAX_FILES = 200;
const PATCH_BYTES = 128 * 1024;
const TIMEOUT_MS = 3_000;

export interface ProposalChangedFile {
  path: string;
  previousPath?: string;
  status: string;
}

export interface ProposalComparison {
  status: "available" | "truncated" | "unavailable";
  files: ProposalChangedFile[];
  selectedPath?: string;
  patch?: {
    status: "available" | "binary" | "truncated" | "unavailable" | "unlisted";
    text?: string;
  };
}

function runGit(
  repoPath: string,
  args: string[],
  maxBuffer: number,
  options?: { input?: string; attributeCommit?: string },
) {
  const env = {
    ...process.env,
    LC_ALL: "C",
    GIT_NO_LAZY_FETCH: "1",
    GIT_ALLOW_PROTOCOL: "",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_ATTR_SOURCE: options?.attributeCommit,
    GIT_DIR: undefined,
    GIT_COMMON_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
    GIT_OBJECT_DIRECTORY: undefined,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
    GIT_LITERAL_PATHSPECS: undefined,
    GIT_GLOB_PATHSPECS: undefined,
    GIT_NOGLOB_PATHSPECS: undefined,
    GIT_ICASE_PATHSPECS: undefined,
  };
  const result = spawnSync("git", [
    "--no-pager", "--no-replace-objects",
    "-C", repoPath, ...args,
  ], { input: options?.input, env, maxBuffer, timeout: TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true });
  if (result.status === 0) return { output: result.stdout, truncated: false };
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOBUFS") {
    return { output: result.stdout.subarray(0, maxBuffer), truncated: true };
  }
  return undefined;
}

function parseFiles(output: Buffer) {
  const files: ProposalChangedFile[] = [];
  let incomplete = false;
  let offset = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

  function field() {
    const end = output.indexOf(0, offset);
    if (end === -1) return undefined;
    const bytes = output.subarray(offset, end);
    offset = end + 1;
    return bytes;
  }

  while (offset < output.length && files.length < MAX_FILES) {
    const status = field()?.toString("ascii");
    if (!status) break;
    const first = field();
    const renamed = /^[RC]/.test(status);
    const current = renamed ? field() : first;
    if (!first?.length || !current?.length) {
      incomplete = true;
      break;
    }
    try {
      const path = decoder.decode(current);
      files.push(renamed ? { path, previousPath: decoder.decode(first), status } : { path, status });
    } catch {
      // Paths with invalid UTF-8 cannot round-trip through a browser URL.
      incomplete = true;
    }
  }
  return { files, incomplete: incomplete || offset < output.length };
}

export function readProposalComparison(
  repoPath: string,
  { base, head }: { base: string; head: string },
  selectedPath?: string,
): ProposalComparison {
  const unavailable: ProposalComparison = { status: "unavailable", files: [] };
  const format = runGit(repoPath, ["rev-parse", "--show-object-format"], 256)?.output.toString().trim();
  const oidLength = format === "sha1" ? 40 : format === "sha256" ? 64 : 0;
  const isExactOid = (oid: string) => oid.length === oidLength && !/[^0-9a-f]/.test(oid) && oidLength !== 0;
  if (!isExactOid(base) || !isExactOid(head)) return unavailable;

  const commits = runGit(repoPath, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], 1024, {
    input: `${base}\n${head}\n`,
  });
  if (!commits || commits.truncated || commits.output.toString() !== `${base} commit\n${head} commit\n`) return unavailable;

  const diff = [
    "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-relative",
    "--ignore-submodules=none", "--submodule=short", "--find-renames",
  ];
  const metadata = ["--name-status", "-z", base, head, "--"];
  const attributes = { attributeCommit: head };
  const changes = runGit(repoPath, [...diff, ...metadata], FILE_LIST_BYTES, attributes);
  if (!changes) return unavailable;

  const { files, incomplete } = parseFiles(changes.output);
  const result: ProposalComparison = {
    status: changes.truncated || incomplete ? "truncated" : "available",
    files,
  };
  if (selectedPath === undefined) return result;
  const selected = files.find(({ path }) => path === selectedPath);
  if (!selected) return { ...result, patch: { status: "unlisted" } };

  result.selectedPath = selected.path;
  const paths = selected.previousPath === undefined ? [selected.path] : [selected.previousPath, selected.path];

  // Literal pathspecs also match descendants. Exclude directory entries and
  // verify rename detection still resolves to the listed entry.
  const pathspecs = [
    ...paths.map((path) => `:(top,literal)${path}`),
    ...paths
      .filter((path) => !paths.some((candidate) => candidate.startsWith(`${path}/`)))
      .map((path) => `:(top,literal,exclude)${path}/`),
  ];
  const scoped = runGit(repoPath, [...diff, ...metadata, ...pathspecs], FILE_LIST_BYTES, attributes);
  const parsed = scoped && parseFiles(scoped.output);
  const [scopedFile] = parsed?.files ?? [];
  if (
    !parsed || scoped?.truncated || parsed.incomplete || parsed.files.length !== 1 ||
    scopedFile?.path !== selected.path || scopedFile.previousPath !== selected.previousPath ||
    scopedFile.status !== selected.status
  ) {
    return { ...result, patch: { status: "unavailable" } };
  }

  const patch = runGit(repoPath, [
    ...diff, "--patch", "--src-prefix=a/", "--dst-prefix=b/",
    base, head, "--", ...pathspecs,
  ], PATCH_BYTES, attributes);
  if (!patch) return { ...result, patch: { status: "unavailable" } };
  // When cutting output at a byte limit, omit the final incomplete line.
  const output = patch.truncated ? patch.output.subarray(0, patch.output.lastIndexOf(10) + 1) : patch.output;
  const text = output.toString("utf8");
  if (patch.truncated) return { ...result, patch: { status: "truncated", text } };
  if (/^Binary files /m.test(text)) return { ...result, patch: { status: "binary" } };
  return { ...result, patch: { status: "available", text } };
}

export function readComparisonCommits(repoPath: string, base: string, head: string, path?: string, requestedPage = 1) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) return null;
  const range = [`${base}..${head}`, "--", ...(path ? [`:(top,literal)${path}`] : [])];
  const count = runGit(repoPath, ["rev-list", "--count", ...range], 256);
  if (!count || count.truncated) return null;
  const total = Number(count.output.toString().trim());
  if (!Number.isSafeInteger(total) || total < 0) return null;
  const pageSize = workboxPageSize();
  const totalPages = Math.ceil(total / pageSize);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, totalPages)) : 1;
  const output = runGit(repoPath, [
    "log", "--no-show-signature", `--max-count=${pageSize}`, `--skip=${(page - 1) * pageSize}`,
    "--format=%H%x00%aN%x00%aI%x00%s", "-z", ...range,
  ], FILE_LIST_BYTES);
  if (!output || output.truncated) return null;
  const fields = output.output.toString("utf8").split("\0");
  const commits = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [oid, author, date, subject] = fields.slice(index, index + 4);
    commits.push({ oid, author, date, subject });
  }
  return { commits, total, page, pageSize, totalPages, truncated: total > commits.length };
}
