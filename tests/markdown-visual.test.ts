import assert from "node:assert/strict";
import { test } from "node:test";
import { isVisualLinkAllowed, supportsVisualMarkdown } from "../src/lib/workbox/markdown-visual-safety";

test("Visual accepts normal Markdown and defers unsafe links and unsupported markup to Source", () => {
  assert.equal(supportsVisualMarkdown("# Heading\n\n> Quote with [a link](https://example.org)\n\n```html\n<script>literal</script>\n```"), true);
  for (const source of ["[bad](javascript:alert%281%29)", "[bad](//example.org)", "<Widget />", "![remote](https://example.org/a.png)"]) {
    assert.equal(supportsVisualMarkdown(source), false, source);
  }
  assert.equal(isVisualLinkAllowed("mailto:author@example.org"), true);
  assert.equal(isVisualLinkAllowed("java\tscript:alert(1)"), false);
});
