"use client";

import { apiJson } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";

/** A square photo thumbnail that only asks for its signed URL once it scrolls near the viewport (plan E8). */
export function LazyThumb({ attachmentId, alt, className = "" }: { attachmentId: string; alt: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    apiJson<{ downloadUrl: string }>(`/attachments/${attachmentId}/download`)
      .then((r) => setUrl(r.downloadUrl))
      .catch(() => setFailed(true));
  }, [near, attachmentId]);

  return (
    <div ref={ref} className={`aspect-square overflow-hidden rounded-xl border-3 border-ink bg-cream ${className}`}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
          <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
        </a>
      ) : (
        <div className={`flex h-full w-full items-center justify-center text-xs text-navy-500 ${failed ? "" : "animate-pulse bg-navy-100/70"}`} aria-hidden="true">
          {failed ? "⚠" : ""}
        </div>
      )}
    </div>
  );
}
