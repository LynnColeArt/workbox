import assert from "node:assert/strict";
import { test } from "node:test";
import { requiresSourceReview } from "../src/lib/workbox/markdown-draft";

test("visual edits require source review when the initial serialization was lossy or unknown", () => {
  const source = "  **body**\r\n\nlast";
  assert.equal(requiresSourceReview(source, "**body**\n\nlast"), true);
  assert.equal(requiresSourceReview(source, undefined), true);
  assert.equal(requiresSourceReview(source, source), false);
  assert.equal(requiresSourceReview("", undefined), false);
});
