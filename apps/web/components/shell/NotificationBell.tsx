"use client";

import { apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NotificationPayload {
  projectId: string;
  entityType: string;
  entityId: string;
  summary: string;
}

interface Notification {
  id: string;
  type: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30_000;

const ENTITY_PATH_BY_TYPE: Record<string, string> = {
  rfi: "rfis",
  submittal: "submittals",
  punch_item: "punch-list",
  change_order: "change-orders",
};

function entityPath(payload: NotificationPayload): string | null {
  const segment = ENTITY_PATH_BY_TYPE[payload.entityType];
  if (!segment) return null;
  return `/projects/${payload.projectId}/${segment}/${payload.entityId}`;
}

/**
 * A bell icon in the header with an unread-count badge, matching UserMenu's
 * dropdown pattern. Polls the unread count rather than opening a
 * websocket -- this app has no push channel, and a 30s lag on a badge is
 * an acceptable tradeoff against that infrastructure.
 */
export function NotificationBell() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function refreshUnreadCount(): void {
    apiJson<{ count: number }>("/notifications/unread-count")
      .then((res) => setUnreadCount(res.count))
      .catch(() => undefined);
  }

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    apiJson<Notification[]>("/notifications")
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(notification: Notification): Promise<void> {
    setOpen(false);
    if (!notification.readAt) {
      try {
        await apiJson(`/notifications/${notification.id}/read`, { method: "POST" });
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Navigation still proceeds even if marking read failed -- the badge
        // will just stay stale until the next poll.
      }
    }
    const path = entityPath(notification.payload);
    if (path) router.push(`/${locale}${path}`);
  }

  async function handleMarkAllRead(): Promise<void> {
    try {
      await apiJson("/notifications/read-all", { method: "POST" });
      setUnreadCount(0);
      setNotifications((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    } catch {
      // Best-effort -- a failed mark-all-read just leaves the badge as is.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("title")}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-maroon-600 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-1 w-80 rounded-lg border-3 border-ink bg-white text-sm shadow-brutal-lg">
          <div className="flex items-center justify-between border-b border-navy-100 px-3 py-2">
            <p className="font-semibold text-navy-900">{t("title")}</p>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void handleMarkAllRead()} className="text-xs font-semibold text-navy-600 hover:underline">
                {t("markAllRead")}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!notifications && <p className="px-3 py-3 text-xs text-navy-600">{t("loading")}</p>}
            {notifications && notifications.length === 0 && <p className="px-3 py-3 text-xs text-navy-600">{t("empty")}</p>}
            {notifications?.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => void handleSelect(n)}
                className={`block w-full border-b border-navy-50 px-3 py-2 text-start last:border-0 hover:bg-orange-50 ${n.readAt ? "text-navy-600" : "font-semibold text-navy-900"}`}
              >
                <span className="block truncate">{n.payload.summary}</span>
                <span className="block text-[11px] font-normal text-navy-400">{new Date(n.createdAt).toLocaleString(locale)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
