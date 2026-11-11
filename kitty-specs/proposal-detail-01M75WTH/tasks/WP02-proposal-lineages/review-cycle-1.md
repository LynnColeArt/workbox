---
affected_files: []
cycle_number: 1
mission_slug: proposal-detail-01M75WTH
reproduction_command:
reviewed_at: '2026-11-11T20:04:07Z'
reviewer_agent: reviewer-renata
wp_id: WP02
---

# WP02 review — discovery omits visible candidates

The list only probes the three most recent candidate hints per lineage. A visible original followed by three hidden revisions disappears from the list, and the offset skips the group. Give the indexed root a visibility-checked probe and provide bounded continuation for older candidate hints when the root is hidden. Add tests for both cases and keep hidden IDs out of rendered output and continuation URLs.
