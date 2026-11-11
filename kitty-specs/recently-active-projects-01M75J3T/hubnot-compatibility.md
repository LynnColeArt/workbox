# Hubnot compatibility spec — Recently active projects

- **Status** Proposed for review
- **Parent mission** [Recently active projects](spec.md)

## Upstream change decision

Recently Active, the seven-day chart, and Explore can ship against the existing Hubnot and Git contracts. No Hubnot CLI, schema, signing, replication, or policy change is required for this release. Workbox owns cross-repository project discovery, ranking, time windows, and presentation.

## Consumer requirements

| ID | Requirement | Existing source |
|---|---|---|
| HN-001 | Workbox can associate a verified signed Hubnot event with its indexed project, identify it uniquely, and read its timestamp. | The Workbox projection retains project ID, full event ID, event kind, timestamp, and verification state. |
| HN-002 | Workbox can rank and count verified events using event timestamps. Refreshing or replaying the same event must not create new activity. | Deduplicate by project and full event ID. The projection's ingestion time has no effect on rank. |
| HN-003 | Workbox can rank and count local Git commits independently of Hubnot activity, using commit IDs and committer timestamps. | Ordinary Git history reachable from local branches. Signed event-storage refs are outside this Git source. |
| HN-004 | Reading activity requires no signer, runner, remote fetch, or write to a project repository. | Workbox reads the existing verified projection and local Git history. |

Use the projection's event rows for the verification filter. The current Dashboard feed is a display summary and has no verification column. The optional Hubnot `hn log --json` output is raw signed history. Under selected contribution authority, raw history can include facts outside the visible operative history, so it is unsuitable as a drop-in substitute for a visibility-filtered activity source.

## Acceptance scenarios

1. With the currently installed Hubnot binary and an existing Workbox index, a Git-only project and a Hubnot-only project can both appear in Recently Active.
2. Importing or indexing the same signed event again does not increase the chart count or change its latest activity timestamp. An unverified event affects neither value.
3. Two local branches reaching the same commit contribute one Git commit. A commit reachable only from a Hubnot event-storage ref contributes zero Git commits.
4. With no network or private signing key, a developer can open the Dashboard and Explore using the local data already available.

## When upstream work would be justified

Revisit this decision if Workbox needs Hubnot itself to provide a bounded feed of **visible operative events** under contribution authority. The existing raw log and exact-ID event reads serve different needs. Any future upstream listing would need to define visibility, stable event IDs, timestamps, and paging against an observed snapshot before Workbox relies on it. That capability is outside this mission.

## Source references

- Hubnot `docs/consumer-cli-v1.md`, full signed log and ordinary event resolution.
- Hubnot `docs/replication-v0.md`, actor and proposal ref namespaces.
- Workbox `src/lib/workbox/db.ts` and `src/lib/workbox/index.ts`, indexed event fields and feed projection.
