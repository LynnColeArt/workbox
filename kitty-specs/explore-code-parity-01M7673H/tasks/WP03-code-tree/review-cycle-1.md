---
affected_files: []
cycle_number: 1
mission_slug: explore-code-parity-01M7673H
reproduction_command:
reviewed_at: '2026-11-11T21:29:52Z'
reviewer_agent: reviewer-renata
wp_id: WP03
---

## Required fix
File details and directory rows disagree after a conflict-resolution merge creates unique file content. Use the directory row's merge-aware last-change policy for file details at the same pin. Reserve rename-follow history for introduction. Add a fixture reproducing the conflict resolution and comparing the exact last-change commit in both views.
