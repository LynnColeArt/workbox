# Visual Markdown editing with MDXEditor

- **Branch** `codex/mdxeditor-upgrade`
- **Status** Draft

Workbox contributors can edit formatted Markdown directly in issue descriptions and comments, discussion posts and replies, and the existing proposal description composer. These forms share the same editor and support the same Markdown source that agents read and write through MCP.

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Open the shared editor in **Visual** by default. Support direct editing of headings, emphasis, links, lists, quotes, tables, and fenced code. Provide labeled, keyboard-accessible controls and preserve focus when switching modes. |
| FR-002 | Keep **Source** for raw Markdown editing and **Preview** for the published rendering. Mode changes, editor initialization, and preview requests preserve the current draft byte for byte until the user edits it. |
| FR-003 | Preserve the exact source of existing content when opened or submitted without a body edit, including during unrelated title or label changes. Source edits become the authoritative draft. A deliberate visual edit may serialize Markdown differently. Show the resulting source before signing if the edit changes Markdown beyond the visible edit. |
| FR-004 | If the editor cannot represent a draft safely, open **Source** with a short explanation and retain the exact draft. Keep Source and Preview available for editing and inspecting such content. Never silently drop unsupported syntax or overwrite the last good draft on a conversion error. |
| FR-005 | Keep plain Markdown as the signed and transported content. Browser Preview, published content, and the existing MCP preview operation use the same safe rendering rules. Raw HTML is inert, unsafe links stay blocked, and contributor content cannot execute MDX expressions or components. |
| FR-006 | Preserve the draft across validation errors, conflicts, and uncertain submissions. Keep the exact reviewed source and operation ID together for retry. Existing browser and MCP content continues to round-trip through the shared editor. |

## Acceptance scenarios

1. Open each composer and verify Visual is selected for supported content. Use the toolbar and keyboard to create formatted text and switch to Source to inspect the generated Markdown.
2. Open existing posts containing mixed line endings, Unicode, trailing whitespace, fenced code, and no final newline. Cycle through Visual, Source, and Preview repeatedly. Check the source bytes before and after, then change only the title or labels and verify the saved body is byte-identical.
3. Edit source, switch through all modes, and verify the exact new source survives. Make a deliberate visual edit and verify Source, Preview, the submitted Markdown, and the MCP read all describe the resulting draft.
4. Open a fixture with syntax the visual editor cannot represent. Verify that Source retains the original draft, Preview still works, and the user can recover from the visual editor error without losing content.
5. Send identical source to browser Preview and `workbox_preview_markdown`. Compare the renderer output and the published content, including tables, code, Unicode, unsafe links, and raw HTML. Confirm that mode switches do not cause repository writes.
6. Exercise a failed submission and a stale revision in the browser. Confirm that the draft survives and a retry after an uncertain response uses the original signed request. Run focused browser and MCP verification during implementation and reserve full OS testing for release qualification.

## Planning notes

Verify how MDXEditor reports initialization and actual user edits, which Markdown constructs can round-trip through Visual, and how to detect changes that require source review. Use those findings to define the Source fallback and review experience. This mission updates Markdown composition in the existing forms.
