# Proposal detail interfaces

## Browser

- `GET /p/<project>/proposals` shows visible lineages and the existing creation form. A lineage row links to an explicit lineage-entry mode anchored by a verified visible candidate.
- `GET /p/<project>/proposals/<encoded-full-candidate-id>` pins an exact candidate. Support `view=conversation|checks|files` and a separate explicit lineage-entry mode. A selected file must come from the exact comparison's file list. Validate all parameters and build navigation internally.
- Unknown, hidden, or non-proposal candidate IDs use the same unavailable response. When identity is visible but status is unavailable, render partial detail without readiness or write claims.
- The existing `POST /api/projects/<project>/review` accepts the full selected candidate ID, the approve or request-changes verdict, and the optional note. Preserve the existing client contract. Recheck through the native writer, display a controlled outcome, and refresh the same selected candidate on success.

## Native reads

| Command | Expected authority |
|---|---|
| `hn capabilities --json` | Structured discovery for `native.proposal-read` and `native.event-read`. |
| `hn proposal status FULL_ID --json` | `hn.consumer/1` data for the exact requested proposal candidate, including evaluated policy and selected-history preconditions. |
| `hn event show FULL_ID --json` | `hn.consumer/1` data with matching full ID and `visible_operative_history` scope. Signed content is display data. |
| `hn identity show --json` | Public local actor from the `hn.identity/1` envelope. Unavailable identity leaves actor-specific guidance unknown. |

Run native reads in the server-selected project repository through the existing argument-vector adapter. Match IDs and validate types before producing UI state. Timeout, schema mismatch, and capability failure produce controlled unavailable results. Keep native diagnostics and local paths out of browser error messages unless a bounded, safe recovery explanation is available.
