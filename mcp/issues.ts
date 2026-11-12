import type { CollaborationResult } from "../src/lib/workbox/collaboration";

export type CollaborationTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => Promise<CollaborationResult<unknown>> | CollaborationResult<unknown>;
};

export const issueTools: CollaborationTool[] = [];
