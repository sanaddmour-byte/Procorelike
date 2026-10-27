"use client";

import Image from "next/image";
import { moduleIllustration } from "@/lib/module-illustrations";
import { usePathname } from "next/navigation";

/** Floating illustration at the top of a module's pages: larger on the list, a small badge-sized one on record pages. Decorative (empty alt). */
export function ModuleHero() {
  const found = moduleIllustration(usePathname());
  if (!found) return null;
  return (
    <div aria-hidden="true" className={`illu-hero relative mx-auto flex justify-center ${found.detail ? "mb-1" : "mb-3"}`}>
      <span className="illu-blob pointer-events-none absolute inset-x-1/4 top-2 h-3/4 rounded-full bg-orange-100/70 blur-2xl" />
      <Image
        src={found.src}
        alt=""
        width={480}
        height={268}
        priority={!found.detail}
        className={`relative w-auto rounded-xl ${found.detail ? "h-14 sm:h-20" : "h-20 sm:h-32"}`}
      />
    </div>
  );
}
