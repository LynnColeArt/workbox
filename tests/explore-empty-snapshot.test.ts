import assert from "node:assert/strict";
import test from "node:test";
import { readResource } from "../mcp/resources";
import { parseWorkboxAddress } from "../src/lib/workbox/address";
import { openDb } from "../src/lib/workbox/db";
import type { ExploreRead } from "../src/lib/workbox/explore";

test("an explicitly empty Explore snapshot is preserved and yields a stale read", async t => {
  const db = openDb(":memory:");
  t.after(() => db.close());
  const read = async (uri: string) => JSON.parse((await readResource(db, uri)).text) as ExploreRead;
  const base = "workbox://explore";
  const uri = `${base}?snapshot=`;
  const parsed = parseWorkboxAddress(uri);
  assert.ok(parsed.ok && parsed.target.kind === "explore");
  assert.equal(parsed.target.query.snapshot, "");
  assert.equal(parsed.target.uri, uri);
  assert.equal(parsed.target.href, "/explore?snapshot=");

  assert.equal((await read(base)).stale, false);
  const stale = await read(parsed.target.uri);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.projects, []);
  assert.ok(stale.snapshot);
  assert.equal(stale.refreshHref, `/explore?${new URLSearchParams({ snapshot: stale.snapshot })}`);
});
