export const PROJECT_ROLES = [
  "owner_admin",
  "project_manager",
  "project_engineer",
  "superintendent",
  "foreman",
  "qa_qc",
  "safety_officer",
  "subcontractor",
  "consultant",
  "client_viewer",
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}
