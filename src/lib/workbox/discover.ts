import { readdirSync, statSync, lstatSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { actorRefs } from "../hn/gitread";

/**
 * Discovery: scan a projects root for git repositories carrying hubnot
 * signed facts (refs/hn/actors/*). A plain repo with no hn refs is not a
 * hubnot project and is skipped. Exclusions come from workbox.registry.json.
 */
export interface Discovered {
  id: string;
  name: string;
  repoPath: string;
  actorCount: number;
}

export interface RegistryOverrides {
  /** Directory names to skip entirely (e.g. node_modules-style noise). */
  skipDirs: string[];
  /** Human-facing names/descriptions by directory id. */
  meta: Record<string, { name?: string; description?: string }>;
}

export function defaultOverrides(): RegistryOverrides {
  return {
    skipDirs: [
      "node_modules", "logs", "var", "scripts", "src", "New Folder", // noise in ~/projects
      "old-busy-35", "spec-kitty-end-to-end-testing",
    ],
    meta: {
      hubnot: { name: "Hubnot", description: "Distributes collaboration as signed facts through Git." },
      "workbox-demo": { name: "Workbox Demo", description: "Demo project exercising the Workbox surface." },
    },
  };
}

export function projectsRoot(): string {
  // WORKBOX_PROJECTS_ROOT is the deployment contract (absolute path).
  // Default is deployment-relative: <cwd>/projects, dev-set via env.
  return resolve(/*turbopackIgnore: true*/ process.env.WORKBOX_PROJECTS_ROOT ?? join(process.cwd(), "projects"));
}

export function projectCreationStatePath(repoPath: string): string {
  return join(/*turbopackIgnore: true*/ dirname(repoPath), ".workbox-project-creation", `${basename(repoPath)}.json`);
}

function hasPendingCreation(repoPath: string): boolean {
  try {
    lstatSync(/*turbopackIgnore: true*/ projectCreationStatePath(repoPath));
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export function isHubnotRepo(repoPath: string): boolean {
  if (hasPendingCreation(repoPath)) return false;
  if (!existsSync(join(repoPath, ".git"))) return false;
  // Cheap check first: private identity state qualifies (never read contents).
  try {
    const ids = readdirSync(/*turbopackIgnore: true*/ join(repoPath, ".git", "hn", "identities"));
    if (ids.filter((x) => !x.startsWith(".")).length > 0) return true;
  } catch {
    // fall through to refs check
  }
  return actorRefs(repoPath).size > 0;
}

export function discoverProjects(overrides: RegistryOverrides = defaultOverrides()): Discovered[] {
  const root = projectsRoot();
  let entries: string[];
  try {
    entries = readdirSync(/*turbopackIgnore: true*/ root);
  } catch {
    return [];
  }
  const found: Discovered[] = [];
  for (const entry of entries) {
    if (overrides.skipDirs.includes(entry) || entry.startsWith(".")) continue;
    const dir = join(/*turbopackIgnore: true*/ root, entry);
    let st;
    try {
      st = statSync(/*turbopackIgnore: true*/ dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    try {
      if (isHubnotRepo(dir)) {
        const refs = actorRefs(dir);
        found.push({
          id: entry,
          name: overrides.meta[entry]?.name ?? entry,
          repoPath: dir,
          actorCount: refs.size,
        });
      }
    } catch {
      // unreadable repo — skip, never block discovery
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}
