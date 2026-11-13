import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native trigger validation returns exact canonical bytes and rejects invalid drafts", {
  skip: !process.env.WORKBOX_AUTOMATIC_CHECKS_HN,
}, () => {
  const hn = process.env.WORKBOX_AUTOMATIC_CHECKS_HN!;
  function native(args: string[], input?: string) {
    const result = spawnSync(hn, args, { encoding: "utf8", input });
    assert.equal(result.error, undefined);
    const wire = JSON.parse(result.stdout);
    assert.equal(result.status === 0, wire.ok);
    return wire;
  }
  assert.equal(native(["capabilities", "--json"]).data.capabilities["native.proposal-checks-config"].version, 1);
  const pipelines = { test: { version: "hn.pipeline/0", steps: [{ name: "Go test", command: "go", args: ["test", "./..."] }] } };
  const configuration = { version: "hn.proposal-checks/1", pipelines: { test: ["proposal.revise", "proposal.open"] } };
  const validate = (draft: string) => native(["proposal-checks", "validate", "-", "--json"], draft);
  const valid = validate(JSON.stringify({ configuration, pipelines }));
  assert.equal(valid.data.canonical, JSON.stringify({
    ...configuration, pipelines: { test: ["proposal.open", "proposal.revise"] },
  }, null, 2) + "\n");
  assert.equal(validate(JSON.stringify({ configuration, pipelines: {} })).error.code, "invalid_input");
  for (const events of [["proposal.open", "proposal.open"], ["issue.open"], null]) {
    assert.equal(validate(JSON.stringify({
      configuration: { ...configuration, pipelines: { test: events } }, pipelines,
    })).error.code, "invalid_input");
  }
  const duplicate = JSON.stringify({ configuration, pipelines }).replace(
    '"test":["proposal.revise","proposal.open"]', '"test":[],"test":["proposal.open"]',
  );
  assert.equal(validate(duplicate).error.code, "invalid_input");
});
