import { z } from "zod";

/**
 * Canonical types for hubnot signed events, as observed in the wild.
 * Two payload generations are known (2026-09 flat, 2026-11 nested);
 * parsers must accept both. Unknown kinds are preserved, never dropped.
 */

export const HnEventKind = z.enum([
  "issue.open",
  "issue.revise",
  "issue.comment",
  "project.open",
  "project.revise",
  "project.item.add",
  "project.item.revise",
  "proposal.open",
  "proposal.revise",
  "proposal.review",
  "proposal.decide",
  "memory.record",
  "workflow.run",
]);
export type HnEventKind = z.infer<typeof HnEventKind>;

export const HnIssueState = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  status: z.enum(["open", "closed"]).catch("open"),
  labels: z.array(z.string()).catch([]),
  assignees: z.array(z.string()).catch([]),
});
export type HnIssueState = z.infer<typeof HnIssueState>;

export const HnEvent = z.object({
  protocol: z.literal("hn/0"),
  kind: HnEventKind,
  actor: z.string().regex(/^[0-9a-f]{64}$/),
  actorName: z.string().optional(),
  publicKey: z.string(), // raw base64
  sequence: z.number().int().nonnegative(),
  timestamp: z.string(), // RFC3339
  previous: z.string().optional(), // prior event id on the actor chain
  subject: z.string().optional(), // resource id the event bears on
  parents: z.array(z.string()).catch([]),
  intent: z.string().optional(),
}).passthrough();
export type HnEvent = z.infer<typeof HnEvent>;

/**
 * Workbox never invents event kinds. When hubnot grows a new one, it flows
 * through as a preserved unknown and this map fails loudly in review.
 */
export const KIND_LABELS: Record<HnEventKind | (string & {}), string> = {
  "issue.open": "opened an issue",
  "issue.revise": "updated an issue",
  "issue.comment": "commented",
  "project.open": "opened a project",
  "project.revise": "updated a project",
  "project.item.add": "added a work item",
  "project.item.revise": "updated a work item",
  "proposal.open": "opened a proposal",
  "proposal.revise": "revised a proposal",
  "proposal.review": "reviewed a proposal",
  "proposal.decide": "decided a proposal",
  "memory.record": "recorded memory",
  "workflow.run": "ran a workflow",
};

export const WorkboxProjectOverview = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  repoPath: z.string(),
  actorCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  verifiedCount: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  totalIssues: z.number().int().nonnegative(),
  lastEventAt: z.string().nullable(),
});
export type WorkboxProjectOverview = z.infer<typeof WorkboxProjectOverview>;

export const FeedEntry = z.object({
  eventId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  kind: z.string(),
  actorName: z.string(),
  summary: z.string(),
  timestamp: z.string().nullable(),
  verified: z.boolean(),
});
export type FeedEntry = z.infer<typeof FeedEntry>;

// Keep the schema export tree honest for future API consumers.
export const FEED_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "WorkboxFeed",
  type: "array",
  items: {
    type: "object",
    required: ["eventId", "projectId", "projectName", "kind", "actorName", "summary", "verified"],
    properties: {
      eventId: { type: "string" },
      projectId: { type: "string" },
      projectName: { type: "string" },
      kind: { type: "string" },
      actorName: { type: "string" },
      summary: { type: "string" },
      timestamp: { type: ["string", "null"] },
      verified: { type: "boolean" },
    },
  },
};

function stringLiteral() {
  return { type: "string" };
}
