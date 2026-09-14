"use client";

import { apiJson } from "@/lib/api-client";
import { uploadAttachment } from "@/lib/upload";
import { useEffect, useState } from "react";

/**
 * A generic "upload + list files" widget over the polymorphic /attachments
 * endpoints (GET list-by-owner, POST presign/confirm via uploadAttachment,
 * GET :id/download) -- e.g. files attached directly to an RFI or
 * Submittal, or photos attached to a Punch Item. `ownerType` values must be
 * registered in apps/api's attachment.service.ts OWNER_TYPE_MODULES map.
 * In `imageMode`, attachments render as a thumbnail gallery instead of a
 * download-link list.
 */

interface AttachmentRow {
  id: string;
  filename: string;
  mime: string;
}

interface Props {
  projectId: string;
  ownerType: string;
  ownerId: string;
  heading: string;
  emptyLabel: string;
  uploadLabel: string;
  uploadingLabel: string;
  errorLabel: string;
  accept?: string;
  imageMode?: boolean;
}

export function AttachmentList({ projectId, ownerType, ownerId, heading, emptyLabel, uploadLabel, uploadingLabel, errorLabel, accept, imageMode }: Props) {
  const [attachments, setAttachments] = useState<AttachmentRow[] | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);

  function load(): void {
    apiJson<AttachmentRow[]>(`/attachments?projectId=${projectId}&ownerType=${ownerType}&ownerId=${ownerId}`)
      .then(setAttachments)
      .catch(() => setError(true));
  }

  useEffect(load, [projectId, ownerType, ownerId]);

  useEffect(() => {
    if (!imageMode || !attachments) return;
    for (const a of attachments) {
      if (!a.mime.startsWith("image/") || downloadUrls[a.id]) continue;
      apiJson<{ downloadUrl: string }>(`/attachments/${a.id}/download`)
        .then((res) => setDownloadUrls((prev) => ({ ...prev, [a.id]: res.downloadUrl })))
        .catch(() => undefined);
    }
  }, [imageMode, attachments]);

  async function handleFile(file: File): Promise<void> {
    setUploading(true);
    setError(false);
    try {
      await uploadAttachment({ projectId, ownerType, ownerId, file });
      load();
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: AttachmentRow): Promise<void> {
    try {
      const res = await apiJson<{ downloadUrl: string }>(`/attachments/${attachment.id}/download`);
      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-800">{heading}</h3>
        <label className="cursor-pointer rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold text-navy-800">
          {uploading ? uploadingLabel : uploadLabel}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-maroon-700">{errorLabel}</p>}
      {attachments === null ? null : attachments.length === 0 ? (
        <p className="text-sm text-navy-600">{emptyLabel}</p>
      ) : imageMode ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) =>
            downloadUrls[a.id] ? (
              <a key={a.id} href={downloadUrls[a.id]} target="_blank" rel="noreferrer">
                <img src={downloadUrls[a.id]} alt={a.filename} className="h-24 w-24 rounded-lg border-3 border-ink object-cover" />
              </a>
            ) : (
              <span key={a.id} className="flex h-24 w-24 items-center justify-center rounded-lg border-3 border-ink bg-cream text-xs text-navy-500">
                {a.filename}
              </span>
            ),
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => void handleDownload(a)} className="text-sm text-navy-800 underline">
                {a.filename}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
