# Repository Settings and workflow proposals

**Status** Ready for planning

Repository maintainers need a single place to understand a project's settings, inspect the workflow definitions in effect, and prepare changes for review. Agents with equivalent access need the same data and actions through MCP.

## Scope and requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Add a **Settings** tab with **Repository details** and **Workflows**. Show the project ID, display name, description, and resolved default branch and revision. Reuse the existing display-name and description curation, and make the same authorized edits available through MCP. Identify local curation as such. The project ID and default branch are read-only in this release. |
| FR-002 | Show the committed pipeline definitions at the repository's resolved default-branch revision, with their names, steps, source paths, revision, and relationships to requirements in the governing policy where available. Resolve the default branch per project. Label the branch and revision so a maintainer can distinguish the committed configuration from a draft or candidate. Offer links to the pinned definition and relevant policy or proposal context when available. |
| FR-003 | Where Hubnot supports signed workflow resources, show their identity, revision or conflicting heads, and native status, including disabled, inert source, missing native definition, runnable, and conflicted states as applicable. Identify these separately from committed pipeline definitions. A runnable signed resource alone does not establish that its definition is committed on the default branch or required by policy. Report unsupported reads, missing history, malformed definitions, and empty results distinctly. Existing projects with committed pipelines remain usable with older supported Hubnot versions. |
| FR-004 | Let a maintainer draft a new or revised native pipeline definition and validate it against the applicable Hubnot format and constraints. Report actionable diagnostics tied to the field, step, or document when possible. Preserve the draft on failure and identify any checks that could not be performed. Validation binds the exact proposed definition and base revision, and makes no Git, Hubnot, repository configuration, or execution changes. |
| FR-005 | Let an authorized maintainer preview the exact pipeline change and explicitly open a Hubnot proposal based on the reviewed revision. Return a link and reference to the resulting proposal and its candidate revision. Proposal creation must use the selected authorized identity and the existing Hubnot proposal and policy model. Keep unrelated workspace changes and the default branch intact. A successful submission leaves the definition pending review. Any merge, activation, or CI execution follows the repository's existing workflow. |
| FR-006 | Recheck the reviewed input, base, capability, and permissions when submitting. If the base advanced or the reviewed definition changed, surface the discrepancy and require a refreshed preview before creating a proposal. Invalid, unchanged, unauthorized, and unsupported requests have distinct outcomes. Retrying the same confirmed submission must avoid duplicate proposals. If creation partly succeeds, report what happened and provide a safe recovery or lookup path. |
| FR-007 | Provide the same authorized repository detail reads and edits, workflow inventory and revision context, draft validation, change preview, proposal submission, and recoverable outcomes through MCP. Return structured diagnostics and the same proposal and source destinations. Use the same visibility and authorization rules on both surfaces. Keep private identity material, raw native diagnostics, and machine-local paths out of both responses. |

## Workflow lifecycle

| Stage | What a maintainer or agent can verify |
| --- | --- |
| Inspect | The resolved default branch, committed pipeline contents, policy requirements, and separately reported signed workflow state. |
| Validate and preview | The draft diagnostics and exact change against a named base revision. |
| Propose | A signed proposal and a link to its exact candidate revision after explicit submission. |
| Review and merge | The existing Proposals experience applies repository governance. Settings reflects the new default-branch definition once it is merged and visible at that revision. |

The first write flow covers adding or editing a committed native pipeline. Authoring or resolving signed workflow resources, editing governance policy, importing or exporting provider definitions, extension management, migrations, default branch changes, and repository deletion are outside this release. CI remains the place to view runs and results. Settings can link to that context.

## Acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-01 | Open Settings and read the same repository over MCP. Change its display name and description through each surface in disposable fixtures. | The same details and provenance are visible, authorized edits appear on both surfaces, and project ID and default branch are read-only. Unauthorized edits are refused consistently. |
| AC-02 | Inspect a project with a non-`main` default branch, a divergent checked-out branch, and a signed workflow whose definition differs from the committed pipeline. | Both surfaces show the same pinned committed definition and policy context, and separately show the signed resource state and revision. Source links resolve to the displayed revision. |
| AC-03 | Inspect projects with no pipelines, an invalid committed definition, unavailable history, a conflicted signed resource, and a Hubnot version without signed workflow reads. | Each surface reports the matching state. A missing native capability does not hide supported committed pipeline reads. A conflict has no inferred winning revision. |
| AC-04 | Validate equivalent valid and invalid drafts through the browser and MCP. | Both report matching validation results, diagnostics, and preview for the same base and definition. Git refs, worktree, signed history, and run requests remain unchanged. |
| AC-05 | Explicitly submit an equivalent valid preview through each surface in separate fixtures. | Each returns a usable proposal link and the exact candidate containing the reviewed change. The default branch and unrelated work remain intact. Existing governance still controls merging and execution. |
| AC-06 | Advance the base after preview, change the draft, deny the selected identity, remove a required capability, and retry a submission after an interrupted response. | Both surfaces report equivalent stale, unauthorized, unavailable, or recoverable outcomes. A stale or refused request creates no proposal. A successful submission can be recovered without creating a duplicate. |

## Planning questions

Verify which supported Hubnot versions expose authoritative validation without writing a resource, and how proposal submission can recover an existing result after interruption. If a required capability is unavailable, the affected action must report that limitation while supported inspection remains available. The existing CI editor writes and commits pipeline files directly. Planning must identify how Settings avoids that write path and how users discover the governed proposal flow.

## References

- Hubnot's `docs/workflows-v1.md` defines signed workflow state and distinguishes materialization, proposal content, and execution.
- Hubnot's `docs/governance-v0.md` and `docs/ci-v0.md` describe proposal policy and committed pipeline definitions.
- Workbox's `src/lib/workbox/ci.ts` and `src/app/api/projects/[id]/pipelines/route.ts` show the existing pipeline read and edit behavior.
