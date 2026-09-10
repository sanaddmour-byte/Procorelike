import { DEFAULT_LOCALE, LOCALES } from "@siteops/shared";
import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
