# Address interfaces

The [address table](../spec.md#address-contract) defines accepted destinations and canonical spellings.

## Browser

| Surface | Contract |
|---|---|
| `GET /open` | Render an accessible **Open address** form. A form submission and a desktop launch both send exactly one `address` query parameter. |
| `GET /open?address=<encoded-workbox-uri>` | Decode the outer query once and parse the inner address. On success, navigate to a server-generated relative path. On error, render the form with the original value and controlled text. Never interpret a submitted value as an HTTP destination. |
| `HEAD /api/address-handler` | Return `204` and `Workbox-Address-Handler: 1` from a running compatible instance. No body, no address argument, and no catalog lookup. An adapter treats a redirect, missing marker, timeout, or unexpected response as unavailable. |

Browser path mapping is Dashboard to `/`, directory to `/explore` when available, project to `/p/<slug>`, issue to `/p/<slug>/issue/<encoded-full-id>`, memory to `/p/<slug>/memories`, and pipelines to `/p/<slug>/ci`. Treat Trending as unavailable. Generated paths use encoded components and exactly one initial slash.

Desktop adapters pass the address as encoded data in the query value. The query on the HTTP handoff URL is distinct from query components on the inner `workbox://` address, which the parser rejects. The OS integration does not pass input to a shell, follow a probe redirect, or accept an origin supplied by the link.

## MCP stdio

- `resources/list` lists available canonical URIs with existing MCP metadata fields and `application/json`. Add home and project directory, use plural project paths, and omit reserved Trending.
- `resources/read` accepts a canonical URI or any of the four existing singular project forms. Return the existing `contents: [{ uri, mimeType, text }]` structure, echo the requested URI, and serialize the sanitized payload into `text`.
- Home uses Workbox instance statistics. Directory uses the existing MCP project-list projection. Legacy project, issue, memory, and pipelines retain their current JSON fields and types. Keep repository paths out of the response.
- Reject malformed, unknown, and unavailable addresses with a controlled JSON-RPC error using the existing resource-read error behavior. Preserve access checks and avoid echoing arbitrary input into errors. A failed read does not perform a mutation.
