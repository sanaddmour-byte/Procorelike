import { ApiClientError } from "./api-client";

type T = (key: string) => string;

/**
 * Turns anything a request can throw into a sentence a person on a site can act on (plan B6): never a raw code.
 * `t` is `useTranslations("Errors")`. A network failure (no response at all) is reported as offline, because that is
 * what it means in the field.
 */
export function errorMessage(err: unknown, t: T): string {
  if (err instanceof ApiClientError) {
    if (err.status === 401) return t("sessionExpired");
    if (err.status === 403) return t("forbidden");
    if (err.status === 404) return t("notFound");
    if (err.status === 409) return t("conflict");
    if (err.status >= 500) return t("server");
    return t("invalid");
  }
  if (err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false)) return t("offline");
  return t("generic");
}
