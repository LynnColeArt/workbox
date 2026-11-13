"use client";

import { useState, type FormEvent } from "react";

type Preview = {
  session: string;
  source: string;
  destination: string;
  records: number;
  confirmation: string;
  progress?: Record<string, number>;
  intents: Array<{ id: string; kind: string; action: string }>;
  findings: Array<{ id: string; status: string; message: string }>;
};

export function MigrationForm({ endpoint, sources, foreign, sessions }: {
  endpoint: string; sources: string[]; foreign: string[]; sessions: string[];
}) {
  const [source, setSource] = useState(sources[0] ?? "");
  const [saved, setSaved] = useState(sessions);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    if (input.action === "plan" || input.action === "inspect") setPreview(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!result.ok) {
        setMessage(result.error.message);
      } else if (result.data.confirmation) {
        const item = result.data as Preview;
        setPreview(item);
        setSaved(previous => previous.includes(item.session) ? previous : [...previous, item.session]);
      } else {
        setMessage("Migration applied.");
        setPreview(null);
      }
    } catch {
      setMessage("Migration status is unavailable. Inspect the saved session before retrying.");
    } finally {
      setBusy(false);
    }
  }

  function plan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = (key: string) => String(data.get(key) ?? "").trim();
    const list = (key: string) => values(key).split(",").map(value => value.trim()).filter(Boolean);
    void run({ action: "plan", source, repository: values("repository"), endpoint: values("endpoint") || undefined,
      version: values("version") || undefined, credentialMode: values("credentialMode") || undefined,
      kinds: list("kinds"), decisions: list("decisions") });
  }

  return (
    <>
      <form onSubmit={plan} className="wb-panel grid gap-3 p-4">
        <label>Source <select className="wb-btn ml-2" value={source} onChange={event => setSource(event.target.value)}>
          {sources.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Source repository or path <input name="repository" className="wb-btn ml-2" required /></label>
        {foreign.includes(source) && <>
          <label>API endpoint <input name="endpoint" type="url" className="wb-btn ml-2" required /></label>
          <label>API version <input name="version" className="wb-btn ml-2" required /></label>
          <label>Credential mode <input name="credentialMode" className="wb-btn ml-2" required /></label>
        </>}
        <label>Record kinds (comma-separated) <input name="kinds" className="wb-btn ml-2" /></label>
        <label>Decisions (finding=action, comma-separated) <input name="decisions" className="wb-btn ml-2" /></label>
        <button className="wb-btn justify-self-start" disabled={busy || !source}>Preview migration</button>
      </form>
      {saved.length > 0 && <section className="wb-panel space-y-2 p-4" aria-label="Saved migrations">
        <h2 className="font-semibold">Saved migrations</h2>
        {saved.map(session => <button key={session} className="wb-btn block" disabled={busy}
          onClick={() => void run({ action: "inspect", session })}>Inspect {session}</button>)}
      </section>}
      {preview && <section className="wb-panel space-y-3 p-4" aria-label="Migration plan">
        <h2 className="font-semibold">Review migration</h2>
        <p>{preview.source} to {preview.destination} · {preview.records} records</p>
        {preview.progress && <p>{preview.progress.confirmed ?? 0} of {preview.progress.total ?? 0} actions confirmed</p>}
        <ul>{preview.intents.map(intent => <li key={intent.id}>{intent.action} {intent.kind}</li>)}</ul>
        <ul>{preview.findings.map(finding => <li key={finding.id}>{finding.id} · {finding.status} · {finding.message}</li>)}</ul>
        <div className="flex gap-3">
          <button className="wb-btn" disabled={busy} onClick={() => void run({ action: "apply", session: preview.session,
            confirmation: preview.confirmation })}>Apply reviewed plan</button>
          <button className="wb-btn" disabled={busy} onClick={() => void run({ action: "resume", session: preview.session,
            confirmation: preview.confirmation })}>Resume reviewed plan</button>
        </div>
      </section>}
      {(busy || message) && <p role="status">{busy ? "Hubnot is processing the migration." : message}</p>}
    </>
  );
}
