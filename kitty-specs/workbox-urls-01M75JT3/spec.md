# Mission Specification — Workbox addresses and deep links

- **Mission branch** `feat/workbox-urls`
- **Created** 2026-11-11
- **Status** Draft for review

Developers and agents can share an address such as `workbox://projects/firewalker/` without embedding a server hostname or port. A developer can follow the link from a browser, paste it into Workbox, or give it to an MCP client. Each entry point identifies the same resource on its configured Workbox instance.

## User Scenarios & Testing

### Story 1 — Follow a browser link (P1)

1. Given a developer has enabled the local handler and Workbox is running, clicking `workbox://projects/firewalker/` in a supported browser opens Firewalker in the browser after any platform confirmation. The destination uses the Workbox origin configured on that device.
2. Given the configured instance is unavailable, following the link produces actionable feedback about starting or configuring Workbox. If the handler is absent, the developer can paste the same address into an open Workbox session.

#### Browser deep-link acceptance matrix

Run each test on a desktop with the platform's release-candidate handler. Install and enable the handler through the documented user-facing setup. Configure a running Workbox instance with a known Firewalker project and a non-default local port, and set the test browser as the default browser.

| Test | Platform and minimum browser | Action and expected result |
|---|---|---|
| DL-001 | Linux desktop and Firefox | Click the project link from a regular HTTP(S) page, accept any browser or desktop confirmation, and verify that Firewalker opens in Firefox at the configured origin and port. |
| DL-002 | macOS and Safari | Click the project link from a regular HTTP(S) page, accept any browser or system confirmation, and verify that Firewalker opens in Safari at the configured origin and port. |
| DL-003 | Windows and Microsoft Edge | On the upcoming Windows release candidate, click the project link from a regular HTTP(S) page, accept any browser or system confirmation, and verify that Firewalker opens in Edge at the configured origin and port. |

For each row, click `workbox://projects/firewalker/` and compare the resulting project with the in-app **Open address** result. Also cancel the handoff if the browser prompts and verify that Workbox does not open a destination from the cancelled action. Record the OS version, browser version, and handler build used.

### Story 2 — Open a pasted address in Workbox (P1)

1. Given an open Workbox session, pasting `workbox://home` into **Open address** and submitting it opens the Dashboard without an OS handler.
2. Given an address for a known project or numbered issue, submitting either the canonical address or its existing alias opens the same project or issue in the current Workbox instance.
3. Given a malformed address, unavailable destination, or unknown project or issue, the developer sees the relevant error and can correct the input.

### Story 3 — Read the same resource from MCP (P1)

1. Given a known Firewalker project, reading `workbox://projects/firewalker/` through MCP returns its structured project overview.
2. Given an integration with saved project, issue, memory, and pipeline URLs, all four legacy forms continue to read the corresponding resources with their existing response schemas.
3. Given a client discovering resources, it can discover their canonical addresses through MCP. Legacy addresses remain accepted on direct reads.

## Address contract

| Canonical address | Browser destination | MCP resource |
|---|---|---|
| `workbox://home` | Dashboard | Workbox overview |
| `workbox://projects/` | Explore project directory, once available | Project directory |
| `workbox://projects/<slug>/` | Project entry page | Project overview |
| `workbox://projects/<slug>/task/WP-<number>` | Issue detail | Numbered issue and comments |
| `workbox://projects/<slug>/memory` | Project Memory | Existing project memory payload |
| `workbox://projects/<slug>/pipelines` | Project CI | Existing pipeline definitions and trust payload |
| `workbox://trending` | Reserved for Trending | Reserved for Trending |

- Existing `workbox://project/<slug>` and its `/task/WP-<number>`, `/memory`, and `/pipelines` suffixes are aliases for the corresponding plural addresses.
- Accept either spelling with or without one terminal slash. Emit canonical addresses as shown. Match project slugs using Workbox’s existing identifiers and issue numbers within their project. Trim surrounding whitespace in the paste field.
- The browser and MCP resolve against the project catalog on their selected Workbox instance. An address has no embedded instance, account, or credentials.
- Before Explore or Trending exists, an address for its browser view returns a clear unavailable message. The project directory can still be read from MCP.
- Malformed, unknown, unavailable, and unauthorized destinations use the receiving surface’s normal error presentation. The error must not reveal project data the caller cannot read.

## Requirements

### Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-001 | Support the canonical address table and aliases across Workbox address entry points, using the same target identity for each. | High | Open |
| FR-002 | Provide opt-in local handlers for Linux desktops, macOS, and Windows. When a supported browser hands the handler a valid address, it opens the corresponding web page at the configured Workbox origin. Respect the platform’s confirmation flow. | High | Open |
| FR-003 | Provide an **Open address** control in the browser app that resolves pasted addresses and navigates within the current instance. | High | Open |
| FR-004 | Support canonical address discovery and structured reads through MCP. Preserve direct reads for all existing project, issue, memory, and pipeline URLs, including their data schemas, access checks, and output sanitization. | High | Open |
| FR-005 | Explain malformed input, missing resources, and unavailable views or instances, with a recovery action where applicable. | High | Open |

### Non-functional requirements

| ID | Requirement | Category | Status |
|---|---|---|---|
| NFR-001 | Every supported destination is reachable by submitting its address with only a keyboard in Workbox. A failed submission retains the entered address and exposes a text error. | Accessibility | Open |
| NFR-002 | Across the supported address set, canonical forms and aliases resolve to the same resource. No accepted address can select an origin other than the receiving Workbox instance. | Compatibility and safety | Open |

### Constraints

| ID | Constraint | Category | Status |
|---|---|---|---|
| C-001 | Use addresses for navigation and resource reads only. Opening an address must never execute a shell command from the input, run a workflow, or mutate a project. The link cannot override the configured origin. | Safety | Open |
| C-002 | Reject unsupported components, including credentials, ports, query strings, fragments, traversal segments, and encoded separators. Apply existing authorization and visibility rules to resolved targets. | Safety | Open |
| C-003 | The browser loads the destination over the configured local Workbox HTTP(S) origin. Keep conventional web navigation available without handler registration. | Browser support | Open |
| C-004 | This mission does not build Explore or Trending, change Hubnot, or add new mutation tools. | Scope | Open |

### Key entities

- **Workbox address** — A portable identifier for a Workbox view or readable resource.
- **Local handler** — The opt-in platform integration that receives an address and opens the matching page on a configured instance.
- **Legacy alias** — An existing singular-project address that resolves to the resource identified by its plural equivalent.

## Success Criteria

- The release-candidate handler passes the applicable browser deep-link test on each target platform. Windows acceptance is verified on the upcoming Windows release candidate.
- With no handler installed, the paste flow works for every available browser destination.
- MCP resolves each of the four legacy project resource forms and its canonical equivalent to the same authorized data.
- Unavailable views and malformed or unknown addresses produce an actionable error without opening an unrelated destination or changing project state.

## Assumptions and planning decisions

- The matrix defines one minimum browser per platform. Supported OS versions, additional browsers, and packaging are planning decisions.
- The user-visible address remains `workbox://`. Browser-only registration for arbitrary new schemes uses the `web+` namespace, so the exact Workbox scheme uses the platform handoff. [HTML Standard](https://html.spec.whatwg.org/multipage/system-state.html#custom-handlers)
