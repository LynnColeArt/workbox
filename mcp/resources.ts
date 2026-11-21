import type { DatabaseSync } from "node:sqlite";
import { listWorkboxResources, readWorkboxResource } from "../src/lib/workbox/address-read";

export type McpResource = {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
};

export function listResources(db: DatabaseSync): McpResource[] {
  return listWorkboxResources(db).map(({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  }));
}

export async function readResource(
  db: DatabaseSync,
  uri: string,
): Promise<{ uri: string; mimeType: string; text: string }> {
  const result = await readWorkboxResource(db, uri);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return { uri, mimeType: "application/json", text: JSON.stringify(result.data, null, 2) };
}
