import assert from "node:assert/strict";
import test from "node:test";
import { proposalStatusForProject, proposalStatusTool } from "../mcp/proposal-status";

test("proposal status requires a project, full signed ID, and supported lookup mode", async () => {
  const candidate = "sha256:" + "a".repeat(64);
  assert.match(candidate, new RegExp(proposalStatusTool.inputSchema.properties.candidate.pattern));
  for (const input of [
    null,
    { candidate },
    { project: " ", candidate },
    { project: "repo", candidate: "sha256:aaaa" },
    { project: "repo", candidate, mode: "latest" },
    { project: "repo", candidate, repoPath: "/tmp/elsewhere" },
  ]) {
    const reply = await proposalStatusForProject(input);
    assert.deepEqual(reply, { ok: false, error: {
      code: "invalid_input", message: "Provide a project, full proposal ID, and a valid lookup mode.",
    } });
  }
});
