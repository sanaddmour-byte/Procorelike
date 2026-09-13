"use client";

import { useEffect, useState } from "react";

/** Window height minus a fixed chrome offset (header/tabs/toolbar), so the virtualized grid fills the remaining viewport instead of using a guessed constant. */
export function useViewportHeight(offset: number): number {
  const [height, setHeight] = useState(() => (typeof window === "undefined" ? 480 : window.innerHeight - offset));

  useEffect(() => {
    function update(): void {
      setHeight(window.innerHeight - offset);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [offset]);

  return height;
}
