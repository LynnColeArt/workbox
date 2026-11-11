# Implementation Plan — Workbox addresses and deep links

- **Branch** `feat/workbox-urls`
- **Date** 2026-11-11
- **Spec** [Workbox addresses and deep links](spec.md)

## Summary

Use one Workbox address parser for the web app and MCP. The desktop handlers deliver the address to the browser on an explicitly configured local Workbox origin. The server determines whether the destination exists and may be read. Opening a link is read-only.

```text
Browser link → OS handler → default browser → Workbox /open ─┐
Pasted address → Workbox /open ────────────────────────────┼→ Parse address → Resolve target
MCP resources/read ────────────────────────────────────────┘
```

Web resolution returns an internal route. MCP resolution selects an existing read projection or a new overview/directory projection. The canonical address table remains the one in the [spec](spec.md#address-contract).

## Technical Context

**Language/Version**: TypeScript 5 on Node 26 (26.8.1 in the planning checkout). Swift/AppKit for the macOS bundle. Native Windows desktop helper built with the Windows release toolchain.

**Primary Dependencies**: Existing Next.js 16.4.6 App Router, React, `node:sqlite`, and the stdio MCP server. Linux desktop URL association and open services, macOS Launch Services, and Windows protocol activation. Zero new npm packages.

**Storage**: Existing Workbox index and per-user handler settings for the local origin. No SQLite migration or Hubnot protocol changes.

**Testing**: Node tests for parsing and fixture-backed resolution, web acceptance, stdio MCP regression tests, packaged Linux/Firefox, macOS/Safari, and Windows/Edge acceptance. Run `npx tsc --noEmit` and `npm run build` before implementation commits.

**Target Platform**: Linux desktop, macOS, and Windows release candidates for browser handoff. Standard Workbox browser and MCP environments for address resolution.

**Project Type**: Existing Next.js application and stdio server, with three opt-in desktop adapters.

**Performance Goals**: One request-time catalog lookup for project targets and a scoped issue lookup for numbered issues. One short, bounded readiness probe per desktop activation. No Git scans or external fetches in the resolver.

**Constraints**: Current Workbox authorization and data visibility apply. Launching a link cannot change an origin, execute a workflow, or mutate repository state. No hosted service or browser extension is required.

**Scale/Scope**: Home, project directory, project, numbered issue, memory, and pipelines. Trending remains reserved. Explore browser routing becomes available when the separate Explore feature is present.

## Charter Check

Spec Kitty reported no Workbox charter. Applied the Workbox brief and repository instructions. The design stays within the existing UI and read-model boundaries, preserves the Next.js request-time conventions, and does not introduce a dependency-install decision. The Phase 1 review found no change needed to the feature spec.

## Project Structure

| Location | Change |
|---|---|
| `src/lib/workbox/address.ts` (new) | Pure parser, canonical formatter, and typed target vocabulary. Keep it independent of Next.js and SQLite. |
| `src/lib/workbox/address-resolution.ts` (new) | Resolve project and numbered-issue targets through existing read queries. Keep access checks at the corresponding web and MCP boundaries. |
| `src/app/open/page.tsx` and `src/app/layout.tsx` | One server-rendered address page for paste and desktop handoff. Add the **Open address** link in the global layout. |
| `src/app/api/address-handler/route.ts` | Constant, versioned readiness response for desktop adapters. |
| `mcp/server.ts` | Use the shared target vocabulary for discovery and read dispatch. Preserve legacy readers and redact resource output. |
| `scripts/address-handler/` (proposed) | Linux registration and opener, macOS AppKit bundle, Windows native activation and packaging integration. |
| `kitty-specs/workbox-urls-01M75JT3/` | [Research](research.md), [data model](data-model.md), [interfaces](contracts/address-interfaces.md), and [acceptance quickstart](quickstart.md). |

## Implementation Concern Map

| Concern | Work and dependency | Acceptance |
|---|---|---|
| IC-01 — Address rules and lookup | Define canonical formatting and legacy grammar. Reject invalid syntax before a URL library can normalize traversal. Resolve an issue by project and displayed number using the existing index. | FR-001, C-001, C-002. Table-driven canonical, alias, and malformed cases. |
| IC-02 — Browser address page | After IC-01, add `/open` and the global link. A native GET form accepts a single `address` value. Server resolution uses `await connection()` and `instant = false` where request-time access is needed. Redirect successful lookups to a known internal path. On failure, preserve the input and render accessible text. | FR-003, FR-005, NFR-001. Keyboard-only open, matching canonical and alias targets, missing/unavailable states, and safe handling with JavaScript disabled. |
| IC-03 — MCP discovery and reads | After IC-01, adapt `resources/list` and `resources/read` while retaining stdio transport. Reuse overview, issue, memory, and pipeline projections. Advertise canonical addresses and continue direct legacy reads. Preserve response shape and the requested URI on successful reads. | FR-004, NFR-002. Compare parsed payloads for all four alias pairs, exercise catalog discovery, and test redaction and access errors. |
| IC-04 — Desktop handoff | After IC-02, implement the readiness probe and package the three adapters. Probe only the saved local origin with a bounded timeout and no redirects. Encode the original address into the fixed `/open` route and launch the default browser via platform services. | FR-002, FR-005, C-003. Verify non-default port, failed probe, denied browser launch, and cancellation on each OS where prompted. |
| IC-05 — Release qualification | Exercise IC-02 through IC-04 on release-candidate builds. Document opt-in install, reconfiguration, upgrade, disable, and uninstall. Record the full DL-001 through DL-003 test matrix before claiming the respective platform supports the feature. | DL-001 Linux/Firefox, DL-002 macOS/Safari, DL-003 Windows/Edge on the upcoming Windows release candidate. |

## Integration details

- **Linux desktop** — Install a user-scoped `.desktop` handler for `x-scheme-handler/workbox`. Pass one URL argument to a small Node opener using Workbox’s existing runtime. Open the fixed HTTP(S) handoff URL with the desktop opener as an argument. Enable and remove the association explicitly.
- **macOS** — Ship a small Swift/AppKit app bundle declaring `workbox` in `CFBundleURLTypes`. Receive activation through AppKit and open the fixed handoff URL with `NSWorkspace`. Follow the existing release signing and distribution process once the deployment target is selected.
- **Windows** — Ship a native desktop helper with the upcoming Windows distribution. Use the protocol declaration in the release manifest for packaged builds or Microsoft’s supported unpackaged registration path if the release uses an unpackaged installer. Select the registration path at the packaging seam and verify the actual release candidate. Open the fixed HTTP(S) handoff using the system’s default browser.
- **All platforms** — Store the origin as a per-user installation setting. Require HTTP(S) and an explicit loopback host. Support a custom port and normal TLS validation. An activation never changes registration or starts Workbox. When the probe fails, tell the user to start Workbox or check the configured origin.
- **MCP** — The current sanitizer runs on tool results. The resource handlers currently return resource content directly. Apply the existing sanitizer to resource payloads and user-derived discovery labels without changing URI fields. Use controlled error text and test that the project overview still omits its local repository path.

## Risks and rollout

| Risk | Control |
|---|---|
| Address text is treated as a redirect, filename, or command | Reject unsupported raw forms and resolve only typed targets. Use fixed browser route builders and OS launch APIs. The native adapter never interpolates the URI into shell code. |
| Wrong service is listening on a saved port | Require the Workbox readiness response before opening. Probe and browser handoff both use the same configured loopback origin. |
| Existing MCP integrations lose access | Keep direct aliases indefinitely within this mission. Preserve the JSON projection fields and envelope. Add read-only fixture tests instead of running the existing signed-write self-test against a real project. |
| Explore lands independently | Keep the project directory readable through MCP. The web resolver reports an unavailable view until the Explore route is shipped. Never advertise Trending as an available resource in this mission. |
| Platform setup differs or changes across release channels | Test clean install, upgrade, and removal on the supported desktop images. Respect browser/OS prompts. Finish the Windows test against its release candidate. |

Ship address entry and MCP compatibility with the Workbox web build. Enable the desktop integration per installed platform once that platform passes its browser handoff test. No rollout step changes Hubnot or existing repositories.
