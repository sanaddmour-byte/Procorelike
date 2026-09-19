"use client";

import { useEffect, useState } from "react";
import { apiJson } from "./api-client";

/**
 * The project's default currency for financial records that don't carry
 * their own `currency` column (direct costs, change orders, payment
 * applications). Defaults to "USD" until the project loads so a page can
 * render immediately without waiting on this fetch.
 */
export function useProjectCurrency(projectId: string): string {
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    apiJson<{ defaultCurrency: string }>(`/projects/${projectId}`)
      .then((project) => setCurrency(project.defaultCurrency))
      .catch(() => undefined);
  }, [projectId]);

  return currency;
}
