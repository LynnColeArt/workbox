# Mission Specification — Proposal detail and next actions

- **Mission branch** `feat/proposal-detail`
- **Created** 2026-11-11
- **Status** Draft for review

A developer opens a proposal to understand the exact change, see the evidence that applies to it, and decide what to do next. Workbox follows the familiar GitHub pull request layout with **Conversation**, **Checks**, and **Files changed** inside the proposal detail. Hubnot's signed candidate, lineage, and project policy determine what the page can say about readiness.

```text
Proposals list → proposal lineage → selected candidate (base and head)
                                    ├─ Conversation and signed history
                                    ├─ Checks and policy requirements
                                    └─ Files changed for this base and head
```

## User Scenarios & Testing

### Story 1 — Know which revision I am looking at (P1)

1. Given a proposal with an original candidate and one revision, opening the proposal from the list selects the unambiguous current candidate. The header identifies that candidate, its exact base and head commits, and its relationship to the original. The developer can copy full IDs and open an older candidate by a stable link.
2. Given two live sibling candidates, opening the lineage makes the choice explicit. Workbox does not select a winner by timestamp. An exact-candidate link continues opening that candidate after a successor appears.
3. Given a review, run, decision, or merge recorded against one revision, Conversation shows the signed evidence with its candidate attribution. Revising or merging a proposal does not create a separate proposal-list row for the evidence event. The selected revision's checks and actions never inherit evidence from its predecessor or siblings.

### Story 2 — Understand what is blocking the selected revision (P1)

1. Given a project policy requiring two approvals, two passes for one named check, and an acceptance, a candidate with one qualified approval and one qualified pass shows those counts and deficits in **Checks**. The view shows the check name from the candidate's policy and explains which stages are still waiting.
2. Given an observed review or run that does not qualify, or a later change request, the view distinguishes the observed evidence from evidence counted by Hubnot. A change request is shown as a blocker only when Hubnot's evaluated policy makes it one.
3. Given an accepted candidate that later loses readiness, a superseded candidate that still has sufficient evidence, or a closed or conflicting lineage, the page displays the applicable state and explains the effect on the next step. Evidence readiness, maintainer acceptance, and a recorded merge are distinct.
4. Given missing code, unavailable policy or evidence, an unsupported Hubnot binary, or a failed evaluation, show the reason when known and make the affected status unknown. Any visible signed history remains attributable. The page does not infer readiness from the event timeline or current worktree policy.

### Story 3 — See what I can do next (P1)

1. Given a live candidate with missing requirements, show the applicable next steps near the status. For example, identify a missing review or a named check still waiting for a trusted result. Explain the project rule or prerequisite behind each step.
2. Given the existing browser review action is applicable, the developer can approve or request changes on the exact selected candidate. A refusal is shown with a useful reason when available. A successful write refreshes the selected candidate without moving to a sibling or successor.
3. Given a step that requires a trusted runner, maintainer, or terminal action, name the role or prerequisite and provide a handoff or relevant destination. When the current actor or environment cannot be verified, say so. An observed merge precondition does not become a promise that the current actor or checkout can merge.

### Story 4 — Inspect the exact change (P2)

1. Given the selected candidate's base and head commits are available, **Files changed** compares those commits even if a branch has since moved. Switching revisions updates the comparison.
2. Given an exact commit is missing, show that the comparison is unavailable and why when known. Conversation and Checks remain reachable. Never substitute the current branch or worktree for the missing commit.

## Requirements

### Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-001 | Open proposal detail from the existing Proposals tab. Associate list entries with signed lineages and expose stable exact-candidate links. Select an unambiguous current candidate or let the developer choose among candidates. | High | Open |
| FR-002 | Identify the selected candidate, exact base and head, and related revisions. Keep full identifiers accessible and distinguish historical, current, superseded, conflicting, and merged states when Hubnot reports them. | High | Open |
| FR-003 | Provide Conversation, Checks, and Files changed inside the proposal detail. Keep signed conversation, decisions, and lineage evidence attributable to the candidate where they occurred. Compare the exact selected base and head in Files changed. | High | Open |
| FR-004 | Show authoritative candidate-specific readiness and blockers, including applicable code requirements, qualified reviews, configured pipeline results, protected-check requirements, and maintainer decisions. Show counts or deficits where available and explain unavailable evidence. | High | Open |
| FR-005 | Show the next actions or handoffs supported by the observed candidate state and known actor capability. Reuse the existing browser review action for the exact selected candidate and show its result. | High | Open |
| FR-006 | Keep the detail usable when status or comparison is unavailable. Explain which information is missing and avoid positive readiness or action claims based on incomplete evidence. | High | Open |

### Non-functional requirements

| ID | Requirement | Category | Status |
|---|---|---|---|
| NFR-001 | The developer can select a revision, navigate all three views, and read blocker and action labels using a keyboard. Status remains legible without color. | Accessibility | Open |
| NFR-002 | Reopening a saved exact-candidate link after a revision or branch move still selects the same candidate, or reports that the candidate is unavailable. | Reliability | Open |

### Constraints

| ID | Constraint | Category | Status |
|---|---|---|---|
| C-001 | Hubnot's exact-candidate evaluation is authoritative for readiness, policy, and lineage. Workbox must preserve selected-history visibility and must not infer permissions from a read result. | Trust | Open |
| C-002 | Keep the existing project navigation and theme. The three proposal views are within proposal detail. | Product | Open |
| C-003 | New run, revision, accept, merge, and publish mutations are outside this slice. Show where to take those steps when applicable. MCP changes, Hubnot changes, and release-level OS qualification are outside this mission. | Scope | Open |

### Key entities

- **Lineage** — Related signed candidates connected by revision history. A lineage can have multiple live candidates.
- **Candidate** — A signed proposal event with immutable base and head commits. Readiness and action context refer to this exact revision.
- **Evidence** — Reviews, check results, and decisions attributed to their candidate. Hubnot determines which evidence qualifies.
- **Next step** — An available browser action, a handoff to a role, or guidance that identifies a missing prerequisite.

## Success Criteria

- A developer can reach the detail from the Proposals tab and identify the exact candidate, base, and head without inspecting raw events or using the terminal.
- In a fixture with a predecessor and two siblings, evidence for one candidate never contributes to the counts or actions for another.
- In a fixture with custom check names and thresholds, all displayed counts, deficits, and readiness match Hubnot's exact-candidate evaluation.
- If the candidate is superseded, accepted but no longer ready, or missing dependencies, the page provides an appropriate explanation and no misleading merge-ready claim.
- A successful browser review targets the candidate displayed at submission, and a saved exact-candidate link remains stable after revisions.

## Assumptions and planning boundaries

- Conversation is the default detail view. The summary and next step remain visible while switching proposal views.
- This slice makes existing review available in context and provides guidance for CLI-only actions. Adding more browser or MCP mutations is separate work.
- Hubnot exposes exact candidate status, the distinction between observed and qualified evidence, and selected-history preconditions. The plan will determine how Workbox presents that contract with older binaries or incomplete local data. [Hubnot consumer CLI contract](https://github.com/LynnColeArt/hubnot/blob/main/docs/consumer-cli-v1.md#exact-proposal-reads)
