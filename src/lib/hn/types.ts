/**
 * The port: everything Workbox does to hubnot storage is expressed here.
 * Two adapters are expected to ever exist behind this interface:
 *   - cli:    spawns the real `hn` binary, consuming its {ok,data,error}
 *             envelope contract (docs/consumer-cli-v1.md).
 *   - sidecar (future): a Go service importing hubnot's own packages.
 * Neither the UI nor the indexer may bypass this port.
 */
export interface Envelope<T = unknown> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; recovery?: string; operation?: string };
  snapshot?: string;
}

export interface RepoRef {
  /** Registry id of the workbox project. */
  projectId: string;
  /** Absolute path to the git repository on disk. */
  repoPath: string;
}
