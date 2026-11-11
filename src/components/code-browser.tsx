import Link from "next/link";
import { FileDirectoryIcon, FileIcon, GitCommitIcon, GitMergeIcon } from "@primer/octicons-react";
import BranchSelector from "@/components/branch-selector";
import type { CodeRead } from "@/lib/workbox/code-browser";

type AvailableCode = Exclude<CodeRead, { kind: "unavailable" }>;
type LinkedCommit = NonNullable<AvailableCode["lastCommit"]>;

const calendarDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const relativeDate = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const count = new Intl.NumberFormat("en");

function CommitDate({ commit, now }: { commit: LinkedCommit; now: number }) {
  const age = Math.floor((now - Date.parse(commit.when)) / 86_400_000);
  const label = age < 0 ? calendarDate.format(new Date(commit.when))
    : age < 30 ? relativeDate.format(-age, "day")
      : age < 365 ? relativeDate.format(-Math.floor(age / 30), "month")
        : relativeDate.format(-Math.floor(age / 365), "year");
  return <time dateTime={commit.when} title={commit.when}>{label}</time>;
}

function CommitSummary({ commit }: { commit: LinkedCommit }) {
  return (
    <Link href={commit.href} prefetch={false} className="block truncate hover:underline" title={`${commit.subject} · ${commit.author} · ${commit.sha}`}>
      {commit.subject || commit.shortSha}
    </Link>
  );
}

function RevisionHeader({ result, now }: { result: AvailableCode; now: number }) {
  const { branch, branches, path, projectId, at, lastCommit, stats } = result;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {branches.length > 0 && branch !== null
          ? <BranchSelector projectId={encodeURIComponent(projectId)} current={branch} branches={branches} path={path} />
          : <span className="wb-chip wb-mono">Detached {at.slice(0, 8)}</span>}
        {stats.commits !== null && <span className="wb-muted text-sm">{count.format(stats.commits)} {stats.commits === 1 ? "commit" : "commits"}
          {stats.contributors !== null && ` · ${count.format(stats.contributors)} ${stats.contributors === 1 ? "contributor" : "contributors"}`}</span>}
      </div>
      {lastCommit && (
        <div className="wb-panel flex items-center gap-3 p-3 text-sm">
          <GitCommitIcon aria-hidden="true" className="wb-muted shrink-0" />
          <strong className="shrink-0">{lastCommit.author}</strong>
          <span className="min-w-0 grow wb-muted"><CommitSummary commit={lastCommit} /></span>
          <Link href={lastCommit.href} prefetch={false} className="wb-link wb-mono hidden sm:inline" title={lastCommit.sha}>{lastCommit.shortSha}</Link>
          <span className="wb-muted shrink-0"><CommitDate commit={lastCommit} now={now} /></span>
        </div>
      )}
      {result.breadcrumbs.length > 1 && (
        <nav className="wb-mono flex flex-wrap gap-2 text-sm" aria-label="Repository path">
          {result.breadcrumbs.map(({ name, href }, index) => (
            <span key={href}>{index > 0 && <span className="wb-muted mr-2">/</span>}
              {index + 1 === result.breadcrumbs.length ? <span aria-current="page">{name}</span>
                : <Link prefetch={false} className="wb-link" href={href}>{name}</Link>}
            </span>
          ))}
        </nav>
      )}
    </>
  );
}

function Directory({ result, now }: { result: Extract<CodeRead, { kind: "directory" }>; now: number }) {
  if (result.entries.length === 0) return <p className="wb-panel wb-muted p-4 text-sm">Empty directory.</p>;
  return (
    <div className="wb-panel overflow-hidden">
      <table className="w-full table-fixed text-sm" aria-label="Repository files">
        <colgroup><col className="w-[38%]" /><col /><col className="w-[7.5rem]" /></colgroup>
        <thead className="sr-only"><tr><th scope="col">Name</th><th scope="col">Last commit</th><th scope="col">Last changed</th></tr></thead>
        <tbody className="divide-y divide-[var(--wb-border)]">
          {result.entries.map((entry) => {
            const Icon = entry.type === "tree" ? FileDirectoryIcon : entry.type === "commit" ? GitMergeIcon : FileIcon;
            return (
              <tr key={entry.path} className="hover:bg-[var(--wb-panel-2)]">
                <td className="truncate px-4 py-2.5">
                  <Icon aria-hidden="true" className="wb-muted mr-2 align-text-bottom" />
                  <Link href={entry.href} prefetch={false} title={entry.name} className="hover:text-[var(--wb-link)] hover:underline">{entry.name}</Link>
                </td>
                <td className="wb-muted truncate px-2 py-2.5">
                  {entry.lastChange ? <CommitSummary commit={entry.lastChange} /> : "Unavailable"}
                </td>
                <td className="wb-muted whitespace-nowrap px-4 py-2.5 text-right">
                  {entry.lastChange ? <CommitDate commit={entry.lastChange} now={now} /> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function File({ result, now }: { result: Extract<CodeRead, { kind: "file" }>; now: number }) {
  return (
    <div className="wb-panel">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[var(--wb-border)] p-3 text-sm">
        {([["Last changed", result.lastChange], ["Introduced", result.introduced]] as const).map(([label, commit]) => (
          <div key={label}>
            <dt className="wb-muted">{label}</dt>
            <dd>{commit
              ? <Link href={commit.href} prefetch={false} className="wb-link" title={commit.sha}><CommitDate commit={commit} now={now} /></Link>
              : "Unavailable"}</dd>
          </div>
        ))}
        {result.size !== null && <div><dt className="wb-muted">Size</dt><dd>{count.format(result.size)} bytes</dd></div>}
      </dl>
      {result.content === null
        ? <p className="wb-muted p-4 text-sm">{result.binary ? "Binary file" : "File preview unavailable"}</p>
        : <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs wb-mono">{result.content}</pre>}
    </div>
  );
}

function Commit({ result, now }: { result: Extract<CodeRead, { kind: "commit" }>; now: number }) {
  const { commit, changes } = result;
  return (
    <section className="wb-panel p-4">
      <h2 className="font-semibold break-words">{commit.subject || "Commit"}</h2>
      <p className="wb-muted my-2 flex flex-wrap gap-x-3 text-sm">
        <span>{commit.author}</span><CommitDate commit={commit} now={now} />
        <time dateTime={commit.when} className="wb-mono break-all">{commit.when}</time>
      </p>
      <code className="wb-mono break-all text-xs">{commit.sha}</code>
      <h3 className="mb-2 mt-4 text-sm font-semibold">Changed files</h3>
      {changes.length === 0 && <p className="wb-muted text-sm">{result.historyIncomplete ? "Changed files unavailable." : "No changed files."}</p>}
      <ul className="space-y-1 text-sm" aria-label="Changed files">
        {changes.map((change) => (
          <li key={change.path} className="break-all">
            <span className="wb-chip wb-mono mr-2">{change.status}</span>
            {change.previousPath && <span className="wb-muted">{change.previousPath} → </span>}
            {change.href ? <Link href={change.href} prefetch={false} className="wb-link">{change.path}</Link> : change.path}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CodeBrowser({ result, now }: { result: CodeRead; now: number }) {
  if (result.kind === "unavailable") return <p className="wb-panel wb-muted p-4 text-sm">{result.reason}</p>;
  return (
    <div className="min-w-0 space-y-4">
      <RevisionHeader result={result} now={now} />
      {result.historyIncomplete && <p className="wb-muted text-sm">Some Git history is unavailable for this revision.</p>}
      {result.kind === "directory" ? <Directory result={result} now={now} />
        : result.kind === "file" ? <File result={result} now={now} />
          : <Commit result={result} now={now} />}
    </div>
  );
}
