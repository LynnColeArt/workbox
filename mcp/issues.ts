import { collaborationError, type CollaborationResult } from "../src/lib/workbox/collaboration";
import { runIssueOperation } from "../src/lib/workbox/issues";
import { previewMarkdown } from "../src/lib/workbox/markdown";

export type CollaborationTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => Promise<CollaborationResult<unknown>> | CollaborationResult<unknown>;
};

const string = { type: "string" };
const limit = { type: "integer", minimum: 1, maximum: 200 };
const issueId = { oneOf: [{ type: "string", pattern: "^sha256:[a-f0-9]{64}$" }, { type: "integer", minimum: 1 }] };
const status = { enum: ["open", "closed"] };
const properties = (fields: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties: fields, required, additionalProperties: false,
});

function execute(action: string | undefined, args: Record<string, unknown>) {
  const { project, ...input } = args;
  return typeof project === "string"
    ? runIssueOperation(project, action ? { ...input, action } : input)
    : collaborationError("invalid_input", "Project ID is required.");
}

export const issueTools: CollaborationTool[] = [
  {
    name: "workbox_list_issues",
    description: "Browse verified issues, with status, title or number, and label filters. Continue with nextCursor and the same filters.",
    inputSchema: properties({ project: string, q: string, label: string, status: { enum: ["all", ...status.enum] }, limit, cursor: string }, ["project"]),
    call: args => execute("list", args),
  },
  {
    name: "workbox_issue_detail",
    description: "Read an issue by full event ID or local number, with Markdown, signing identity, action availability, competing heads and paginated history.",
    inputSchema: properties({ project: string, issueId, limit, cursor: string, revisionCursor: string }, ["project", "issueId"]),
    call: args => execute("detail", args),
  },
  {
    name: "workbox_issue_action",
    description: "Create, comment, revise, close, reopen or resolve an issue as the observed signing identity. Preserve the operation ID and exact request on retry. Revise, close and reopen require one expected head. Resolve requires all competing heads and one reviewed basis.",
    inputSchema: properties({
      project: string, action: { enum: ["create", "comment", "revise", "close", "reopen", "resolve"] },
      actor: string, operationId: string, issueId, title: string, body: string,
      labels: { type: "array", items: string }, expected: { type: "array", items: string }, basis: string, status,
    }, ["project", "action", "actor", "operationId"]),
    call: args => execute(undefined, args),
  },
  {
    name: "workbox_preview_markdown",
    description: "Render Markdown exactly as Workbox's browser preview does, preserving the original source.",
    inputSchema: properties({ source: string }, ["source"]),
    call: previewMarkdown,
  },
];
