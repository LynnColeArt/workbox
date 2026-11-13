# MCP proposal status contract

Call `workbox_proposal_status` with a Workbox project ID as `project` and the full signed event ID as `candidate`. Omit `mode` for exact lookup or use `"lineage"` to follow visible revisions.

A successful lookup returns `data.kind` of `candidate` or `choose`. A candidate result identifies the requested and selected revisions and links to the exact Workbox Checks page. A choice result lists visible revisions and their exact links.

The candidate result includes the lifecycle label, the recorded merge state and verified merge event IDs when available, policy requirements, maintainer acceptance, and exact automatic check attempts. Use `decision.deficit` for outstanding maintainer acceptance and `blockers` for missing evidence requirements. A null evaluation or blocker list means the evaluation is unavailable. An empty blocker list means there are no missing evidence requirements in the available evaluation.

Error codes are `invalid_input`, `not_found` for an unavailable project ID, and `unavailable` for an inaccessible or unavailable revision.
