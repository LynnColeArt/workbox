# Pipeline graph editor implementation plan

**Branch** `feat/pipeline-graph-editor`

**Specification** [Pipeline graph editor in Settings](spec.md)

Extend the current Settings editor and keep `hn.pipeline/0` as the committed format. Put draft edits, template expansion, and exact diff generation in shared Workbox operations. The browser renders the results and the MCP tools expose the same structured data. Reuse `settings-preview.ts` for pipeline format validation, `settings-submit.ts` for review binding and publication, and `settings-operations.ts` for transport dispatch. The feature needs no Hubnot protocol or index schema migration.

## Repository templates

Read `.hn/pipeline-templates.json` from the draft's pinned base commit via the bounded Git object readers in `src/lib/workbox/repo.ts`. Inspect the tree entry before reading it. Accept a regular UTF-8 blob and refuse symlinks and submodules. Keep the Command node available when the catalog is absent, empty, invalid, or unavailable. Include the catalog path, base commit, and Code link when the file is present.

The catalog uses `workbox.pipeline-templates/1`. Its top-level `templates` array contains records with `id`, `label`, optional `description`, `inputs`, and one `step`. Input fields use unique keys and labels, and declare `string` or `integer` plus an optional typed `default`. An omitted input uses its default if present. An explicit empty string is a value. A missing input with no default produces a diagnostic if the step references it.

```json
{
  "schema": "workbox.pipeline-templates/1",
  "templates": [
    {
      "id": "integration-test",
      "label": "Integration test",
      "inputs": [
        { "key": "suite", "label": "Suite", "type": "string", "default": "./..." },
        { "key": "timeout", "label": "Timeout", "type": "integer", "default": 120 }
      ],
      "step": {
        "name": "integration",
        "command": "go",
        "args": ["test", { "input": "suite" }],
        "timeoutSeconds": { "input": "timeout" }
      }
    }
  ]
}
```

A reference occupies an entire field value or argument slot. It resolves to one value of the required type. Literal strings have no interpolation, and argument values never split on spaces. Reject unknown keys, duplicate IDs or inputs, unknown references, type mismatches, and oversized catalogs. Limit the catalog to 256 KiB, 64 templates, and 16 inputs per template. Apply native step limits after expansion. Emit path-based diagnostics for invalid entries and return other valid entries when their identities are unambiguous. Catalog-level failures prevent expansion and leave the Command node usable. Expansion is a pure transformation with no evaluation, execution, writes, or network access. Copy the expanded step into the draft so later catalog changes cannot rewrite it.

## Shared draft and editor

| Area | Implementation |
| --- | --- |
| Open | Resolve the configured default branch once and pin the base commit. Read the committed definition and catalog at that commit. Distinguish a new file, known absent path, and unavailable committed bytes. Return the repository ID, pipeline name and path, base, committed text, and current draft. |
| Draft ownership | Keep a client-owned draft snapshot with exact JSON text, ordered nodes, diagnostics, and the last valid projection if available. The browser keeps that snapshot across tabs and MCP returns it for the client to pass back. Use a versioned revision token and expected revision on edits. Reject mismatches, and have the browser discard out-of-order replies. Tokens identify snapshots, with no cross-client lock or server-side draft storage. |
| Graph | Project nodes as ordered native step fields with draft-scoped identifiers and sequential edges. Keep editor identifiers and template origin outside the definition. Provide an ordered list with connectors and an inspector for the selected node. Use explicit add, duplicate, move up, move down, and remove controls with predictable focus after an edit. Handle arguments as separate entries. |
| JSON | Keep the exact source string as the authority. Opening, parsing, copying, and changing tabs never reserialize it. Capture the actual replacement text as the draft when editing. A manual JSON replacement updates the graph when it passes format validation and can be represented faithfully. Detect duplicate keys and any fields or values that cannot round-trip through Graph before exposing graph mutations. Retain invalid text with diagnostics, label the last valid graph as stale, and allow explicit restore when a last valid draft exists. |
| Graph mutations | Apply a typed operation to the expected snapshot revision. Serialize deliberate node edits deterministically. Allow temporary incomplete fields or an empty sequence during graph authoring and report validation diagnostics. A draft that is invalid but still representable remains editable in Graph. A JSON replacement that cannot be projected preserves its original text and disables mutations and review until resolved. |
| Refresh | When the default branch or signer changes, preserve draft text, invalidate the review for new submission, and let the client explicitly refresh the base or review. Re-read templates at the refreshed base for future expansions. Existing expanded nodes retain their values. |

The public snapshot carries the exact text, `{branch, commit}` base, draft revision, projection state, ordered `nodes` and `edges`, and diagnostics with a field path and node ID when applicable. Implement shared operations for opening a draft, reading templates, applying a draft edit, and reviewing the resulting change. Edit variants cover replacing JSON, restoring, adding or expanding a template, patching, duplicating, reordering, and removing a node. Parse and validate client snapshots at the shared boundary. Recover committed bytes and templates from the pinned Git objects, and derive graph fields and diagnostics from the supplied draft text and validated edit inputs.

## Exact review and proposal submission

1. Resolve the draft's pipeline path from the validated pipeline name. Reuse the existing Settings preview to validate the candidate and obtain its signer-bound digest. Require the returned base and committed bytes to match the draft baseline before presenting a confirmable review. Preserve legacy preview behavior for existing callers.
2. Derive a deterministic structured diff from those exact before and after bytes. Each hunk carries its ranges and line operations. Preserve line terminators and final newline state, and distinguish an absent file from an empty one. Show formatting-only changes and new file additions. Bound diff work and rendered hunks, with an explicit incomplete-diff state and exact downloadable or copyable before and after text through both surfaces. Keep proposal confirmation tied to the exact text and the existing digest.
3. Any draft edit clears confirmation for the new revision. Freeze a separate confirmed attempt once the user submits, with candidate bytes, base, signer, digest, and operation ID. A retry sends that exact attempt through the existing Settings submit operation, which checks for the original receipt before rejecting a stale base. An uncertain outcome keeps the attempt recoverable. A recovered result links to the exact signed proposal. Never silently regenerate the operation key after an ambiguous response.

## Browser and MCP interfaces

Extend the existing Settings HTTP dispatcher and add corresponding MCP tools for draft open, catalog read, edit, and diff review. Use one implementation of request decoding, result projection, and error mapping. Existing Settings tools continue to accept their current inputs. Publication continues through the existing explicit submit operation with the same local operator and native signer authorization. Render Graph, JSON, and Review changes as keyboard-operable tabs and keep edits and diagnostics visible across switches. Pass structured data over MCP so an agent can reproduce the graph, draft, and review without a screenshot.

## Implementation order and verification

1. Implement the pinned template catalog and shared draft operations. Cover literal arguments, missing or invalid inputs, strict schema parsing, pinned Git reads with a divergent worktree, and exact JSON preservation across transitions. Verify unchanged Git refs, index, worktree, and signed history.
2. Add the shared diff review to the existing preview flow. Test new files, reordering, formatting-only changes, CRLF, missing final newline, non-ASCII text, and bounded diff fallback. Verify that the proposal's committed blob matches reviewed bytes exactly.
3. Add browser and MCP transport operations and the Settings editor. Verify keyboard editing, stable focus, stale graph behavior, restoration, client revision checks, and retention of a confirmed attempt across recoverable errors.
4. Run production HTTP and MCP parity fixtures through the same edits, template expansion, diagnostics, diff, and native proposal submission. Exercise base and signer changes, interrupted responses, and older Hubnot capability fallback. Run focused tests, applicable Settings regressions, lint, TypeScript, and production build on Linux. Full OS testing remains release qualification.
