---
affected_files: []
cycle_number: 1
mission_slug: dashboard-cleanup-01M76KZR
reproduction_command:
reviewed_at: '2026-11-12T17:12:53Z'
reviewer_agent: reviewer-renata
wp_id: WP02
---

## Required fix
A sibling symlink to a project still being initialized can appear in discovery. Discovery follows the symlink but checks the creation marker only for its alias. Check the canonical repository path as well and preserve ordinary aliases after creation completes. Add a fixture covering the pending and completed states.
