/**
 * Best-effort weather auto-fetch for Daily Log (docs/ROADMAP.md Assumption
 * #5 — Open-Meteo, no API key). Never blocks or fails log creation: on any
 * error this returns null and the caller leaves weatherJson unset, which
 * the UI treats the same as a manual-entry-pending state.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  date: string,
): Promise<Record<string, unknown> | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode");
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return { source: "open-meteo", fetchedAt: new Date().toISOString(), ...data };
  } catch {
    return null;
  }
}
