"use client";

import { applyPrefs } from "@/lib/prefs";
import { useEffect } from "react";

/** Applies stored UI preferences (glove mode) to <html> as soon as the client mounts. */
export function PrefsApplier() {
  useEffect(() => {
    applyPrefs();
    const onStorage = (): void => applyPrefs();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
