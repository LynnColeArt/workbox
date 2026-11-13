# Direct MCP proposal status

Agents need the same proposal status a person sees in Workbox. A direct, read-only lookup takes a Workbox project ID and a full Hubnot proposal or revision ID and returns the selected revision, its merge state, and its blockers.

## User scenarios

- An agent reviewing a failed required check looks up the affected revision and sees the same blocker as the Workbox Checks view. After a new revision passes, the old revision still shows its own evidence and the new one shows the cleared requirement.
- An agent opens a link to a merged revision and can confirm its merge state and signed merge evidence directly. A successful check or maintainer acceptance does not by itself imply a merge.
- An agent following a proposal lineage can ask for its current revision. If Workbox presents a revision choice, the tool returns the same visible choices and links so the agent can select one.

## Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Provide a discoverable, read-only MCP proposal status tool. Accept a Workbox project ID, a full signed proposal or revision ID, and an optional exact or lineage mode. Default to exact mode and preserve full identifiers in the response. |
| FR-002 | Use the same revision selection and visibility rules as Workbox proposal detail. Exact mode returns the requested revision, including superseded and merged revisions. Lineage mode follows Workbox selection and returns an explicit choice when Workbox requires one. Include the canonical Workbox link for each visible result. |
| FR-003 | Report the selected revision ID, lineage root, base and head commits, current lifecycle state, and merge status. Include signed merge event IDs when verified and available. Distinguish merged, accepted, rejected, superseded, and conflicting states as Workbox does. |
| FR-004 | Report blockers for the selected revision using the same native policy evaluation and Workbox interpretation. Include the unmet requirement and available evidence, including required pipeline and review deficits and outstanding maintainer acceptance. Distinguish an optional failed check from a required check that blocks progress. |
| FR-005 | Distinguish unavailable or incomplete status from a verified empty blocker list. Report invalid input and inaccessible proposals without revealing restricted revisions or raw repository details. Apply the same visibility rules to lineage choices and evidence. |

## Acceptance criteria

1. Given a proposal with a failing required README check, the exact lookup agrees with Workbox on the candidate, failed requirement, and blocked state. Given its passing revision, both show the pipeline requirement satisfied and any remaining acceptance requirement. Looking up the older revision preserves its own evidence.
2. Given the merged Firewalker Research fixture or an equivalent local fixture, the exact lookup returns the restored revision, its full signed merge event ID, and a link whose Workbox page identifies that revision as merged.
3. Given a lineage with competing visible revisions, lineage mode returns the same choices as Workbox. Given incomplete visibility or native data, it follows Workbox selection and flags the incomplete result rather than silently claiming a definitive current revision.
4. Given a failing optional check, Workbox and MCP agree that the check is informational. Given unavailable native evaluation, neither an empty blocker list nor a successful merge is inferred.
5. Invalid project or candidate inputs and inaccessible candidates yield safe responses. Running the tool leaves repository state untouched.

## Scope

Proposal reads and browser/MCP parity are in scope. Proposal mutation, check reruns, and changes to Hubnot merge policy are outside this mission. The existing activity and automatic-check tools retain their roles.
