#!/usr/bin/env bash
# Round 2 seed: memory claims + CI pipeline for workbox-demo.
# Proposal round skipped when no open proposal exists is handled separately.
set -euo pipefail
HN=/tmp/hn
cd /home/lynn/projects/workbox-demo

git checkout -q main

echo "== memory claims (applies descendants) =="
"$HN" memory record --json --at HEAD --applies descendants --kind observation --topic workbox \
  --content "Workbox demo: read model is a cache; Git under refs/hn/ is the only record."

"$HN" memory handoff --json --at HEAD --applies descendants \
  --completed "Demo seeding complete through round 2" \
  --next-action "Exercise CI page with a real run request" \
  --content "Handoff from demo maintainer to next agent shift."

echo "== CI pipeline committed on main =="
mkdir -p .hn/pipelines
cat > .hn/pipelines/smoke.json <<'EOF'
{
  "schema": "hn.pipeline/0",
  "name": "smoke",
  "steps": [ { "command": "echo", "args": ["smoke ok"] } ]
}
EOF
if ! git diff --quiet .hn/pipelines/smoke.json 2>/dev/null || [ ! -e .hn/pipelines/smoke.json ]; then
  git add .hn/pipelines/smoke.json
fi
if ! git diff --cached --quiet; then
  git -c user.name="Workbox demo maintainer" -c user.email="demo@workbox.local" commit -qm "ci: smoke pipeline"
fi

echo "== state =="
"$HN" memory recall --json --at HEAD | head -c 300
echo
git log --oneline -3
echo "done."
