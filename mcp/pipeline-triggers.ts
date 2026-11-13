const configuration = {
  type: "object",
  properties: {
    version: { const: "hn.proposal-checks/1" },
    pipelines: { type: "object", additionalProperties: { type: "array", items: { enum: ["proposal.open", "proposal.revise"] } } },
  },
  required: ["version", "pipelines"], additionalProperties: false,
};

const project = { type: "string" };
const draft = { project, configuration, name: { type: "string" }, definition: { type: "string" } };

export const triggerTools = [
  { name: "workbox_proposal_triggers", description: "Read active automatic proposal checks and their source commit.",
    inputSchema: { type: "object", properties: { project }, required: ["project"], additionalProperties: false } },
  { name: "workbox_review_proposal_triggers", description: "Validate a trigger draft and review exact changes, optionally including a pipeline draft.",
    inputSchema: { type: "object", properties: draft, required: ["project", "configuration"], additionalProperties: false } },
  { name: "workbox_submit_proposal_triggers", description: "Explicitly submit the reviewed trigger and pipeline changes through Hubnot governance.",
    inputSchema: { type: "object", properties: { ...draft, actor: { type: "string" }, digest: { type: "string" }, operationId: { type: "string" },
      base: { type: "object", properties: { branch: { type: "string" }, commit: { type: "string" } }, required: ["branch", "commit"], additionalProperties: false },
      confirmed: { const: true } }, required: ["project", "configuration", "actor", "digest", "operationId", "base", "confirmed"], additionalProperties: false } },
];
