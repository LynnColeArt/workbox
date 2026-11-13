"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { readRepoSettings } from "@/lib/workbox/settings-read";
import { LoadPipelineDraftButton, PipelineGraphEditor } from "./pipeline-graph-editor";

type Settings = NonNullable<Awaited<ReturnType<typeof readRepoSettings>>>;
type Diagnostic = { path: string; message: string };
type SettingsError = { code: string; message: string; diagnostics?: Diagnostic[] };
type SubmissionAvailability = { available: boolean; reason?: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: SettingsError };

const fieldClass = "w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm";
const workflowStatus = {
  conflicted: "Conflicted",
  "inert-source": "Inert source",
  "missing-native-definition": "Missing native definition",
  disabled: "Disabled",
  "native-runnable": "Native runnable",
};

async function request<T>(endpoint: string, input: object): Promise<Result<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return await response.json() as Result<T>;
  } catch {
    return { ok: false, error: { code: "unavailable", message: "Workbox could not confirm the request. Try again." } };
  }
}

function RequestError({ error }: { error: SettingsError }) {
  return (
    <div role="alert" className="text-sm text-[var(--wb-warn)]">
      <p>{error.message}</p>
      {error.diagnostics && (
        <ul className="ml-5 list-disc">
          {error.diagnostics.map(({ path, message }, index) => (
            <li key={index}>{path && <code className="wb-mono mr-2">{path}</code>}{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RepositoryDetails({ details, endpoint }: { details: Settings["details"]; endpoint: string }) {
  const router = useRouter();
  const [name, setName] = useState(details.name);
  const [description, setDescription] = useState(details.description);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<SettingsError | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    const result = await request<Pick<Settings["details"], "name" | "description">>(endpoint, { action: "update", name, description });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName(result.data.name);
    setDescription(result.data.description);
    setSaved(true);
    router.refresh();
  }

  return (
    <section aria-labelledby="repo-details" className="space-y-3">
      <h2 id="repo-details" className="text-base font-semibold">Repository details</h2>
      <div className="wb-panel space-y-4 p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="wb-muted">Project ID</dt><dd className="wb-mono break-all">{details.id}</dd></div>
          <div><dt className="wb-muted">Default branch</dt><dd className="wb-mono break-all">{details.branch ?? "Unavailable"}</dd></div>
          <div>
            <dt className="wb-muted">Default revision</dt>
            <dd className="wb-mono" title={details.commit ?? undefined}>{details.commit?.slice(0, 12) ?? "Unavailable"}</dd>
          </div>
        </dl>
        <form onSubmit={save}>
          <fieldset disabled={pending} className="min-w-0 space-y-3">
            <p className="wb-muted text-sm">Changes to the display name and description are local to Workbox.</p>
            <label className="block space-y-1 text-sm">
              <span>Display name{details.curation.name && <span className="wb-chip ml-2">Local override</span>}</span>
              <input className={fieldClass} value={name} required onChange={(event) => { setName(event.target.value); setSaved(false); }} />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Description{details.curation.description && <span className="wb-chip ml-2">Local override</span>}</span>
              <textarea className={fieldClass} rows={3} value={description} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} />
            </label>
            <button type="submit" className="wb-btn" disabled={name === details.name && description === details.description}>
              {pending ? "Saving…" : "Save details"}
            </button>
            {saved && <p role="status" className="text-sm">Repository details saved.</p>}
            {error && <RequestError error={error} />}
          </fieldset>
        </form>
      </div>
    </section>
  );
}

function SignedWorkflows({ workflows }: { workflows: Settings["workflows"] }) {
  const messages = {
    empty: "No signed workflows are visible in this repository.",
    incomplete: "Some signed workflow history is unavailable.",
    unsupported: "This Hubnot version does not expose signed workflow reads.",
    unavailable: "Signed workflow history is unavailable.",
  };
  return (
    <section aria-labelledby="signed-workflows" className="wb-panel space-y-3 p-4">
      <h3 id="signed-workflows" className="font-semibold">Signed Hubnot workflows</h3>
      {workflows.state !== "ready" && <p className="wb-muted text-sm">{messages[workflows.state]}</p>}
      {workflows.items.length > 0 && (
        <ul className="divide-y divide-[var(--wb-border)]">
          {workflows.items.map((workflow) => (
            <li key={workflow.id} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="break-all">{workflow.title || workflow.name || workflow.id}</strong>
                {workflow.name && workflow.name !== workflow.title && <span className="wb-mono break-all">{workflow.name}</span>}
                <span className="wb-chip">{workflowStatus[workflow.status]}</span>
              </div>
              <p className="wb-muted break-all text-xs">Workflow <code className="wb-mono">{workflow.id}</code></p>
              {workflow.revision && <p className="wb-muted break-all text-xs">Revision <code className="wb-mono">{workflow.revision}</code></p>}
              {workflow.status === "conflicted" && workflow.heads.length > 0 && (
                <div className="wb-muted text-xs">
                  <p>Conflicting revisions</p>
                  <ul className="ml-5 list-disc">{workflow.heads.map((head) => <li key={head}><code className="wb-mono break-all">{head}</code></li>)}</ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PipelineEditor({ settings, endpoint, submission }: { settings: Settings; endpoint: string; submission: SubmissionAvailability }) {
  const { details, pipelines } = settings;
  const pipelineMessages = {
    empty: "No pipelines are committed at this revision.",
    incomplete: "Some committed pipeline definitions could not be read.",
    unavailable: "Committed pipeline history is unavailable.",
  };

  return (
    <PipelineGraphEditor endpoint={endpoint} availability={submission} pipelineNames={pipelines.items.map(item => item.name)}>
      <section aria-labelledby="committed-pipelines" className="wb-panel space-y-3 p-4">
        <h3 id="committed-pipelines" className="font-semibold">Committed pipelines</h3>
        {details.commit && (
          <p className="wb-muted text-sm">
            {details.branch && <code className="wb-mono break-all">{details.branch}</code>}{" "}
            <code className="wb-mono" title={details.commit}>{details.commit.slice(0, 12)}</code>
          </p>
        )}
        {pipelines.policy.href && <Link className="wb-link text-sm" href={pipelines.policy.href}>View governing policy</Link>}
        {pipelines.policy.state === "invalid" && <p className="wb-muted text-sm">The committed policy is invalid.</p>}
        {pipelines.policy.state === "unavailable" && <p className="wb-muted text-sm">Committed policy history is unavailable.</p>}
        {pipelines.policy.state === "absent" && <p className="wb-muted text-sm">No policy is committed at this revision.</p>}
        {pipelines.state !== "ready" && <p className="wb-muted text-sm">{pipelineMessages[pipelines.state]}</p>}
        {pipelines.items.length > 0 && (
          <ul className="divide-y divide-[var(--wb-border)]">
            {pipelines.items.map((pipeline) => (
              <li key={pipeline.path} className="space-y-2 py-3 text-sm first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="break-all">{pipeline.name}</strong>
                  {pipeline.required && <span className="wb-chip">Required by policy</span>}
                  {pipeline.state === "invalid" && <span className="wb-chip">Invalid definition</span>}
                  {pipeline.state === "unavailable" && <span className="wb-chip">Definition unavailable</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link className="wb-link wb-mono break-all text-xs" href={pipeline.href}>{pipeline.path}</Link>
                  {pipeline.definition !== null && (
                    <LoadPipelineDraftButton name={pipeline.name} />
                  )}
                </div>
                {pipeline.steps.length > 0 && (
                  <ol className="ml-5 list-decimal space-y-1">
                    {pipeline.steps.map((step, index) => (
                      <li key={index} className="break-all">
                        <span>{step.name}</span>{" "}
                        <code className="wb-muted wb-mono">{[step.command, ...(step.args ?? [])].join(" ")}</code>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SignedWorkflows workflows={settings.workflows} />

    </PipelineGraphEditor>
  );
}

export function RepoSettings({ settings, submission }: { settings: Settings; submission: SubmissionAvailability }) {
  const id = encodeURIComponent(settings.details.id);
  const endpoint = `/api/projects/${id}/settings`;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <RepositoryDetails details={settings.details} endpoint={endpoint} />
      <section aria-labelledby="repo-workflows" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="repo-workflows" className="text-base font-semibold">Workflows</h2>
          <Link href={`/p/${id}/ci`} className="wb-link text-sm">View CI runs</Link>
        </div>
        <PipelineEditor settings={settings} endpoint={endpoint} submission={submission} />
      </section>
    </div>
  );
}
