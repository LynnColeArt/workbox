# Data model — Workbox addresses and deep links

| Value | Fields and invariants |
|---|---|
| Parsed address | A discriminated target `home`, `projectDirectory`, `project`, `issue`, `memory`, `pipelines`, or `trending`. Project targets retain the exact indexed slug. An issue includes the project slug and the displayed positive issue number. |
| Canonical URI | Generated from the parsed target using the spec table. A legacy spelling is an input alias. Terminal slash tolerance does not affect identity. |
| Resolved browser target | A relative Workbox path generated from known route patterns and verified catalog records. For issues, look up the full signed issue ID scoped by project and number, then encode it as a single route segment. |
| Resolved MCP resource | A canonical target, the requested URI to echo in the resource envelope, and a structured JSON projection. Apply output sanitization at the MCP boundary. |
| Handler settings | One per-user HTTP(S) loopback origin with its configured port. No credentials, path, query, or fragment. Installation and explicit reconfiguration own settings changes. |
| Address error | A controlled category for malformed address, missing or inaccessible resource, unavailable view, or unavailable local instance. Error details cannot reveal protected project data or other origins. |

The raw grammar validates structural delimiters before normalization. Reject control characters, dot segments, backslashes, percent-encoded separators, and unsupported URL components. Preserve legacy slug case and supported characters. Validate numbers before lookup so an imprecise JavaScript number cannot target a different issue.

Parsing and opening write no project data. The existing project and issue records are the source of identity. There is no new database table, migration, resource ownership model, or change to Hubnot events.
