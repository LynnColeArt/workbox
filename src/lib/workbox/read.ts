import { catFile, chainCommits, commitSubject } from "../hn/gitread";
import { verifyEvent } from "../hn/verifier";

export interface EventRow {
  eventId: string;
  commitSha: string;
  actor: string;
  kind: string;
  sequence: number | null;
  timestamp: string | null;
  subject: string | null;
  intent: string | null;
  parentsJson: string;
  verified: boolean;
  verifyError: string | null;
  payloadJson: string;
  /** Which signed-fact family produced this event. */
  protocol: "collab" | "memory";
}

export interface ChainRead {
  events: EventRow[];
  /** Chain-walk-level failures (unreadable blobs, bad subjects). */
  walkErrors: string[];
}

function parseChainRef(ref: string): { actor: string; protocol: "collab" | "memory"; stream?: string } {
  const m = /^refs\/hn\/(?:remotes\/[^/]+\/)?memory\/([0-9a-f]{64})\/([0-9a-f]{64})$/.exec(ref);
  if (m) return { actor: m[1], protocol: "memory", stream: m[2] };
  const a = /^refs\/hn\/(?:remotes\/[^/]+\/)?actors\/([0-9a-f]{64})$/.exec(ref);
  if (a) return { actor: a[1], protocol: "collab" };
  throw new Error(`unrecognized hn chain ref: ${ref}`);
}

/**
 * Read one signed chain (actor or memory stream) newest-first, stopping
 * at the first commit already indexed, then process oldest→newest.
 */
export function readChain(
  repoPath: string,
  ref: string,
  knownCommit: (sha: string) => boolean,
  head = ref,
): ChainRead {
  const meta = parseChainRef(ref);
  const payloadFile = meta.protocol === "memory" ? "memory.json" : "event.json";
  const commits = chainCommits(repoPath, head); // newest first
  const todo: string[] = [];
  for (const sha of commits) {
    if (knownCommit(sha)) break; // append-only: everything older is indexed
    todo.push(sha);
  }
  todo.reverse(); // oldest first

  const events: EventRow[] = [];
  const walkErrors: string[] = [];

  for (const sha of todo) {
    const eventJson = catFile(repoPath, sha, payloadFile);
    const signature = catFile(repoPath, sha, "signature");
    const subject = commitSubject(repoPath, sha);
    if (eventJson === null || signature === null) {
      walkErrors.push(`commit ${sha}: ${payloadFile} or signature unreadable`);
      continue;
    }

    const idMatch = /sha256:([0-9a-f]{64})/.exec(subject);
    if (!idMatch) {
      walkErrors.push(`commit ${sha}: subject carries no event id ("${subject.slice(0, 80)}")`);
      continue;
    }

    const result = verifyEvent({
      eventJson: Buffer.from(eventJson, "utf8"),
      signature: Buffer.from(signature, "utf8"),
      commitSubject: subject,
      payloadFileName: payloadFile,
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(eventJson) as Record<string, unknown>;
    } catch {
      walkErrors.push(`commit ${sha}: ${payloadFile} unparseable`);
      continue;
    }

    events.push({
      eventId: result.eventId,
      commitSha: sha,
      actor: String(parsed.actor ?? ""),
      kind: meta.protocol === "memory" ? `memory.record` : String(parsed.kind ?? "unknown"),
      sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
      subject: meta.protocol === "memory" ? String(parsed.stream ?? "") : typeof parsed.subject === "string" ? parsed.subject : null,
      intent: typeof parsed.intent === "string" ? parsed.intent : null,
      parentsJson: JSON.stringify((parsed.previous ? [parsed.previous] : []) as string[]),
      verified: result.verified,
      verifyError: result.error ?? null,
      payloadJson: eventJson,
      protocol: meta.protocol,
    });
  }

  return { events, walkErrors };
}
