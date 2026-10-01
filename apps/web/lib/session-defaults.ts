/**
 * "Same as last" defaults (plan D7): location, trade and assignee from the previous record this device created in
 * this project. Kept in localStorage (not sessionStorage) so a superintendent who reopens the app on the same floor
 * still starts there; it is per project and per device, and cleared by logout.
 */
export interface CreateDefaults {
  locationId?: string;
  tradeId?: string;
  assigneeUserId?: string;
  assigneeCompanyId?: string;
}

const key = (projectId: string): string => `siteops.createDefaults.${projectId}`;

export function loadCreateDefaults(projectId: string): CreateDefaults {
  try {
    const raw = window.localStorage.getItem(key(projectId));
    return raw ? (JSON.parse(raw) as CreateDefaults) : {};
  } catch {
    return {};
  }
}

export function saveCreateDefaults(projectId: string, defaults: CreateDefaults): void {
  try {
    window.localStorage.setItem(key(projectId), JSON.stringify(defaults));
  } catch {
    // convenience only
  }
}
