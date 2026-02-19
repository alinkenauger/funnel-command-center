import type { DriveFile } from "./types";

const GOOGLE_DRIVE_MIME = {
  DOC: "application/vnd.google-apps.document",
  SHEET: "application/vnd.google-apps.spreadsheet",
  SLIDE: "application/vnd.google-apps.presentation",
} as const;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function extractFolderIdFromUrl(url: string): string | null {
  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!API_KEY) {
    throw new Error(
      "GOOGLE_DRIVE_API_KEY not configured. Add it to your Vercel environment variables."
    );
  }

  const FOLDER_MIME = "application/vnd.google-apps.folder";

  // Recursively collects all non-folder files at any depth
  async function recurse(parentId: string): Promise<DriveFile[]> {
    const allItems: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
        pageSize: "1000",
        key: API_KEY!,
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg =
          (errData as { error?: { message?: string } })?.error?.message ??
          `Drive API returned HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      allItems.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    // Separate files from subfolders
    const files: DriveFile[] = [];
    const subfolderPromises: Promise<DriveFile[]>[] = [];

    for (const item of allItems) {
      if (item.mimeType === FOLDER_MIME) {
        // Recurse into subfolders in parallel
        subfolderPromises.push(recurse(item.id));
      } else {
        files.push(item);
      }
    }

    const subResults = await Promise.all(subfolderPromises);
    for (const sub of subResults) {
      files.push(...sub);
    }

    return files;
  }

  return recurse(folderId);
}

// ── Content Extraction ────────────────────────────────────────────

export type FileContent =
  | { type: "text"; content: string }
  | { type: "image"; base64: string; mediaType: string }
  | { type: "pdf"; base64: string }
  | { type: "skipped"; reason: string };

// Downloads a binary file via the Drive API v3 alt=media endpoint.
// Using the API key here (same key that lists files) bypasses the
// html-gate that the legacy uc?export=download URL returns for
// files that aren't 100% public.
async function downloadViaApi(id: string, apiKey: string): Promise<Response> {
  const params = new URLSearchParams({ alt: "media", key: apiKey });
  return fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?${params}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
}

export async function extractFileContent(file: DriveFile): Promise<FileContent> {
  const { id, mimeType, name } = file;
  const API_KEY = process.env.GOOGLE_DRIVE_API_KEY;

  try {
    // ── Google Docs ───────────────────────────────────────────────
    if (mimeType === GOOGLE_DRIVE_MIME.DOC) {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const params = new URLSearchParams({ mimeType: "text/plain", key: API_KEY });
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?${params}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) return { type: "skipped", reason: `Export failed: ${res.status}` };
      const text = await res.text();
      return { type: "text", content: `[Google Doc: ${name}]\n\n${text.slice(0, 20000)}` };
    }

    // ── Google Sheets ─────────────────────────────────────────────
    if (mimeType === GOOGLE_DRIVE_MIME.SHEET) {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const params = new URLSearchParams({ mimeType: "text/csv", key: API_KEY });
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?${params}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) return { type: "skipped", reason: `Export failed: ${res.status}` };
      const text = await res.text();
      return { type: "text", content: `[Google Sheet: ${name}]\n\n${text.slice(0, 20000)}` };
    }

    // ── Google Slides ─────────────────────────────────────────────
    if (mimeType === GOOGLE_DRIVE_MIME.SLIDE) {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const params = new URLSearchParams({ mimeType: "text/plain", key: API_KEY });
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?${params}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) return { type: "skipped", reason: `Export failed: ${res.status}` };
      const text = await res.text();
      return { type: "text", content: `[Google Slides: ${name}]\n\n${text.slice(0, 20000)}` };
    }

    // ── PDFs ──────────────────────────────────────────────────────
    if (mimeType === "application/pdf") {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const res = await downloadViaApi(id, API_KEY);
      if (!res.ok) return { type: "skipped", reason: `Download failed: ${res.status}` };
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html"))
        return { type: "skipped", reason: "Virus-scan gate — file may be too large or restricted" };
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 10 * 1024 * 1024)
        return { type: "skipped", reason: "PDF too large (>10 MB)" };
      const base64 = Buffer.from(buffer).toString("base64");
      return { type: "pdf", base64 };
    }

    // ── Images ────────────────────────────────────────────────────
    if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const res = await downloadViaApi(id, API_KEY);
      if (!res.ok) return { type: "skipped", reason: `Download failed: ${res.status}` };
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html"))
        return { type: "skipped", reason: "Not accessible via API key" };
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 5 * 1024 * 1024)
        return { type: "skipped", reason: "Image too large (>5 MB)" };
      const base64 = Buffer.from(buffer).toString("base64");
      return { type: "image", base64, mediaType: mimeType };
    }

    // ── Plain text / CSV ──────────────────────────────────────────
    if (mimeType === "text/plain" || mimeType === "text/csv") {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      const res = await downloadViaApi(id, API_KEY);
      if (!res.ok) return { type: "skipped", reason: `Download failed: ${res.status}` };
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html"))
        return { type: "skipped", reason: "Not accessible via API key" };
      const text = await res.text();
      return { type: "text", content: `[${name}]\n\n${text.slice(0, 20000)}` };
    }

    // ── Uploaded Office files (.docx, .xlsx, .pptx) ───────────────
    // Google Drive can export uploaded Office files as Google Workspace
    // formats, then we export those as text/csv.
    const OFFICE_MIME_TO_EXPORT: Record<string, { exportMime: string; label: string }> = {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        exportMime: "text/plain",
        label: "Word Doc",
      },
      "application/msword": { exportMime: "text/plain", label: "Word Doc" },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        exportMime: "text/csv",
        label: "Excel Sheet",
      },
      "application/vnd.ms-excel": { exportMime: "text/csv", label: "Excel Sheet" },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        exportMime: "text/plain",
        label: "PowerPoint",
      },
      "application/vnd.ms-powerpoint": { exportMime: "text/plain", label: "PowerPoint" },
    };

    const officeInfo = OFFICE_MIME_TO_EXPORT[mimeType];
    if (officeInfo) {
      if (!API_KEY) return { type: "skipped", reason: "API key not configured" };
      // Drive can export uploaded Office files via the same export endpoint
      const params = new URLSearchParams({ mimeType: officeInfo.exportMime, key: API_KEY });
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?${params}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) {
        // Some uploaded files can't be exported — fall back to binary download
        const dlRes = await downloadViaApi(id, API_KEY);
        if (!dlRes.ok) return { type: "skipped", reason: `Export + download both failed: ${dlRes.status}` };
        const ct = dlRes.headers.get("content-type") ?? "";
        if (ct.includes("text/html")) return { type: "skipped", reason: "Not accessible via API key" };
        const text = await dlRes.text();
        return { type: "text", content: `[${officeInfo.label}: ${name}]\n\n${text.slice(0, 20000)}` };
      }
      const text = await res.text();
      return { type: "text", content: `[${officeInfo.label}: ${name}]\n\n${text.slice(0, 20000)}` };
    }

    return { type: "skipped", reason: `Unsupported type: ${mimeType}` };
  } catch (err) {
    return {
      type: "skipped",
      reason: `Error: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
