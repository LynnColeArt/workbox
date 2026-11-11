import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * Event verification per hubnot's identity invariant (docs/identity-v0.md,
 * event.go verifyEvent semantics):
 *   1. full event id = sha256(event.json bytes)
 *   2. sha256(publicKey raw bytes) == actor fingerprint
 *   3. Ed25519 detached signature over event.json bytes verifies
 *   4. chain continuity: sequence n+1, previous == predecessor id
 * Fail closed: any failed check marks the event unverified; nothing
 * is silently counted as good.
 */
export interface RawEvent {
  protocol?: string;
  kind: string;
  actor: string;
  actorName?: string;
  publicKey?: string;
  sequence?: number;
  timestamp?: string;
  previous?: string;
  subject?: string;
  intent?: string;
  [k: string]: unknown;
}

// 32-byte raw Ed25519 keys ride inside this fixed SPKI DER prefix.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function ed25519KeyObject(rawBase64: string) {
  const raw = Buffer.from(rawBase64, "base64");
  if (raw.length !== 32) throw new Error(`public key is ${raw.length} bytes, expected 32`);
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export interface VerifyInput {
  /** Full payload bytes exactly as stored in the commit tree. */
  eventJson: Buffer;
  /** The detached signature blob (raw file bytes as stored). */
  signature: Buffer;
  /** The commit subject, expected to carry the event id. */
  commitSubject: string;
  /** Payload filename; protocol-dependent (event.json, memory.json). */
  payloadFileName?: string;
  /** Field carrying the signer's public key (publicKey for both known protocols). */
  publicKeyField?: string;
}

export interface VerifyResult {
  eventId: string; // "sha256:<64hex>"
  checks: {
    eventIdMatchesSubject: boolean;
    actorMatchesKey: boolean;
    signatureValid: boolean;
  };
  verified: boolean;
  error?: string;
}

export function verifyEvent(input: VerifyInput): VerifyResult {
  const digest = createHash("sha256").update(input.eventJson).digest("hex");
  const eventId = `sha256:${digest}`;
  const subjectId = input.commitSubject.replace(/^.*?sha256:/, "sha256:");
  const publicKeyField = input.publicKeyField ?? "publicKey";

  let parsed: RawEvent;
  try {
    parsed = JSON.parse(input.eventJson.toString("utf8")) as RawEvent;
  } catch (e) {
    return {
      eventId,
      checks: { eventIdMatchesSubject: false, actorMatchesKey: false, signatureValid: false },
      verified: false,
      error: `unparseable event.json: ${(e as Error).message}`,
    };
  }

  const eventIdMatchesSubject = input.commitSubject.includes(digest) || subjectId === eventId;

  let actorMatchesKey = false;
  let signatureValid = false;
  let error: string | undefined;

  if (typeof parsed[publicKeyField] === "string" && typeof parsed.actor === "string") {
    try {
      const raw = Buffer.from(parsed[publicKeyField], "base64");
      const keyHash = createHash("sha256").update(raw).digest("hex");
      actorMatchesKey = keyHash === parsed.actor && parsed.actor.length === 64;
    } catch (e) {
      error = `public key decode failed: ${(e as Error).message}`;
    }
  } else {
    error = "event missing publicKey or actor";
  }

  if (actorMatchesKey) {
    try {
      const key = ed25519KeyObject(parsed[publicKeyField] as string);
      // Signature blob is stored as raw base64 text of the 64-byte sig.
      const sig = Buffer.from(input.signature.toString("utf8").trim(), "base64");
      signatureValid =
        sig.length === 64 && cryptoVerify(null, input.eventJson, key, sig);
    } catch (e) {
      signatureValid = false;
      if (!error) error = `signature check failed: ${(e as Error).message}`;
    }
  }

  const verified = eventIdMatchesSubject && actorMatchesKey && signatureValid;
  return { eventId, checks: { eventIdMatchesSubject, actorMatchesKey, signatureValid }, verified, error };
}
