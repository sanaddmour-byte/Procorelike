"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { uploadAttachment } from "@/lib/upload";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface DocumentFolder {
  id: string;
  parentId: string | null;
  name: string;
}

interface DocumentRecord {
  id: string;
  title: string;
  currentAttachmentId: string;
}

export default function DocumentsPage() {
  const t = useTranslations("Documents");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [folders, setFolders] = useState<DocumentFolder[] | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  function loadFolders(): void {
    apiJson<DocumentFolder[]>(`/documents/folders?projectId=${params.id}`)
      .then(setFolders)
      .catch(() => setError(tc("errorGeneric")));
  }

  function loadDocuments(folderId: string | null): void {
    const query = folderId ? `&folderId=${folderId}` : "";
    apiJson<DocumentRecord[]>(`/documents?projectId=${params.id}${query}`)
      .then(setDocuments)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    loadFolders();
    loadDocuments(null);
  }, [router, locale, params.id]);

  function selectFolder(folderId: string | null): void {
    setActiveFolderId(folderId);
    loadDocuments(folderId);
  }

  async function handleCreateFolder(): Promise<void> {
    if (!newFolderName.trim()) return;
    try {
      await apiJson("/documents/folders", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, name: newFolderName.trim() }),
      });
      setNewFolderName("");
      loadFolders();
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  async function handleUpload(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      const attachmentId = await uploadAttachment({
        projectId: params.id,
        ownerType: "document",
        ownerId: params.id,
        file,
      });
      await apiJson("/documents", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          folderId: activeFolderId ?? undefined,
          title: file.name,
          attachmentId,
        }),
      });
      loadDocuments(activeFolderId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.code : "unknown_error");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function handleReplace(documentId: string, file: File): Promise<void> {
    setReplacingId(documentId);
    setError(null);
    try {
      const attachmentId = await uploadAttachment({
        projectId: params.id,
        ownerType: "document",
        ownerId: params.id,
        file,
      });
      await apiJson(`/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ attachmentId }),
      });
      loadDocuments(activeFolderId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.code : "unknown_error");
    } finally {
      setReplacingId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function handleDownload(attachmentId: string): Promise<void> {
    try {
      const { downloadUrl } = await apiJson<{ downloadUrl: string }>(`/attachments/${attachmentId}/download`);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">
          <aside>
            <h2 className="mb-2 text-sm font-medium text-navy-600">{t("foldersTitle")}</h2>
            <ul className="flex flex-col gap-1">
              <li>
                <button
                  onClick={() => selectFolder(null)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    activeFolderId === null ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-orange-100"
                  }`}
                >
                  {t("allDocuments")}
                </button>
              </li>
              {!folders && (
                <li className="px-2 py-1.5 text-sm text-navy-500">{tc("loading")}</li>
              )}
              {folders && folders.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-navy-500">{t("noFolders")}</li>
              )}
              {folders?.map((folder) => (
                <li key={folder.id}>
                  <button
                    onClick={() => selectFolder(folder.id)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                      activeFolderId === folder.id ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-orange-100"
                    }`}
                  >
                    {folder.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("folderName")}
                className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => void handleCreateFolder()}
                disabled={!newFolderName.trim()}
                className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm text-navy-800 disabled:opacity-50"
              >
                {t("newFolder")}
              </button>
            </div>
          </aside>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <label className="cursor-pointer rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white">
                {uploading ? t("uploading") : t("uploadButton")}
                <input
                  ref={uploadInputRef}
                  type="file"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
              </label>
            </div>
            {!documents && <p>{tc("loading")}</p>}
            {documents && documents.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
            <ul className="flex flex-col gap-2">
              {documents?.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-3">
                  <span className="truncate font-medium">{doc.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => void handleDownload(doc.currentAttachmentId)}
                      className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800"
                    >
                      {t("download")}
                    </button>
                    <label className="cursor-pointer rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800">
                      {replacingId === doc.id ? t("uploading") : t("replaceFile")}
                      <input
                        ref={replaceInputRef}
                        type="file"
                        disabled={replacingId === doc.id}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleReplace(doc.id, file);
                        }}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
