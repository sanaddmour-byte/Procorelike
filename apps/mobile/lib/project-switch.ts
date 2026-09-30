/**
 * Rebuilds the current path under another project so the user stays on the same kind of screen (plan T9, mobile M4):
 * `/projects/A/punch-list` → `/projects/B/punch-list`. A record screen (`/projects/A/rfis/<rfiId>`) falls back to its
 * list, because that record does not exist in the other project.
 */
export function switchProjectPath(pathname: string, currentProjectId: string, nextProjectId: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "projects" || parts[1] !== currentProjectId) return `/projects/${nextProjectId}`;
  const section = parts[2];
  return section ? `/projects/${nextProjectId}/${section}` : `/projects/${nextProjectId}`;
}
