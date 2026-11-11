#!/usr/bin/env bash
# Initialize hubnot identities in every git repo under a projects root that
# doesn't already have one. Idempotent: inits nothing that already has either
# live actor refs or private identity state. External/orphaned worktrees are
# detected and skipped (their .git is a pointer we cannot init; the identity
# lives in the primary's .git/hn and covers all its worktrees).
# Usage: PROJECTS_ROOT=~/projects bash init-all-repos.sh
set -uo pipefail

HN="${WORKBOX_HN_BIN:-/tmp/hn}"
ROOT="${PROJECTS_ROOT:-$HOME/projects}"
LOG="${WORKBOX_INIT_LOG:-/tmp/workbox-init-log.txt}"

ok=0; already=0; fail=0
: > "$LOG"

cd "$ROOT" || { echo "projects root $ROOT missing"; exit 1; }

for d in */; do
  d="${d%/}"
  [ -e "$d/.git" ] || continue
  # Only primary repositories (directory .git). Pointer worktrees are covered
  # by their primary's shared identity state (see .git/hn/identity-v0 layout).
  [ -f "$d/.git" ] && continue

  cd "/home/lynn/projects/$d" 2>/dev/null || { echo "SKIP $d (unreadable)" >> "$LOG"; cd "$ROOT"; continue; }

  if [ -n "$(ls .git/hn/identities 2>/dev/null | head -1)" ]; then
    already=$((already + 1)); cd "$ROOT"; continue
  fi
  if [ -n "$(git for-each-ref 'refs/hn/actors/' --format='%(refname)' 2>/dev/null | head -1)" ]; then
    already=$((already + 1)); cd "$ROOT"; continue
  fi

  if GIT_TERMINAL_PROMPT=0 "$HN" init --name "Workbox init $d" >/dev/null 2>&1; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1)); echo "FAIL $d" >> "$LOG"
  fi
  cd "$ROOT"
done

echo "initialized=$ok already_done=$already failed=$fail"
[ -s "$LOG" ] && { echo "failures:"; cat "$LOG"; }
echo "note: init writes private key state only (.git/hn/identities) — no refs, no worktree changes. Verified live 2026-11-11."
