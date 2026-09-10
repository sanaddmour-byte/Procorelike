import { DEFAULT_LOCALE } from "@siteops/shared";
import { I18n } from "i18n-js";
import { getLocales } from "expo-localization";

const translations = {
  en: {
    appName: "SiteOps",
    phase1Placeholder: "Mobile field app — offline Daily Log, Punch List, and Photos ship in Phase 2.",
    todoPhase2: "TODO (Phase 2): login, offline sync, field modules.",
  },
  ar: {
    appName: "سايت أوبس",
    phase1Placeholder: "تطبيق الميدان للجوال — سجل الأعمال اليومي وقوائم الملاحظات والصور تُبنى في المرحلة الثانية.",
    todoPhase2: "قيد الإنشاء (المرحلة 2): تسجيل الدخول، المزامنة دون اتصال، وحدات الميدان.",
  },
};

export const i18n = new I18n(translations);
i18n.locale = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
i18n.enableFallback = true;
i18n.defaultLocale = DEFAULT_LOCALE;
