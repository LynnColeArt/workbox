"use client";

import { useState } from "react";

export default function NewProjectForm() {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, description }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { id: string; url: string; actor: string; issueId: string } }
        | { ok: false; error: { message: string; step?: string } };
      if (data.ok) {
        setResult(`created ${data.data.id} — actor ${data.data.actor.slice(7, 19)} — opening ${data.data.url}`);
      } else {
        setError(`${data.error.step ? data.error.step + ": " : ""}${data.error.message}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="wb-panel p-4 space-y-3">
      <h2 className="text-sm font-semibold wb-muted uppercase tracking-wide">New hubnot project</h2>
      <p className="wb-muted text-xs">
        Creates a real repository in the projects folder: git tree, instance identity (.git/hn),
        governance policy, and a founding signed issue — verified facts from minute one.
      </p>
      <div className="flex gap-3">
        <input required value={id} onChange={(e) => setId(e.target.value)} placeholder="project-id (folder name)"
               className="wb-mono text-sm flex-1 px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)"
               className="text-sm flex-1 px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?"
             className="w-full text-sm px-3 py-2 rounded border bg-transparent" style={{ borderColor: "var(--wb-border)" }} />
      <button type="submit" disabled={busy || id.length === 0} className="wb-btn">
        {busy ? "creating…" : "Create project"}
      </button>
      {result && <p className="text-sm" style={{ color: "var(--wb-open)" }}>{result}</p>}
      {error && <p className="text-sm" style={{ color: "var(--wb-warn)" }}>{error}</p>}
    </form>
  );
}
