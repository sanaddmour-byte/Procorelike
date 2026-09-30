"use client";

import { useTranslations, useLocale } from "next-intl";
import { useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
}

/** A textarea with a dictation button (plan B7/D4). Uses the browser's Web Speech API (Arabic `ar-JO`, English `en-US`); the button is absent where unsupported. */
export function VoiceField({ value, onValueChange, className, ...rest }: Props) {
  const t = useTranslations("Field");
  const locale = useLocale();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");

  // Resolved after mount so server and first client render match (no hydration mismatch).
  const [Ctor, setCtor] = useState<unknown>(undefined);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const c = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setCtor(() => c); // wrapped: a constructor passed bare would be invoked as a state updater
  }, []);
  const supported = Boolean(Ctor);

  function toggle(): void {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!Ctor) return;
    const rec = new (Ctor as new () => SpeechRecognitionLike)();
    rec.lang = locale === "ar" ? "ar-JO" : "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value ? `${value} ` : "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i += 1) text += e.results[i]?.[0]?.transcript ?? "";
      onValueChange(baseRef.current + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
    if ("vibrate" in navigator) navigator.vibrate?.(15);
  }

  return (
    <div className="relative">
      <textarea {...rest} value={value} onChange={(e) => onValueChange(e.target.value)} className={`${className ?? ""} ${supported ? "pe-14" : ""}`} dir="auto" />
      {supported && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={listening}
          aria-label={listening ? t("dictateStop") : t("dictate")}
          className={`absolute end-1 top-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink text-lg ${listening ? "bg-maroon-700 text-white" : "bg-white text-navy-900"}`}
        >
          <span aria-hidden="true">{listening ? "■" : "🎤"}</span>
        </button>
      )}
    </div>
  );
}
