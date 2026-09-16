"use client";

import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Photo {
  id: string;
  attachmentId: string;
  takenAt: string | null;
  tags: string[] | null;
}

interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
}

interface AttachmentRecord {
  id: string;
}

export default function PhotosPage() {
  const t = useTranslations("Photos");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function load(): void {
    apiJson<Photo[]>(`/photos?projectId=${params.id}`)
      .then(setPhotos)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id, tc]);

  async function handleFileSelected(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      const presign = await apiJson<PresignResponse>("/attachments/presign", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          ownerType: "photo",
          ownerId: params.id,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        }),
      });

      const uploadRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("upload_failed");

      const attachment = await apiJson<AttachmentRecord>("/attachments/confirm", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          ownerType: "photo",
          ownerId: params.id,
          storageKey: presign.storageKey,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        }),
      });

      await apiJson("/photos", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, attachmentId: attachment.id, tags: [] }),
      });

      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.code : "unknown_error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <label className="cursor-pointer rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
            {uploading ? t("uploading") : t("uploadButton")}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
            />
          </label>
        </div>
        {error && <p className="text-maroon-700">{error}</p>}
        {!photos && !error && <p>{tc("loading")}</p>}
        {photos && photos.length === 0 && <p>{t("empty")}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos?.map((photo) => (
            <div key={photo.id} className="flex aspect-square items-center justify-center rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm bg-orange-50 p-2 text-center text-xs text-navy-600">
              {photo.attachmentId.slice(0, 8)}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
