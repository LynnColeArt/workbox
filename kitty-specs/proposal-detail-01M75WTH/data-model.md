# Data model — Proposal detail and next actions

| Value | Fields and invariants |
|---|---|
| Candidate identity | Project ID, exact full signed event ID, kind, author, title/body, exact base and head commits. Stable per revision. Verified visible through native status or event read. |
| Lineage | Root, visible predecessor/successor/sibling links, and native closed, superseded, or conflict state where known. Hidden or unavailable references are not rendered as links or used to pick a winner. |
| Candidate evaluation | Exact candidate ID and evaluated policy identity, code match, review deficits, named pipeline deficits, protected checks, disagreement, decisions, and observed preconditions. Available or unknown separately from identity. |
| Evidence entry | Signed event ID, attributed candidate ID, type, actor, timestamp, displayed content, and qualification if present in native evaluation. A run result resolves through its visible run request. |
| Local actor | Inspected public actor or unknown. This supplies context for guidance and does not establish that any write will succeed. |
| Next step | A reason, scope, and kind: existing browser review, guidance to a relevant view, terminal/role handoff, or unknown capability. |
| Exact comparison | Candidate's full base and head commit IDs, changed-file entries and optional patch. Represent unavailable, binary, and truncated data explicitly. |

A proposal candidate, its Git head, and a review event ID are three different identifiers. No join may substitute one for another. A newer timestamp may change display order but never establishes lineage, eligibility, or evidence attribution.
