import assert from "node:assert/strict";
import { test } from "node:test";

import { POST } from "../src/app/api/markdown/route";
import { formatMarkdown, updateMarkdownSource } from "../src/components/markdown-editor";
import { previewMarkdown, renderMarkdown } from "../src/lib/workbox/markdown";

test("the browser endpoint and shared preview preserve source and render published Markdown the same way", async () => {
  const source = "# Title\r\n\r\n**Bold** and *emphasis* [link](https://example.org)\n\n> Quote\n\n- Item\n\n"
    + "```js\nconst value = 1;\n```\n\n| A | B |\n| --- | --- |\n| é | 🧪 |\n ";
  const request = new Request("http://localhost/api/markdown", { method: "POST", body: JSON.stringify({ source }) });
  const response = await POST(request);
  assert.equal(response.status, 200);
  const expected = previewMarkdown({ source });
  assert.deepEqual(await response.json(), expected);
  assert.equal(expected.ok, true);
  if (!expected.ok) return;
  assert.equal(expected.data.source, source);
  assert.equal(expected.data.html, renderMarkdown(source));
  for (const part of ["<h1>Title</h1>", "<strong>Bold</strong>", "<em>emphasis</em>", "<blockquote>", "<li>Item</li>", "<pre>", "<table>", "🧪"]) {
    assert.ok(expected.data.html.includes(part), part);
  }
});

test("preview escapes raw HTML and rejects unsafe targets while allowing web, mail and relative links", () => {
  const html = renderMarkdown([
    '<img src="x" onerror="alert(1)">',
    '<script>alert(1)</script>',
    "[script](javascript:alert%281%29)",
    "[entity](javascript&#58;alert%281%29)",
    "[control](java&#10;script:alert%281%29)",
    "[local file](file:///etc/example)",
    "[protocol relative](//example.org/relative)",
    "![embedded](data:image/png;base64,AA==)",
    "[web](https://example.org)",
    "[email](mailto:review@example.org)",
    "[relative](../issues#open)",
  ].join("\n\n"));

  assert.doesNotMatch(html, /<img|<script|href="(?:javascript:|file:|\/\/)/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example\.org"/);
  assert.match(html, /href="mailto:review@example\.org"/);
  assert.match(html, /href="\.\.\/issues#open"/);
});

test("invalid HTTP inputs have the same validation outcome as shared preview", async () => {
  const request = new Request("http://localhost/api/markdown", { method: "POST", body: "{broken" });
  const response = await POST(request);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), previewMarkdown(null));
  assert.equal(previewMarkdown({ source: "a".repeat(1_048_577) }).ok, false);
});

test("editor changes retain untouched line endings, whitespace and Unicode source", () => {
  const source = "  a\r\nb🧪\rc\n\n";
  assert.equal(updateMarkdownSource(source, "  a\nb🧪\nc\n\n"), source);
  assert.equal(updateMarkdownSource(source, "  a\nB🧪\nc\n\n"), "  a\r\nB🧪\rc\n\n");
  assert.equal(updateMarkdownSource(source, "  a\nb🧪\nc!\n\n"), "  a\r\nb🧪\rc!\n\n");
});

test("formatting respects selection offsets, surrounding Markdown and existing line endings", () => {
  assert.deepEqual(formatMarkdown("one\r\ntwo\r\n", 4, 7, "bold"), {
    source: "one\r\n**two**\r\n", start: 6, end: 9,
  });
  assert.deepEqual(formatMarkdown("see this", 4, 8, "link"), {
    source: "see [this](https://example.com)", start: 11, end: 30,
  });
  assert.equal(formatMarkdown("one\r\ntwo\r\nthree", 0, 8, "numbered").source, "1. one\r\n2. two\r\nthree");
  assert.equal(formatMarkdown("``` literal", 0, 0, "code").source, "````\n``` literal\n````");
});
