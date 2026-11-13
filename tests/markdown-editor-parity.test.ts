import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import type { CollaborationResult } from "../src/lib/workbox/collaboration";
import type { IssueList } from "../src/lib/workbox/issues";
import { openDb } from "../src/lib/workbox/db";

const hn = resolve(process.env.WORKBOX_HN_BIN ?? "/tmp/hn");
const skip = process.env.WORKBOX_MARKDOWN_PARITY_TEST !== "1" || !existsSync(hn);
const project = "fixture";
type Written = { eventId: string; issueId: string; number: number; indexed: boolean; replayed: boolean; href: string };

function data<T>(result: CollaborationResult<T>) {
  assert.ok(result.ok, JSON.stringify(result));
  return result.data;
}

test("Visual editor preserves exact drafts; Chrome, MCP and published Markdown agree", { skip, timeout: 90_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "workbox-issue-parity-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, "close");
      child.kill();
      await closed;
    }));
    rmSync(directory, { recursive: true, force: true });
  });
  const repository = join(directory, "repo");
  mkdirSync(repository);
  const dbPath = join(directory, "index.sqlite");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(directory, "empty-git-config"),
    GIT_AUTHOR_NAME: "Issue parity",
    GIT_AUTHOR_EMAIL: "issues@example.invalid",
    GIT_COMMITTER_NAME: "Issue parity",
    GIT_COMMITTER_EMAIL: "issues@example.invalid",
    WORKBOX_DB_PATH: dbPath,
    WORKBOX_HN_BIN: hn,
  };
  function command(cwd: string, bin: string, args: string[], input?: string) {
    return execFileSync(bin, args, { cwd, env, encoding: "utf8", timeout: 10_000, input });
  }
  command(repository, "git", ["init", "-q", "-b", "main"]);
  command(repository, "git", ["commit", "--allow-empty", "-qm", "Start"]);
  command(repository, hn, ["init", "--name", "Issue owner"]);
  {
    using db = openDb(dbPath);
    db.prepare("INSERT INTO projects(id, name, repo_path) VALUES(?, ?, ?)").run(project, "Issue fixture", repository);
  }

  const browser = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "0",
  ], { env });
  children.push(browser);
  const origin = await new Promise<string>((accept, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Workbox did not start. " + output)), 10_000);
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    browser.once("exit", () => { clearTimeout(timer); reject(new Error(output)); });
    browser.stderr.on("data", chunk => { output += chunk; });
    browser.stdout.on("data", chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes("Ready in")) { clearTimeout(timer); accept(url); }
    });
  });

  const agent = spawn(process.execPath, ["--import", "tsx", "mcp/server.ts"], { env });
  children.push(agent);
  const replies = createInterface({ input: agent.stdout })[Symbol.asyncIterator]();
  let id = 0;
  async function mcp<T>(name: string, args: Record<string, unknown>) {
    const request = ++id;
    agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: request, method: "tools/call", params: { name, arguments: args } }) + "\n");
    const line = await replies.next();
    assert.equal(line.done, false);
    const reply = JSON.parse(line.value);
    assert.equal(reply.id, request);
    assert.equal(reply.error, undefined, JSON.stringify(reply));
    return JSON.parse(reply.result.content[0].text) as T;
  }

  async function post<T>(input: Record<string, unknown>, path = `/api/projects/${project}/issues`, headers: Record<string, string> = {}) {
    const response = await fetch(origin + path, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(input), signal: t.signal,
    });
    return { status: response.status, result: await response.json() as T };
  }
  const http = async <T>(input: Record<string, unknown>) => (await post<CollaborationResult<T>>(input)).result;
  const initial = data(await http<IssueList>({ action: "list" }));
  assert.ok(initial.signer.available);
  const { actor } = initial.signer.identity;
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.WORKBOX_PLAYWRIGHT_MODULE ?? "playwright-core");
  const chrome = await chromium.launch({ executablePath: process.env.WORKBOX_CHROME_BIN, headless: true });
  t.after(() => chrome.close());
  const page = await chrome.newPage();
  page.setDefaultTimeout(10_000);
  const refs = () => command(repository, "git", ["for-each-ref", "refs/hn"]);
  const openIssue = async (title: string, body: string, operationId: string) =>
    data(await http<Written>({ action: "create", actor, title, body, operationId, labels: [] }));
  const supported = "  **Keep this**\r\n\r\n* list 🌱\n\n";
  const issue = await openIssue("Exact source", supported, "seed-exact");
  await page.goto(origin + issue.href);
  await page.getByText("Edit issue", { exact: true }).click();
  const composer = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign and save issue" }) });
  const mode = (name: string) => composer.getByRole("button", { name, exact: true });
  const before = refs();
  assert.equal(await mode("Visual").getAttribute("aria-pressed"), "true");
  await composer.locator("[contenteditable=true]").waitFor();
  await mode("Source").focus();
  await page.keyboard.press("Enter");
  assert.equal(await mode("Source").evaluate((el: Element) => document.activeElement === el), true);
  await composer.getByRole("textbox", { name: "Description", exact: true }).waitFor();

  async function preview(form: typeof composer, source: string) {
    const [response] = await Promise.all([
      page.waitForResponse((response: { url(): string; request(): { method(): string } }) =>
        response.url().endsWith("/api/markdown") && response.request().method() === "POST"),
      form.getByRole("button", { name: "Preview", exact: true }).click(),
    ]);
    assert.deepEqual(response.request().postDataJSON(), { source });
    const wire = await response.json() as CollaborationResult<{ source: string; html: string }>;
    assert.deepEqual(wire, await mcp("workbox_preview_markdown", { source }));
    const rendered = form.locator("[aria-label$=' preview'] > div");
    await rendered.waitFor();
    const html = data(wire).html;
    const canonical = await page.evaluate((html: string) => {
      const div = document.createElement("div");
      div.innerHTML = html;
      return div.innerHTML;
    }, html);
    assert.equal(await rendered.innerHTML(), canonical);
    return canonical;
  }

  await preview(composer, supported);
  await mode("Visual").click();
  await composer.locator("[contenteditable=true]").waitFor();
  assert.equal(refs(), before);
  await composer.getByRole("textbox", { name: "Title", exact: true }).fill("Title only");
  await composer.getByRole("textbox", { name: "Labels (one per line)" }).fill("edited");
  const [save] = await Promise.all([
    page.waitForResponse((response: { url(): string; request(): { postDataJSON(): { action?: string } } }) =>
      response.url().endsWith("/issues") && response.request().postDataJSON().action === "revise"),
    composer.getByRole("button", { name: "Sign and save issue" }).click(),
  ]);
  assert.equal(save.request().postDataJSON().body, supported);
  const saved = data<Written>(await save.json());
  const native = (id: string) => JSON.parse(command(repository, hn, ["issue", "show", id, "--json"])).data;
  assert.equal(native(issue.issueId).state.body, supported);

  const rich = [
    "  **Source** 🌱  ", "", "| a | b |", "| --- | --- |", "| x | y |", "",
    "```js", "const n = 1;", "```", "", "<i>literal HTML</i>", "",
    "[unsafe](javascript:alert%281%29)", "", "<Widget value={1} />",
  ].join("\r\n");
  const inert = await openIssue("Source fallback", rich, "seed-rich");
  await page.goto(origin + inert.href);
  await page.getByText("Edit issue", { exact: true }).click();
  await composer.getByText("Visual can’t represent this Markdown.", { exact: false }).waitFor();
  const frozen = refs();
  const rendered = await preview(composer, rich);
  assert.match(rendered, /<table>/);
  assert.match(rendered, /<pre><code/);
  assert.match(rendered, /&lt;Widget/);
  assert.doesNotMatch(rendered, /href="javascript:|<i>literal/);
  const published = page.getByRole("article").filter({ hasText: "literal HTML" }).first();
  assert.equal(await published.locator("div").filter({ has: page.locator("table") }).last().innerHTML(), rendered);
  assert.equal(refs(), frozen);

  await page.goto(origin + issue.href);
  await page.getByText("Edit issue", { exact: true }).click();
  const visual = composer.locator("[contenteditable=true]");
  await visual.waitFor();
  await visual.press("End");
  await visual.press("!");
  await composer.getByRole("button", { name: "Review source" }).waitFor();
  await composer.getByRole("button", { name: "Sign and save issue" }).click();
  await composer.getByRole("button", { name: "Use this Markdown" }).waitFor();
  assert.equal(refs(), frozen);
  await composer.getByRole("button", { name: "Discard visual changes" }).click();
  const field = composer.getByRole("textbox", { name: "Description", exact: true });
  await field.fill("My unsaved draft");
  command(repository, hn, ["issue", "revise", issue.issueId, "--expect", saved.eventId, "--input", "-", "--json"],
    JSON.stringify({ title: "Concurrent change", body: supported, labels: [] }));
  await composer.getByRole("button", { name: "Sign and save issue" }).click();
  await composer.getByRole("button", { name: "Reload current issue" }).click();
  await composer.getByRole("button", { name: "Use current revisions and keep draft" }).waitFor();
  assert.equal(await field.inputValue(), "My unsaved draft");

  const commentForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign and comment" }) });
  const commentVisual = commentForm.locator("[contenteditable=true]");
  await commentVisual.waitFor();
  await commentVisual.fill("Visual comment");
  let first: unknown;
  await page.route("**/api/projects/fixture/issues", async (route: {
    fetch(): Promise<{ ok(): boolean }>; request(): { postDataJSON(): unknown }; abort(): Promise<void>;
  }) => {
    first = route.request().postDataJSON();
    assert.ok((await route.fetch()).ok());
    await route.abort();
  }, { times: 1 });
  await commentForm.getByRole("button", { name: "Sign and comment" }).click();
  const retry = page.getByRole("button", { name: "Retry comment" });
  await retry.waitFor();
  const signedOnce = refs();
  const [replay] = await Promise.all([
    page.waitForResponse((response: { url(): string; request(): { postDataJSON(): { action?: string } } }) =>
      response.url().endsWith("/issues") && response.request().postDataJSON().action === "comment"),
    retry.click(),
  ]);
  assert.deepEqual(replay.request().postDataJSON(), first);
  assert.equal(data<{ replayed: boolean }>(await replay.json()).replayed, true);
  assert.equal(refs(), signedOnce);
  assert.equal(native(issue.issueId).comment_count, 1);

  async function verifyDefaultVisual(form: typeof composer) {
    assert.equal(await form.getByRole("button", { name: "Visual", exact: true }).getAttribute("aria-pressed"), "true");
    await form.locator("[contenteditable=true]").waitFor();
  }
  await page.goto(origin + "/p/fixture/issues");
  await page.getByText("New issue", { exact: true }).click();
  await verifyDefaultVisual(page.locator("form").filter({ has: page.getByRole("button", { name: "Sign and open issue" }) }));
  await page.goto(origin + "/p/fixture/proposals");
  await page.getByRole("button", { name: "New proposal" }).click();
  await verifyDefaultVisual(page.locator("form").filter({ has: page.getByRole("button", { name: "Sign & open proposal" }) }));
  await page.goto(origin + "/p/fixture/discussions");
  const start = page.locator("form").filter({ has: page.getByRole("button", { name: "Start discussion" }) });
  await verifyDefaultVisual(start);
  await start.getByRole("textbox", { name: "Title", exact: true }).fill("Visual discussion");
  await start.getByRole("textbox", { name: "Category", exact: true }).fill("general");
  const discussionBody = start.locator("[contenteditable=true]");
  await discussionBody.focus();
  await page.keyboard.press("Control+b");
  await page.keyboard.type("Rich discussion");
  await start.getByRole("button", { name: "Source", exact: true }).click();
  assert.equal(await start.getByRole("textbox", { name: "Body", exact: true }).inputValue(), "**Rich discussion**");
  await start.getByRole("button", { name: "Start discussion" }).click();
  await page.getByRole("heading", { name: "Visual discussion", exact: true }).waitFor();
  const reply = page.locator("form").filter({ has: page.getByRole("button", { name: "Post reply" }) });
  await verifyDefaultVisual(reply);

});
