# Pipeline graph editor in Settings

**Status** Ready for planning

Maintainers can build and review an ordered Hubnot pipeline from the repository's Settings tab. The editor has **Graph**, **JSON**, and **Review changes** tabs. Agents can inspect and change the same draft through MCP using structured data.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Open an existing committed pipeline or start a new draft in Graph. Show one node per native step and connect nodes in execution order. Support adding, duplicating, reordering, configuring, and removing nodes. Provide keyboard-accessible controls for each action and a readable ordered step view. |
| FR-002 | Let users configure each node's name, executable, arguments, working directory, and timeout using native `hn.pipeline/0` fields. Each argument is a separate value. Preserve order, empty strings, spaces, and literal characters. Show errors on the relevant node or field where possible. |
| FR-003 | Offer a blank Command node and load repo-defined templates from tracked repository content at the draft's pinned base revision. A template has a stable identifier, label, configurable input fields and defaults, and a mapping to one native step. Show its source revision. Report malformed, missing, or unavailable templates without blocking ordinary step editing. |
| FR-004 | Expanding a template copies the resolved fields into a node. Users can edit the resulting step. A template change or removal leaves existing instances intact. Template expansion uses declarative value substitution and validates the resolved step. Browsing, expanding, and validating templates perform no command execution, network access, or repository writes. |
| FR-005 | Graph and JSON operate on one draft. The JSON tab allows exact text editing, pasting, and copying. Valid JSON edits update the graph. Invalid or unsupported JSON remains available with diagnostics, and the graph identifies its last valid state as stale. Graph edits and review are disabled while unresolved JSON would be overwritten or omitted. Users can explicitly restore the last valid draft. |
| FR-006 | Opening a graph or switching tabs preserves the original JSON bytes. An explicit graph edit may update serialization, with all resulting changes visible in Review changes. If a definition cannot be represented faithfully in Graph, show the reason and retain its original JSON for manual resolution. Generated definitions use the existing native schema. Editor layout and template provenance stay outside the pipeline file. |
| FR-007 | Review changes shows the exact diff between the pinned committed file and the candidate bytes, including formatting-only changes and a new file's full addition. Show the path, base branch and revision, and signing identity when available. Make the exact before and after text available even when the visual diff is abbreviated. Revalidate changes and require explicit confirmation before opening a proposal through the existing Settings flow. |
| FR-008 | Edits to the draft or changes to the base or signer invalidate the affected review before a new submission. Retain the draft after a refusal. For an interrupted submission, retain the confirmed bytes and operation ID needed to recover the same signed proposal. Reuse Hubnot's existing authorization, recovery and proposal link behavior. |
| FR-009 | Browser and MCP share the same template inventory, source revisions, editable node and edge data, draft JSON, validation diagnostics, exact diff, and proposal submission and recovery outcomes. MCP clients can create, edit, reorder, duplicate, or remove steps and expand templates using structured inputs. The structured graph identifies execution order and maps diagnostics to steps or fields. Operations use the same visibility and authorization rules and expose the same links. |

## First release boundaries

A graph is an ordered sequence of Hubnot steps. Branching, joins, conditions, parallel execution, and changes to the Hubnot execution model are outside this release. Repository templates are versioned through Git. A visual editor for the template catalog, provider imports, and a shared template marketplace are outside this release. Existing Settings validation and proposal operations remain available to current callers.

## Acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-01 | Open an existing pipeline, add a node, duplicate another, change its executable and arguments, reorder, then remove a node. Repeat the sequence using MCP. | Both surfaces produce the same ordered native steps and diagnostics. Keyboard controls can complete every edit. Execution order matches the graph and JSON. |
| AC-02 | Expand a repo template with defaults and explicit inputs, including arguments containing spaces, empty strings, and literal shell characters. Change the template on the working branch and later at the default branch. | Expansion uses the pinned template revision. Both surfaces return identical resolved steps. Existing nodes retain their values. Invalid templates and missing inputs return controlled diagnostics. Expansion does not execute any step. |
| AC-03 | Open JSON with deliberate formatting, switch tabs, make valid manual edits, then enter malformed or unrepresentable text. | Tab switches preserve exact bytes. Valid edits update the graph. Invalid text survives, the stale graph is labeled, and submission cannot use the last valid content until the user resolves or restores the draft. |
| AC-04 | Compare a newly added pipeline, a step reorder, and a formatting-only change through the browser and MCP. | Both return the same path, base revision, exact before and after bytes, and diff. Review uses the bytes that would be committed. Preview and validation leave the repository and signed history unchanged. |
| AC-05 | Submit a reviewed draft, advance the base or change the signer for a separate attempt, and retry a submission after an interrupted response. | The valid submission links to the exact signed proposal. Stale or refused requests leave the draft recoverable and create no new proposal. Repeating a confirmed operation returns the original proposal without duplicating the signed event. |
| AC-06 | Open an empty repo template catalog, a malformed one, and an older supported Hubnot installation. | Both surfaces distinguish each state and preserve supported editing and preview. Proposal availability reflects the existing native capability. |

## Planning questions

Choose the tracked template format and location, and define limits and diagnostics for the catalog and template inputs. Decide how the editor renders the linear graph and keyboard controls. Define the public structured draft and diff contracts, including revision checks for clients editing an older draft. Full OS qualification remains a release activity.
