#!/usr/bin/env bash
# Workbox MCP self-test.
#
# Drives the stdio server over JSON-RPC: initialize, tools/list, and real
# calls (including a signed write). Invariants are enforced, never assumed:
#   1. every case gets a response (a silent server is a failure);
#   2. every response parses as JSON-RPC and answers the right id;
#   3. NO response contains a 64-hex id — the ergonomics law is grepped,
#      and any leak fails the run.
set -uo pipefail
cd "$(dirname "$0")/.."

OUT=/tmp/workbox-mcp-selftest.out
ERR=/tmp/workbox-mcp-selftest.err
: > "$OUT"

run_case() {
  local req="$1" expect_id="$2" label="$3"
  local out
  out=$(echo "$req" | npx tsx mcp/server.ts 2>"$ERR")
  if [ -z "$out" ]; then
    echo "· $label: FAIL (server produced no response)"
    echo "  stderr: $(head -c 300 "$ERR" 2>/dev/null)"
    exit 1
  fi
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    echo "$line" >> "$OUT"
    if echo "$line" | python3 -c "
import json, sys, re
m = json.loads(sys.stdin.read())
assert m.get('id') == $expect_id, f'id mismatch: {m.get(\"id\")}'
text = json.dumps(m)
leaks = re.findall(r'(?:sha256:)?[0-9a-f]{64}', text)
assert not leaks, f'CRYPTO LEAK: {leaks[:2]}'
" 2>/dev/null; then
      echo "· $label: pass"
    else
      echo "· $label: FAIL"
      echo "$line" | head -c 400
      exit 1
    fi
  done <<< "$out"
  rm -f "$ERR"
}

echo "== initialize =="
run_case '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' 1 "initialize"

echo "== tools/list =="
run_case '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' 2 "tools/list"

echo "== workbox_projects =="
run_case '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"workbox_projects","arguments":{}}}' 3 "projects"

echo "== workbox_issues (workbox-demo) =="
run_case '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"workbox_issues","arguments":{"project":"workbox-demo"}}}' 4 "issues"

echo "== workbox_issue #1 =="
run_case '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"workbox_issue","arguments":{"project":"workbox-demo","number":1}}}' 5 "issue#1"

echo "== workbox_create_issue (signed write) =="
run_case '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"workbox_create_issue","arguments":{"project":"workbox-demo","title":"Selftest: exercise the MCP write path","body":"Opened by the workbox MCP selftest. If found stale, close it."}}}' 6 "create"

echo "== workbox_memories =="
run_case '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"workbox_memories","arguments":{"project":"workbox-demo"}}}' 7 "memories"

echo "== workbox_activity =="
run_case '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"workbox_activity","arguments":{"limit":5}}}' 8 "activity"

echo
echo "== whole-traffic leak grep (belt and braces) =="
if grep -qE '(sha256:)?[0-9a-f]{64}' "$OUT"; then
  echo "LEAK FOUND:"
  grep -oE '(sha256:)?[0-9a-f]{64}' "$OUT" | head -3
  exit 1
else
  echo "no 64-hex anywhere in responses — sanitizer holds"
fi
[ -s "$OUT" ] || { echo "no traffic captured"; exit 1; }

echo "selftest complete."
