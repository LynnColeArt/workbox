#!/usr/bin/env bash
# Seed a genuine hubnot demo repo by driving the real `hn` CLI.
# Every fact this creates is a signed event Workbox will later verify.
# Parser law learned live: ALL flags must precede positional free text.
set -euo pipefail

HN=/tmp/hn
DEMO=~/projects/workbox-demo

if [ -d "$DEMO/.git" ]; then
  echo "demo repo already exists at $DEMO — leaving it untouched"
  exit 0
fi

mkdir -p "$DEMO"
cd "$DEMO"
git init -b main >/dev/null
cat > README.md <<'EOF'
# Workbox Demo

A tiny hubnot project seeded by the real `hn` CLI to exercise Workbox.
All collaboration facts here are signed events under `refs/hn/`.
EOF
git add README.md
git -c user.name="Workbox Demo" -c user.email="demo@workbox.local" commit -qm "init demo repo"

export HN
"$HN" init --name "Workbox demo maintainer" >/dev/null
"$HN" identity show --json

"$HN" issue open --json --body "Project signed events into a local SQLite cache. Truth stays in Git; the DB must be rebuildable from scratch at any time." "Design the read model"
"$HN" issue open --json --body "sha256(publicKey) == actor for each event, then Ed25519-verify the detached signature against event.json bytes. A tampered byte must fail closed." "Verify every event end to end"
"$HN" issue open --json --body "Surfaces hn project boards (single_select grouped columns). Positions are canonical decimal strings." "Board view for signed projects"
"$HN" issue open --json --body "The showcase page: render exactly what policy a proposal satisfies and what it is missing, straight from hn proposal status." "Proposal evaluation readout"

FIRST=$("$HN" issue list --limit 1 --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["items"][0]["id"])')
"$HN" issue comment "$FIRST" --json --body "Verified: the read model is rebuildable from Git alone — the DB is a cache, not a record."
"$HN" issue close "$FIRST" --json

echo "=== seeded; actor ref summary ==="
for ref in $(git for-each-ref refs/hn/actors/ --format='%(refname)'); do
  echo "$(git rev-list "$ref" --count) events on $ref"
done
