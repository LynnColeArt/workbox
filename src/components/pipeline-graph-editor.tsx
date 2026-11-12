import Link from "next/link";
import { createContext, useContext, useId, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { PipelineDraft, PipelineDraftEdit } from "@/lib/workbox/pipeline-draft";
import type { reviewPipelineDraft } from "@/lib/workbox/pipeline-review";
import type { PipelineTemplate, PipelineTemplateCatalog } from "@/lib/workbox/pipeline-templates";

type Review = Extract<Awaited<ReturnType<typeof reviewPipelineDraft>>, { ok: true }>["data"];
type Attempt = NonNullable<Review["submission"]>;
type Availability = { available: boolean; reason?: string };
type Diagnostic = { path: string; message: string };
type OperationError = { code: string; message: string; diagnostics?: readonly Diagnostic[] };
type Result<T> = { ok: true; data: T } | { ok: false; error: OperationError };
type Node = PipelineDraft["nodes"][number];

const tabs = [
  { id: "graph", label: "Graph" },
  { id: "json", label: "JSON" },
  { id: "review", label: "Review changes" },
] as const;
type Tab = typeof tabs[number]["id"];

const fieldClass = "w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm";
const fieldLabel = "block space-y-1 text-sm";

function textareaText(raw: string) {
  return raw.replace(/\r\n?/g, "\n");
}

function rawOffset(raw: string, textareaOffset: number) {
  let offset = 0;
  for (let index = 0; index < textareaOffset && offset < raw.length; index++, offset++) {
    if (raw[offset] === "\r" && raw[offset + 1] === "\n") offset++;
  }
  return offset;
}

function joinTextareaSpans(...spans: string[]) {
  let combined = "";
  for (const span of spans) {
    if (combined.endsWith("\r") && span.startsWith("\n")) {
      // The two adjacent line endings were distinct in the textarea.
      combined = combined.slice(0, -1) + "\n";
    }
    combined += span;
  }
  return combined;
}

// Textareas use LF offsets even when the draft contains CRLF or CR.
function applyTextareaEdit(raw: string, event: ChangeEvent<HTMLTextAreaElement>) {
  const { value: next, selectionEnd } = event.currentTarget;
  const previous = textareaText(raw);
  const input = event.nativeEvent;
  if (input instanceof InputEvent && selectionEnd !== null) {
    const inserted = input.inputType.startsWith("delete") ? ""
      : input.inputType === "insertLineBreak" ? "\n" : input.data;
    if (inserted !== null) {
      const start = selectionEnd - textareaText(inserted).length;
      const end = previous.length - (next.length - selectionEnd);
      if (start >= 0 && end >= start && previous.slice(0, start) === next.slice(0, start) &&
          previous.slice(end) === next.slice(selectionEnd) && textareaText(inserted) === next.slice(start, selectionEnd)) {
        return joinTextareaSpans(raw.slice(0, rawOffset(raw, start)), inserted, raw.slice(rawOffset(raw, end)));
      }
    }
  }
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let suffix = 0;
  while (suffix < previous.length - start && suffix < next.length - start &&
         previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  return joinTextareaSpans(
    raw.slice(0, rawOffset(raw, start)),
    next.slice(start, next.length - suffix),
    raw.slice(rawOffset(raw, previous.length - suffix)),
  );
}

function pasteExact(event: ClipboardEvent<HTMLTextAreaElement>, raw: string, update: (text: string) => void) {
  const { clipboardData, currentTarget: input } = event;
  if (!clipboardData.types.includes("text/plain")) return;
  event.preventDefault();
  const inserted = clipboardData.getData("text/plain");
  const start = rawOffset(raw, input.selectionStart);
  const end = rawOffset(raw, input.selectionEnd);
  const cursor = input.selectionStart + textareaText(inserted).length;
  update(raw.slice(0, start) + inserted + raw.slice(end));
  requestAnimationFrame(() => input.setSelectionRange(cursor, cursor));
}

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

function Diagnostics({ items }: { items: readonly Diagnostic[] }) {
  if (!items.length) return null;
  return (
    <ul className="ml-5 list-disc text-sm text-[var(--wb-warn)]">
      {items.map(({ path, message }, index) => (
        <li key={index}><code className="wb-mono mr-2 break-all">{path}</code>{message}</li>
      ))}
    </ul>
  );
}

function StepInspector({ node, disabled, setDirty, save }: {
  node: Node;
  disabled: boolean;
  setDirty: (dirty: boolean) => void;
  save: (patch: Extract<PipelineDraftEdit, { kind: "patch" }>["patch"]) => void;
}) {
  const { step } = node;
  const [name, setName] = useState(step.name);
  const [command, setCommand] = useState(step.command);
  const [args, setArgs] = useState(step.args ?? []);
  const [directory, setDirectory] = useState(step.workingDirectory ?? "");
  const [timeout, setTimeoutValue] = useState(step.timeoutSeconds?.toString() ?? "");
  const [formatError, setFormatError] = useState("");
  const argumentsId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timeout && (!/^\d+$/.test(timeout) || !Number.isSafeInteger(Number(timeout)))) {
      setFormatError("Enter a whole number of seconds.");
      return;
    }
    setFormatError("");
    const patch: Parameters<typeof save>[0] = {};
    if (name !== step.name) patch.name = name;
    if (command !== step.command) patch.command = command;
    if (JSON.stringify(args) !== JSON.stringify(step.args ?? [])) patch.args = args;
    if (directory !== (step.workingDirectory ?? "")) patch.workingDirectory = directory || null;
    if (timeout !== (step.timeoutSeconds?.toString() ?? "")) patch.timeoutSeconds = timeout ? Number(timeout) : null;
    if (Object.keys(patch).length) save(patch);
    else setDirty(false);
  }

  function addArgument() {
    setDirty(true);
    setArgs([...args, ""]);
    requestAnimationFrame(() => document.getElementById(`${argumentsId}-${args.length}`)?.focus());
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <label className={fieldLabel}>Step name<input className={fieldClass} value={name} onChange={event => { setName(event.target.value); setDirty(true); }} /></label>
        <label className={fieldLabel}>Executable<input className={fieldClass} value={command} onChange={event => { setCommand(event.target.value); setDirty(true); }} /></label>
        <div className="space-y-2">
          <p className="text-sm font-medium">Arguments</p>
          {args.map((argument, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className={`${fieldLabel} min-w-0 flex-1`}>
                Argument {index + 1}
                <textarea id={`${argumentsId}-${index}`} rows={1} className={fieldClass} value={argument}
                  onChange={event => {
                    const text = applyTextareaEdit(argument, event);
                    setArgs(args.map((value, i) => i === index ? text : value));
                    setDirty(true);
                  }}
                  onPaste={event => pasteExact(event, argument, text => {
                    setArgs(args.map((value, i) => i === index ? text : value));
                    setDirty(true);
                  })} />
              </label>
              <button type="button" className="wb-btn" aria-label={`Remove argument ${index + 1}`}
                onClick={() => {
                  setDirty(true);
                  setArgs(args.filter((_, i) => i !== index));
                  const focusId = args.length === 1 ? `${argumentsId}-add` : `${argumentsId}-${Math.min(index, args.length - 2)}`;
                  requestAnimationFrame(() => document.getElementById(focusId)?.focus());
                }}>Remove</button>
            </div>
          ))}
          <button id={`${argumentsId}-add`} type="button" className="wb-btn" disabled={args.length >= 256} onClick={addArgument}>Add argument</button>
        </div>
        <label className={fieldLabel}>Working directory<input className={fieldClass} value={directory} onChange={event => { setDirectory(event.target.value); setDirty(true); }} /></label>
        <label className={fieldLabel}>Timeout in seconds
          <input className={fieldClass} inputMode="numeric" value={timeout} onChange={event => { setTimeoutValue(event.target.value); setDirty(true); }} />
        </label>
        {formatError && <p role="alert" className="text-sm text-[var(--wb-warn)]">{formatError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="wb-btn">Save step</button>
          <button type="button" className="wb-btn" onClick={() => {
            setName(step.name);
            setCommand(step.command);
            setArgs(step.args ?? []);
            setDirectory(step.workingDirectory ?? "");
            setTimeoutValue(step.timeoutSeconds?.toString() ?? "");
            setFormatError("");
            setDirty(false);
          }}>Discard step edits</button>
        </div>
      </fieldset>
    </form>
  );
}

function TemplateInputs({ template, disabled, add }: { template: PipelineTemplate; disabled: boolean; add: (inputs: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: [string, string | number][] = [];
    for (const field of template.inputs) {
      if (!Object.hasOwn(values, field.key)) continue;
      const value = values[field.key];
      if (field.type === "integer" && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
        setError(`${field.label} requires a whole number.`);
        return;
      }
      fields.push([field.key, field.type === "integer" ? Number(value) : value]);
    }
    setError("");
    add(Object.fromEntries(fields));
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled} className="min-w-0 space-y-2">
        {template.description && <p className="wb-muted text-sm">{template.description}</p>}
        {template.inputs.map(field => (
          <label key={field.key} className={fieldLabel}>{field.label}
            <input className={fieldClass} value={values[field.key] ?? field.default?.toString() ?? ""}
              inputMode={field.type === "integer" ? "numeric" : undefined}
              onChange={event => setValues({ ...values, [field.key]: event.target.value })} />
          </label>
        ))}
        {error && <p role="alert" className="text-sm text-[var(--wb-warn)]">{error}</p>}
        <button className="wb-btn" type="submit">Add from template</button>
      </fieldset>
    </form>
  );
}

const catalogMessages: Partial<Record<PipelineTemplateCatalog["state"], string>> = {
  absent: "This revision has no repository template catalog.",
  empty: "The repository template catalog is empty.",
  partial: "Some repository templates could not be loaded.",
  invalid: "The repository template catalog is invalid.",
  unavailable: "The repository template catalog is unavailable.",
};

function ExactText({ label, text, filename }: { label: string; text: string | null; filename: string }) {
  function download() {
    if (text === null) return;
    const href = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return (
    <details className="min-w-0 space-y-2 text-sm">
      <summary className="cursor-pointer">{label}</summary>
      {text === null ? <p className="wb-muted">New file</p> : (
        <>
          <button className="wb-btn" type="button" onClick={download}>Download {label.toLowerCase()}</button>
          <pre className="wb-mono max-h-64 overflow-auto rounded bg-[var(--wb-bg)] p-3 text-xs">{text}</pre>
        </>
      )}
    </details>
  );
}

const lineEndings = { lf: "LF", crlf: "CRLF", cr: "CR", none: "No newline" } as const;

function DiffReview({ review }: { review: Review }) {
  return (
    <div className="space-y-3">
      <p className="wb-muted break-all text-sm">
        <code className="wb-mono">{review.path}</code>{" at "}<code className="wb-mono">{review.base.branch} {review.base.commit.slice(0, 12)}</code>
      </p>
      {review.actor && <p className="wb-muted break-all text-sm">Signing identity <code className="wb-mono">{review.actor}</code></p>}
      {review.diff.state === "incomplete" && <p className="wb-muted text-sm">The diff is too large to display in full. Download the exact definitions below.</p>}
      {review.diff.hunks.length > 0 && (
        <div aria-label="Pipeline diff" className="wb-mono max-h-96 overflow-auto rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] text-xs">
          {review.diff.hunks.map((hunk, index) => (
            <div key={index}>
              <div className="wb-muted bg-[var(--wb-panel-2)] px-3 py-1">@@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@</div>
              {hunk.lines.map((line, lineIndex) => (
                <div key={lineIndex} className={`flex min-w-max gap-2 px-3 py-0.5 ${line.kind === "add" ? "bg-green-950/60" : line.kind === "remove" ? "bg-red-950/60" : ""}`}>
                  <span aria-label={line.kind}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</span>
                  <code className="whitespace-pre">{line.text}</code>
                  <span className="wb-muted">{lineEndings[line.ending]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <ExactText label="Committed definition" text={review.diff.before} filename={`${review.name}.before.json`} />
        <ExactText label="Proposed definition" text={review.diff.after} filename={`${review.name}.json`} />
      </div>
    </div>
  );
}

const definitiveRefusals = new Set(["stale_preview", "policy_required", "operation_conflict", "invalid_input", "not_found"]);

const DraftLoader = createContext<{ openDraft: (name: string) => void; disabled: boolean } | null>(null);

export function LoadPipelineDraftButton({ name }: { name: string }) {
  const loader = useContext(DraftLoader);
  return <button type="button" className="wb-btn" disabled={!loader || loader.disabled} onClick={() => loader?.openDraft(name)}>Load into draft</button>;
}

export function PipelineGraphEditor({ endpoint, availability, children }: {
  endpoint: string;
  availability: Availability;
  children: ReactNode;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<PipelineDraft | null>(null);
  const [catalog, setCatalog] = useState<PipelineTemplateCatalog | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [tab, setTab] = useState<Tab>("graph");
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [stepDirty, setStepDirty] = useState(false);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [proposalHref, setProposalHref] = useState<string | null>(null);
  const [error, setError] = useState<OperationError | null>(null);
  const [submitError, setSubmitError] = useState<OperationError | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedIndex = draft?.nodes.findIndex(node => node.id === nodeId) ?? -1;
  const selected = draft?.nodes[selectedIndex];
  const template = catalog?.templates.find(item => item.id === templateId);
  const unapplied = draft !== null && jsonText !== null && jsonText !== draft.definition;
  const graphDisabled = busy || unapplied || draft?.projection === "stale";
  const canReview = draft?.projection === "valid" && !unapplied && !stepDirty && !busy;
  const currentReview = draft && review?.draftRevision === draft.revision && !unapplied && !stepDirty ? review : null;
  const currentAvailability = currentReview?.proposalSubmission ?? availability;

  async function run(work: () => Promise<void>) {
    // A single in-flight operation means an older response cannot replace a newer snapshot.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function loadCatalog(snapshot: PipelineDraft) {
    const response = await request<PipelineTemplateCatalog>(endpoint, { action: "draft_templates", draft: snapshot });
    if (response.ok) setCatalog(response.data);
    else {
      setCatalog(null);
      setError(response.error);
    }
  }

  function openDraft(target: string) {
    if (stepDirty || unapplied) return;
    if (draft?.name === target) {
      heading.current?.focus();
      return;
    }
    void run(async () => {
      setError(null);
      const response = await request<PipelineDraft>(endpoint, { action: "draft_open", name: target });
      if (!response.ok) {
        setError(response.error);
        heading.current?.focus();
        return;
      }
      const snapshot = response.data;
      setDraft(snapshot);
      setName(snapshot.name);
      setNodeId(snapshot.nodes[0]?.id ?? null);
      setJsonText(null);
      setTemplateId("");
      setReview(null);
      setCopied(false);
      setTab("graph");
      await loadCatalog(snapshot);
      heading.current?.focus();
    });
  }

  function edit(change: PipelineDraftEdit) {
    if (!draft) return;
    void run(async () => {
      setError(null);
      const response = await request<PipelineDraft>(endpoint, { action: "draft_edit", draft, expectedRevision: draft.revision, edit: change });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      const snapshot = response.data;
      setDraft(snapshot);
      setJsonText(null);
      setReview(null);
      setCopied(false);
      setStepDirty(false);
      let focusId: string | undefined;
      switch (change.kind) {
        case "add":
        case "expand_template":
          focusId = snapshot.nodes.at(-1)?.id;
          break;
        case "duplicate":
          focusId = snapshot.nodes[selectedIndex + 1]?.id;
          break;
        case "reorder":
        case "patch":
          focusId = change.nodeId;
          break;
        case "remove":
          focusId = snapshot.nodes[Math.min(selectedIndex, snapshot.nodes.length - 1)]?.id;
          if (!focusId) requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus());
          break;
        default:
          if (!snapshot.nodes.some(node => node.id === nodeId)) setNodeId(snapshot.nodes[0]?.id ?? null);
      }
      if (focusId) {
        setNodeId(focusId);
        requestAnimationFrame(() => document.getElementById(`${id}-${focusId}`)?.focus());
      } else if (change.kind === "remove") setNodeId(null);
    });
  }

  function refresh() {
    if (!draft || unapplied || stepDirty) return;
    void run(async () => {
      setError(null);
      const response = await request<PipelineDraft>(endpoint, { action: "draft_refresh", draft, expectedRevision: draft.revision });
      if (!response.ok) { setError(response.error); return; }
      setDraft(response.data);
      setReview(null);
      setTemplateId("");
      await loadCatalog(response.data);
    });
  }

  function reviewChanges() {
    if (!draft || !canReview) return;
    void run(async () => {
      setError(null);
      setReview(null);
      const response = await request<Review>(endpoint, { action: "draft_review", draft, expectedRevision: draft.revision });
      if (response.ok) setReview(response.data);
      else setError(response.error);
    });
  }

  function submit(frozen: Attempt, retry: boolean) {
    void run(async () => {
      setSubmitError(null);
      setAttempt(frozen);
      const response = await request<{ href: string }>(endpoint, { action: "submit", ...frozen, confirmed: true });
      if (response.ok) {
        setProposalHref(response.data.href);
        setAttempt(null);
        setReview(null);
      } else {
        setSubmitError(response.error);
        if ((definitiveRefusals.has(response.error.code) && !(retry && response.error.code === "not_found")) ||
            (!retry && response.error.code === "denied")) setAttempt(null);
        if (response.error.code === "stale_preview" || response.error.code === "denied") setReview(null);
      }
    });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
  }

  function updateJson(text: string) {
    setJsonText(text);
    setReview(null);
    setCopied(false);
  }

  async function copyJson() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(jsonText ?? draft.definition);
      setCopied(true);
    } catch {
      setError({ code: "unavailable", message: "Clipboard access is unavailable. Select the JSON text to copy it." });
    }
  }

  return (
    <>
      <DraftLoader.Provider value={{ openDraft, disabled: busy || unapplied || stepDirty }}>{children}</DraftLoader.Provider>
      <section id="pipeline-draft" aria-labelledby={`${id}-heading`} className="wb-panel space-y-4 p-4">
        <h3 id={`${id}-heading`} ref={heading} tabIndex={-1} className="font-semibold">Pipeline draft</h3>
        <form onSubmit={event => { event.preventDefault(); openDraft(name); }} className="flex flex-wrap items-end gap-2">
          <label className={`${fieldLabel} min-w-0 flex-1`}>Pipeline name<input className={fieldClass} value={name} required disabled={busy} onChange={event => setName(event.target.value)} /></label>
          <button type="submit" className="wb-btn" disabled={busy || !name || unapplied || stepDirty}>Open draft</button>
        </form>
        {error && <div role="alert" className="text-sm text-[var(--wb-warn)]"><p>{error.message}</p><Diagnostics items={error.diagnostics ?? []} /></div>}
        {(attempt || proposalHref || submitError) && (
          <div className="space-y-2 rounded border border-[var(--wb-border)] p-3 text-sm">
            {proposalHref && <p role="status"><Link className="wb-link" href={proposalHref}>View proposal</Link></p>}
            {submitError && <p role="alert" className="text-[var(--wb-warn)]">{submitError.message}</p>}
            {attempt && (
              <>
                <p className="wb-muted break-all">Confirmed draft <code>{attempt.name}</code> at <code>{attempt.base.commit.slice(0, 12)}</code></p>
                <button type="button" className="wb-btn" disabled={busy} onClick={() => submit(attempt, true)}>Retry confirmed proposal</button>
              </>
            )}
          </div>
        )}
        {draft && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="wb-muted break-all"><code>{draft.path}</code> at <code>{draft.base.branch} {draft.base.commit.slice(0, 12)}</code></p>
              <button type="button" className="wb-btn" disabled={busy || unapplied || stepDirty} onClick={refresh}>Refresh draft base</button>
            </div>
            <div role="tablist" aria-label="Pipeline draft views" className="flex flex-wrap gap-2 border-b border-[var(--wb-border)]">
              {tabs.map((item, index) => (
                <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id}
                  aria-controls={`${id}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => setTab(item.id)} onKeyDown={event => moveTab(event, index)}
                  className={`border-b-2 px-3 py-2 text-sm ${tab === item.id ? "border-[var(--wb-accent)] font-semibold" : "wb-muted border-transparent"}`}>
                  {item.label}
                </button>
              ))}
            </div>
            {draft.diagnostics.length > 0 && <Diagnostics items={draft.diagnostics} />}
            {stepDirty && <p role="status" className="wb-muted text-sm">Save or discard the step edits to continue.</p>}
            {unapplied && <p role="status" className="wb-muted text-sm">Apply the JSON edits before editing the graph or reviewing changes.</p>}
            <div role="tabpanel" id={`${id}-panel-graph`} aria-labelledby={`${id}-tab-graph`} hidden={tab !== "graph"} className="space-y-3">
              {draft.projection === "stale" && (
                <p role="status" className="wb-muted text-sm">
                  {draft.nodes.length ? "The graph shows the last valid JSON. Apply valid JSON or restore the last valid draft to edit." : "Apply valid JSON to show the graph."}
                </p>
              )}
              <div className="grid gap-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]">
                <div className="space-y-3">
                  <ol aria-label="Execution order" className="space-y-2">
                    {draft.nodes.map(node => (
                      <li key={node.id} className="space-y-2">
                        <button type="button" id={`${id}-${node.id}`} aria-current={node.id === nodeId ? "step" : undefined}
                          className={`block w-full break-all rounded border px-3 py-2 text-left text-sm ${node.id === nodeId ? "border-[var(--wb-accent)] bg-[var(--wb-panel-2)]" : "border-[var(--wb-border)]"}`}
                          disabled={stepDirty && node.id !== nodeId} onClick={() => setNodeId(node.id)}>
                          <span className="block font-medium">{node.step.name || "Untitled command"}</span>
                          {node.step.command && <code className="wb-muted wb-mono">{node.step.command}</code>}
                        </button>
                        {draft.edges.some(edge => edge.from === node.id) && <span aria-hidden="true" className="mx-auto block h-3 w-px bg-[var(--wb-accent)]" />}
                      </li>
                    ))}
                  </ol>
                  <button id={`${id}-add`} type="button" className="wb-btn" disabled={graphDisabled || stepDirty || draft.nodes.length >= 64} onClick={() => edit({ kind: "add" })}>Add command</button>
                </div>
                {selected && (
                  <div className="min-w-0 space-y-3 rounded border border-[var(--wb-border)] p-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="wb-btn" disabled={graphDisabled || stepDirty || draft.nodes.length >= 64} onClick={() => edit({ kind: "duplicate", nodeId: selected.id })}>Duplicate step</button>
                      <button type="button" className="wb-btn" disabled={graphDisabled || stepDirty || selectedIndex <= 0} onClick={() => edit({ kind: "reorder", nodeId: selected.id, index: selectedIndex - 1 })}>Move up</button>
                      <button type="button" className="wb-btn" disabled={graphDisabled || stepDirty || selectedIndex >= draft.nodes.length - 1} onClick={() => edit({ kind: "reorder", nodeId: selected.id, index: selectedIndex + 1 })}>Move down</button>
                      <button type="button" className="wb-btn" disabled={graphDisabled || stepDirty} onClick={() => edit({ kind: "remove", nodeId: selected.id })}>Remove step</button>
                    </div>
                    <StepInspector key={`${selected.id}:${draft.revision}`} node={selected} disabled={graphDisabled} setDirty={setStepDirty}
                      save={patch => edit({ kind: "patch", nodeId: selected.id, patch })} />
                  </div>
                )}
              </div>
              {catalog && (
                <div className="space-y-2 border-t border-[var(--wb-border)] pt-3">
                  <h4 className="text-sm font-semibold">Repository templates</h4>
                  {catalog.href && <Link className="wb-link break-all text-sm" href={catalog.href}>Catalog at {catalog.base.commit.slice(0, 12)}</Link>}
                  {catalogMessages[catalog.state] && <p className="wb-muted text-sm">{catalogMessages[catalog.state]}</p>}
                  <Diagnostics items={catalog.diagnostics} />
                  {catalog.templates.length > 0 && (
                    <label className={fieldLabel}>Template
                      <select className={fieldClass} value={templateId} disabled={graphDisabled || stepDirty || draft.nodes.length >= 64} onChange={event => setTemplateId(event.target.value)}>
                        <option value="">Select a template</option>
                        {catalog.templates.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                  )}
                  {template && <TemplateInputs key={template.id} template={template} disabled={graphDisabled || stepDirty || draft.nodes.length >= 64}
                    add={inputs => edit({ kind: "expand_template", templateId: template.id, inputs })} />}
                </div>
              )}
            </div>
            <div role="tabpanel" id={`${id}-panel-json`} aria-labelledby={`${id}-tab-json`} hidden={tab !== "json"} className="space-y-3">
              <label className={fieldLabel}>Pipeline definition (JSON)
                <textarea className={`${fieldClass} wb-mono`} spellCheck={false} rows={12} value={jsonText ?? draft.definition} disabled={busy || stepDirty}
                  onChange={event => updateJson(applyTextareaEdit(jsonText ?? draft.definition, event))}
                  onPaste={event => pasteExact(event, jsonText ?? draft.definition, updateJson)} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="wb-btn" disabled={!unapplied || busy}
                  onClick={() => edit({ kind: "replace_json", definition: jsonText ?? draft.definition })}>Apply JSON</button>
                <button type="button" className="wb-btn" onClick={() => void copyJson()}>Copy exact JSON</button>
                {draft.lastValid !== null && (draft.projection !== "valid" || unapplied) && (
                  <button type="button" className="wb-btn" disabled={busy}
                    onClick={() => edit({ kind: "restore" })}>Restore last valid draft</button>
                )}
                {copied && <span className="wb-muted text-sm" role="status">Copied.</span>}
              </div>
            </div>
            <div role="tabpanel" id={`${id}-panel-review`} aria-labelledby={`${id}-tab-review`} hidden={tab !== "review"} className="space-y-3">
              <button type="button" className="wb-btn" disabled={!canReview} onClick={reviewChanges}>Compare draft</button>
              {draft.projection !== "valid" && <p className="wb-muted text-sm">Resolve the draft diagnostics before reviewing changes.</p>}
              {currentReview && (
                <>
                  <DiffReview review={currentReview} />
                  <button type="button" className="wb-btn" disabled={!currentReview.submission || busy || attempt !== null}
                    onClick={() => { if (currentReview.submission) submit(currentReview.submission, false); }}>Open Hubnot proposal</button>
                </>
              )}
              {!currentAvailability.available && <p className="wb-muted text-sm">{currentAvailability.reason ?? "Opening a proposal is unavailable."}</p>}
            </div>
          </>
        )}
      </section>
    </>
  );
}
