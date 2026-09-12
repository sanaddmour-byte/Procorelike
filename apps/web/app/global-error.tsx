"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself (app/[locale]/layout.tsx)
 * -- the one place next-intl's provider can't be relied on, since the
 * layout that would supply it is what failed. Must render its own
 * <html>/<body>; Next.js swaps the entire document for this on trigger.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 420, margin: "10vh auto", textAlign: "center", padding: "0 16px", fontFamily: "sans-serif" }}>
          <h1>Something broke on our end</h1>
          <p>This page ran into an unexpected error. Your work in other tabs is unaffected.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "8px 16px", marginTop: 12 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
