import { collaborationError } from "../src/lib/workbox/collaboration";
import { runDiscussionOperation } from "../src/lib/workbox/discussions";
import type { CollaborationTool } from "./issues";

const project = { type: "string" };
const event = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const paging = { limit: { type: "integer", minimum: 1, maximum: 200 }, cursor: { type: "string" } };
const signing = { actor: { type: "string" }, operationId: { type: "string" } };
const string = { type: "string" };
const statuses = { enum: ["open", "closed"] };

function tool(name: string, description: string, action: string | null, properties: Record<string, unknown>, required: string[]): CollaborationTool {
  return {
    name, description,
    inputSchema: { type: "object", properties: { project, ...properties }, required: ["project", ...required], additionalProperties: false },
    call: ({ project: id, ...input }) => typeof id === "string"
      ? runDiscussionOperation(id, action ? { ...input, action } : input, true)
      : collaborationError("invalid_input", "Repository ID is required."),
  };
}

export const discussionTools = [
  tool("workbox_list_discussions", "List verified discussions with category and status filters.", "list",
    { ...paging, category: string, status: statuses }, []),
  tool("workbox_discussion_detail", "Read a discussion, its exact accepted answer, and one page of replies.", "detail",
    { ...paging, discussionId: event, replyId: event }, ["discussionId"]),
  tool("workbox_create_discussion", "Sign a new discussion. Reuse the same operation ID on retry.", "create",
    { ...signing, title: string, category: string, body: string }, ["actor", "operationId", "title", "category", "body"]),
  tool("workbox_reply_discussion", "Sign a reply to a thread or to another reply root.", "reply",
    { ...signing, discussionId: event, replyTo: event, body: string }, ["actor", "operationId", "discussionId", "body"]),
];
