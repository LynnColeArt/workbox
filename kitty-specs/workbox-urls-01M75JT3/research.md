# Planning research — Workbox addresses and deep links

| Decision | Rationale | Alternative considered |
|---|---|---|
| Keep the exact `workbox://` scheme and use OS registration. | The HTML custom-handler API requires the `web+` namespace for arbitrary schemes. An OS handler can preserve the requested spelling and land in the configured Workbox instance. | Browser-only PWA registration would require a different scheme. |
| Route desktop handoff through the same Workbox page as pasted addresses. | Project and numbered issue lookup, unavailable views, access checks, and recovery stay in Workbox. All platform adapters can remain small. | Duplicating route parsing and the project catalog in each adapter would create compatibility drift. |
| Use a fixed loopback origin and a small readiness probe. | This supports arbitrary configured ports and detects stopped Workbox or a different service at that port without forwarding the clicked address in the probe. | Launching unconditionally leaves availability feedback to the browser’s generic connection error. |
| Preserve legacy direct MCP reads and advertise one canonical URI per resource. | Existing saved identifiers continue to resolve, and discovery avoids duplicate catalog entries. The current MCP reader already returns structured projections for all four project resource types. | Listing both spellings would duplicate resources for clients that display every entry. |
| Keep the platform registration mechanisms native. | Freedesktop, AppKit, and Windows provide URL activation and default-browser opening. No browser extension or new npm runtime dependency is needed. | A full desktop shell would add packaging and runtime scope beyond link activation. |

## Source checks

- The Workbox project entry route redirects to Code. The issue detail route normalizes encoded full issue IDs, so web address resolution can map the existing projected number to that route.
- Current MCP `resources/read` accepts the singular prefix for project, task, memory, and pipelines. Its tool responses use `sanitize`, while its resource branches currently serialize directly.
- The installed Next.js 16 documentation describes dynamic server pages and supports a dedicated HEAD route. Use the repository’s existing request-time conventions and keep redirects outside broad exception handlers.
- Validate platform support against the actual release artifacts. The Windows packaging model is a release integration choice. A packaged handler can declare the protocol in the manifest, and an unpackaged handler can use the supported activation registration mechanism.

[HTML custom handlers](https://html.spec.whatwg.org/multipage/system-state.html#custom-handlers) · [Freedesktop Desktop Entry Specification](https://xdg.pages.freedesktop.org/xdg-specs/desktop-entry/latest-single/) · [Freedesktop URL association](https://portland.freedesktop.org/doc/xdg-settings.html) · [AppKit URL activation](https://developer.apple.com/documentation/appkit/nsapplicationdelegate/application%28_%3Aopen%3A%29) · [AppKit opening URLs](https://developer.apple.com/documentation/appkit/nsworkspace/open%28_%3A%29) · [Windows URI activation](https://learn.microsoft.com/en-us/windows/apps/develop/launch/handle-uri-activation-dotnet)
