export function HEAD(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Workbox-Address-Handler": "1",
      "Cache-Control": "no-store",
    },
  });
}
