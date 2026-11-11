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
}

export interface ChainRead {
  events: EventRow[];
  /** Chain-walk-level failures (unreadable blobs, bad subjects). */
  walkErrors: string[];
}

/**
 * Read one actor chain newest-first, stop at the first commit already
 * indexed, then process oldest→newest so projections apply in order.
 * Verification happens here, at read time, for every event — cached or not.
 */
export function readChain(repoPath: string, ref: string, knownCommit: (sha: string) => boolean): ChainRead {
  const commits = chainCommits(repoPath, ref); // newest first
  const todo: string[] = [];
  for (const sha of commits) {
    if (knownCommit(sha)) break; // append-only chain: everything older is indexed
    todo.push(sha);
  }
  todo.reverse(); // oldest first

  const events: EventRow[] = [];
  const walkErrors: string[] = [];

  for (const sha of todo) {
    const eventJson = catFile(repoPath, sha, "event.json");
    const signature = catFile(repoPath, sha, "signature");
    const subject = commitSubject(repoPath, sha);
    if (eventJson === null || signature === null) {
      walkErrors.push(`commit ${sha}: event.json or signature unreadable`);
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
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(eventJson) as Record<string, unknown>;
    } catch {
      walkErrors.push(`commit ${sha}: event.json unparseable`);
      continue;
    }

    events.push({
      eventId: result.eventId,
      commitSha: sha,
      actor: String(parsed.actor ?? ""),
      kind: String(parsed.kind ?? "unknown"),
      sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      intent: typeof parsed.intent === "string" ? parsed.intent : null,
      parentsJson: JSON.stringify(parsed.parents ?? []),
      verified: result.verified,
      verifyError: result.error ?? null,
      payloadJson: eventJson,
    });
  }

  return { events, walkErrors };
}
