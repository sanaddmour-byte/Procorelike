"use client";

import { Header } from "@/components/Header";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface WebhookSubscription {
  id: string;
  url: string;
  eventTypes: WebhookEventType[];
  active: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  eventType: string;
  statusCode: number | null;
  error: string | null;
  deliveredAt: string;
}

export default function CompanyAdminPage() {
  const t = useTranslations("AdminConsole");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookSubscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyName, setKeyName] = useState("");
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEventTypes, setWebhookEventTypes] = useState<WebhookEventType[]>([]);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);

  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);

  function load(): void {
    apiJson<ApiKey[]>(`/admin/companies/${params.id}/api-keys`)
      .then(setApiKeys)
      .catch(() => setError(tc("errorGeneric")));
    apiJson<WebhookSubscription[]>(`/admin/companies/${params.id}/webhooks`)
      .then(setWebhooks)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id]);

  async function handleCreateKey(): Promise<void> {
    if (!keyName.trim()) return;
    setBusy(true);
    try {
      const created = await apiJson<ApiKey & { plaintext: string }>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ companyId: params.id, name: keyName.trim() }),
      });
      setNewKeyPlaintext(created.plaintext);
      setKeyName("");
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeKey(keyId: string): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/admin/companies/${params.id}/api-keys/${keyId}/revoke`, { method: "POST" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function toggleEventType(eventType: WebhookEventType): void {
    setWebhookEventTypes((current) => (current.includes(eventType) ? current.filter((e) => e !== eventType) : [...current, eventType]));
  }

  async function handleCreateWebhook(): Promise<void> {
    if (!webhookUrl.trim() || webhookEventTypes.length === 0) return;
    setBusy(true);
    try {
      const created = await apiJson<WebhookSubscription & { secret: string }>("/admin/webhooks", {
        method: "POST",
        body: JSON.stringify({ companyId: params.id, url: webhookUrl.trim(), eventTypes: webhookEventTypes }),
      });
      setNewWebhookSecret(created.secret);
      setWebhookUrl("");
      setWebhookEventTypes([]);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWebhook(subscriptionId: string): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/admin/companies/${params.id}/webhooks/${subscriptionId}`, { method: "DELETE" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleViewDeliveries(subscriptionId: string): Promise<void> {
    setDeliveriesFor(subscriptionId);
    try {
      const rows = await apiJson<WebhookDelivery[]>(`/admin/webhooks/${subscriptionId}/deliveries`);
      setDeliveries(rows);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/companies`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="mb-6 text-sm text-navy-600">{t("intro")}</p>
        {error && <p className="text-maroon-700">{error}</p>}

        {/* API Keys */}
        <section className="mb-8 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <h2 className="mb-2 text-lg font-bold text-navy-900">{t("apiKeys")}</h2>
          <p className="mb-3 text-xs text-navy-600">{t("apiKeysIntro")}</p>

          {newKeyPlaintext && (
            <div className="mb-3 rounded-lg border-2 border-maroon-600 bg-white p-3">
              <p className="text-xs font-semibold text-maroon-700">{t("keyShownOnce")}</p>
              <code className="mt-1 block break-all text-sm">{newKeyPlaintext}</code>
              <button onClick={() => setNewKeyPlaintext(null)} className="mt-2 text-xs underline">
                {tc("dismiss")}
              </button>
            </div>
          )}

          <div className="mb-4 flex gap-2">
            <input
              placeholder={t("keyNamePlaceholder")}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="flex-1 rounded-lg border-3 border-ink px-3 py-2 text-sm"
            />
            <button onClick={() => void handleCreateKey()} disabled={busy} className="rounded-lg border-3 border-ink bg-navy-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {t("createKey")}
            </button>
          </div>

          {!apiKeys && <p className="text-sm text-navy-600">{tc("loading")}</p>}
          {apiKeys && apiKeys.length === 0 && <p className="text-sm text-navy-600">{t("noKeys")}</p>}
          <ul className="flex flex-col gap-2">
            {apiKeys?.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-2 rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
                <div>
                  <div className="font-medium">{key.name}</div>
                  <div className="text-xs text-navy-600">
                    {key.keyPrefix}… {key.revokedAt && `· ${t("revoked")}`}
                  </div>
                </div>
                {!key.revokedAt && (
                  <button onClick={() => void handleRevokeKey(key.id)} disabled={busy} className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-maroon-700 disabled:opacity-50">
                    {t("revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Webhooks */}
        <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <h2 className="mb-2 text-lg font-bold text-navy-900">{t("webhooks")}</h2>
          <p className="mb-3 text-xs text-navy-600">{t("webhooksIntro")}</p>

          {newWebhookSecret && (
            <div className="mb-3 rounded-lg border-2 border-maroon-600 bg-white p-3">
              <p className="text-xs font-semibold text-maroon-700">{t("secretShownOnce")}</p>
              <code className="mt-1 block break-all text-sm">{newWebhookSecret}</code>
              <button onClick={() => setNewWebhookSecret(null)} className="mt-2 text-xs underline">
                {tc("dismiss")}
              </button>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2">
            <input
              placeholder={t("webhookUrlPlaceholder")}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENT_TYPES.map((eventType) => (
                <label key={eventType} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={webhookEventTypes.includes(eventType)} onChange={() => toggleEventType(eventType)} />
                  {eventType}
                </label>
              ))}
            </div>
            <button
              onClick={() => void handleCreateWebhook()}
              disabled={busy}
              className="self-start rounded-lg border-3 border-ink bg-navy-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("createWebhook")}
            </button>
          </div>

          {!webhooks && <p className="text-sm text-navy-600">{tc("loading")}</p>}
          {webhooks && webhooks.length === 0 && <p className="text-sm text-navy-600">{t("noWebhooks")}</p>}
          <ul className="flex flex-col gap-2">
            {webhooks?.map((sub) => (
              <li key={sub.id} className="rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all font-medium">{sub.url}</span>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => void handleViewDeliveries(sub.id)} className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-navy-800">
                      {t("viewDeliveries")}
                    </button>
                    <button onClick={() => void handleDeleteWebhook(sub.id)} disabled={busy} className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-maroon-700 disabled:opacity-50">
                      {tc("delete")}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-navy-600">{sub.eventTypes.join(", ")}</p>

                {deliveriesFor === sub.id && (
                  <div className="mt-2 rounded border-2 border-orange-200 bg-cream p-2">
                    {!deliveries && <p className="text-xs text-navy-600">{tc("loading")}</p>}
                    {deliveries && deliveries.length === 0 && <p className="text-xs text-navy-600">{t("noDeliveries")}</p>}
                    <ul className="flex flex-col gap-1">
                      {deliveries?.map((d) => (
                        <li key={d.id} className="text-xs text-navy-700">
                          {d.eventType} — {d.statusCode ?? t("failed")} {d.error && `(${d.error})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
