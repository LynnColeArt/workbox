---
affected_files: []
cycle_number: 1
mission_slug: explore-code-parity-01M7673H
reproduction_command:
reviewed_at: '2026-11-11T21:29:08Z'
reviewer_agent: reviewer-renata
wp_id: WP02
---

## Required fixes
- Count reachable merge commits. A complete merge-only day currently reports zero due to `--no-merges`.
- Use verified indexed records as candidates for bounded exact native visibility checks when raw projection cannot establish selected-history visibility. Count visible matching events, omit known-denied events, and mark incomplete coverage when checks fail or hit their bound. Keep the Dashboard and Explore eligibility aligned.
- Cover merge-only activity and visible, denied, and unknown governed reads in fixtures.
