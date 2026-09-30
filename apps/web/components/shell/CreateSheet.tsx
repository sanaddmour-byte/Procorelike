"use client";

import { Modal } from "@/components/ui/Modal";
import { bumpUsage, sortByUsage } from "@/lib/usage";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

const BASE = [
  { id: "snag", key: "snag", path: "punch-list/new", icon: "📷" },
  { id: "daily-log", key: "dailyLog", path: "daily-log/new", icon: "📋" },
  { id: "rfi", key: "rfi", path: "rfis?new=1", icon: "❓" },
  { id: "inspection", key: "inspection", path: "inspections?new=1", icon: "✅" },
];

/** Global create action (plan D5): every record type the user can create, ordered by how often *they* create it, one tap each. */
export function CreateSheet({ projectId, open, onClose }: Props) {
  const t = useTranslations("CreateSheet");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(BASE);
  useEffect(() => {
    if (open) setItems(sortByUsage(BASE));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={t("title")} sheet>
      <ul className="flex flex-col gap-gap-hit">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => {
                bumpUsage(it.id);
                onClose();
                router.push(`/${locale}/projects/${projectId}/${it.path}`);
              }}
              className="hit-task flex w-full items-center gap-3 rounded-lg border-3 border-ink bg-white px-4 text-start text-lg font-bold text-navy-900 brutal-interactive"
            >
              <span aria-hidden="true">{it.icon}</span>
              {t(it.key)}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
