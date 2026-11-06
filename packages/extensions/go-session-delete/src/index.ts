/**
 * DSH-Go permanent Session deletion, host half.
 *
 * The feature is UI-only: the menu entry and its confirmation dialog live in
 * the browser half (exports["./client"], discovered through the package.json
 * dsh.client declaration), and the deletion itself goes through the existing
 * `workspace.deleteSession` Remote owned by the Workspace Controller. The
 * empty `apply` below only gives the bundle a host face so the host
 * cordis.yml can mount it like any other plugin; it registers no tool, no
 * service, and no Remote of its own.
 */

/**
 * Host plugin body: nothing to do, because every surface of this bundle is
 * browser-side.
 */
export function apply(): void {}
