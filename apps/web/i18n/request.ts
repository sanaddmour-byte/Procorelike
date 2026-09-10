import { DEFAULT_LOCALE, isLocale } from "@siteops/shared";
import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";

// next-intl v4 API: the resolved locale arrives as a promise
// (`requestLocale`), not a synchronous `locale` field.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : DEFAULT_LOCALE;

  const messages = (await import(`../messages/${locale}.json`)).default as AbstractIntlMessages;

  return { locale, messages };
});
