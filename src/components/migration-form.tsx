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

type Field = { name: string; label: string; required: boolean; choices?: string[] };
type Adapter = { kind: string; fields: Field[] };

function MigrationInput({ field, name }: { field: Field; name: string }) {
  if (field.choices?.length) {
    return <select name={name} className="wb-btn ml-2" required={field.required} defaultValue="">
      <option value="">Select</option>
      {field.choices.map(choice => <option key={choice}>{choice}</option>)}
    </select>;
  }
  return <input name={name} className="wb-btn ml-2" required={field.required} />;
}

export function MigrationForm({ endpoint, sources, destinations, paths, sessions }: {
  endpoint: string; sources: Adapter[]; destinations: Adapter[];
  paths: Array<{ source: string; destination: string; operations: string[] }>; sessions: string[];
}) {
  const [source, setSource] = useState(sources[0]?.kind ?? "");
  const [chosenDestination, setDestination] = useState("local");
  const choices = destinations.filter(adapter => paths.some(path => path.source === source &&
    path.destination === adapter.kind && path.operations.includes("plan")));
  const destination = choices.some(adapter => adapter.kind === chosenDestination) ? chosenDestination : choices[0]?.kind ?? "";
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
    void run({ action: "plan", source, destination, sourceInputs: Object.fromEntries((sources.find(adapter => adapter.kind === source)?.fields ?? [])
        .map(field => [field.name, values(field.name)]).filter(([, value]) => value)),
      destinationInputs: Object.fromEntries((choices.find(adapter => adapter.kind === destination)?.fields ?? [])
        .map(field => [field.name, values("destination-" + field.name)]).filter(([, value]) => value)), refs: list("refs"), snapshots: list("snapshots"), kinds: list("kinds"), decisions: list("decisions") });
  }

  return (
    <>
      {sources.length > 0 && <form onSubmit={plan} className="wb-panel grid gap-3 p-4">
        <label>Source <select className="wb-btn ml-2" value={source} onChange={event => setSource(event.target.value)}>
          {sources.map(({ kind }) => <option key={kind}>{kind}</option>)}
        </select></label>
        {sources.find(adapter => adapter.kind === source)?.fields.map(field => (
          <label key={field.name}>{field.label} <MigrationInput field={field} name={field.name} /></label>
        ))}
        <label>Destination <select className="wb-btn ml-2" value={destination} onChange={event => setDestination(event.target.value)}>
          {choices.map(({ kind }) => <option key={kind}>{kind}</option>)}
        </select></label>
        {choices.find(adapter => adapter.kind === destination)?.fields.map(field => (
          <label key={field.name}>Destination {field.label.toLowerCase()} <MigrationInput field={field} name={"destination-" + field.name} /></label>
        ))}
        {source === "local" && <label>Git refs (comma-separated) <input name="refs" className="wb-btn ml-2" required /></label>}
        {source === "imported" && <label>Snapshot IDs (comma-separated) <input name="snapshots" className="wb-btn ml-2" required /></label>}
        <label>Record kinds (comma-separated) <input name="kinds" className="wb-btn ml-2" /></label>
        <label>Decisions (finding=action, comma-separated) <input name="decisions" className="wb-btn ml-2" /></label>
        <button className="wb-btn justify-self-start" disabled={busy || !source || !destination}>Preview migration</button>
      </form>}
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
