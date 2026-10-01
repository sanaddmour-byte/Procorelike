/** The last few records the user opened, per project -- shown on My Work so "the thing I was just looking at" is one tap away (plan C4). Device-local. */
export interface Recent {
  kind: "punch" | "rfi" | "drawing";
  id: string;
  label: string;
  href: string;
}

const key = (projectId: string): string => `siteops.recents:${projectId}`;
const MAX = 6;

export function pushRecent(projectId: string, r: Recent): void {
  try {
    const list = getRecents(projectId).filter((x) => !(x.kind === r.kind && x.id === r.id));
    window.localStorage.setItem(key(projectId), JSON.stringify([r, ...list].slice(0, MAX)));
  } catch {
    // convenience only
  }
}

export function getRecents(projectId: string): Recent[] {
  try {
    return JSON.parse(window.localStorage.getItem(key(projectId)) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}
