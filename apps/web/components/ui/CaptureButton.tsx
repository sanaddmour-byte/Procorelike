"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

interface Props {
  photos: File[];
  onChange: (photos: File[]) => void;
  /** Photo is the first action of the flow: the button is large and opens the camera directly. */
  primary?: boolean;
  max?: number;
}

/**
 * Camera-first capture (plan B8): `capture="environment"` opens the rear camera directly on phones; on desktop it
 * falls back to the file chooser. Thumbnails are local object URLs, so nothing waits on the network and a photo taken
 * offline is kept with the form draft.
 */
export function CaptureButton({ photos, onChange, primary, max = 8 }: Props) {
  const t = useTranslations("Field");
  const urls = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-gap-hit">
        {photos.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative">
            <img src={urls[i]} alt="" className="h-20 w-20 rounded-lg border-3 border-ink object-cover" />
            <button
              type="button"
              aria-label={t("removePhoto")}
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute -end-2 -top-2 flex h-8 min-h-0 w-8 min-w-0 items-center justify-center rounded-full border-2 border-ink bg-white text-sm font-bold"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label
            className={`hit-task inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border-3 border-ink px-4 font-bold brutal-interactive ${
              primary ? "min-h-[72px] flex-1 bg-gradient-to-b from-orange-400 to-orange-500 text-ink" : "bg-white text-navy-900"
            }`}
          >
            <span aria-hidden="true">📷</span>
            {photos.length === 0 ? t("takePhoto") : t("addPhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onChange([...photos, f]);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
