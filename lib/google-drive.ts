import { google } from "googleapis";

function getDriveClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

/** Find a file by name in a folder. Returns the file ID or null. */
async function findFile(
  accessToken: string,
  folderId: string,
  name: string,
  subfolder?: string
): Promise<string | null> {
  const drive = getDriveClient(accessToken);

  let parentId = folderId;

  if (subfolder) {
    // Find the subfolder first
    const folderRes = await drive.files.list({
      q: `'${folderId}' in parents and name = '${subfolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      spaces: "drive",
    });
    const subfolders = folderRes.data.files ?? [];
    if (subfolders.length === 0) return null;
    parentId = subfolders[0].id!;
  }

  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and trashed = false`,
    fields: "files(id)",
    spaces: "drive",
  });

  const files = res.data.files ?? [];
  return files.length > 0 ? files[0].id! : null;
}

/** Read a JSON file from a Drive folder by name. Returns parsed object or null. */
export async function readJsonFile<T = unknown>(
  accessToken: string,
  folderId: string,
  filename: string
): Promise<T | null> {
  const drive = getDriveClient(accessToken);
  const fileId = await findFile(accessToken, folderId, filename);
  if (!fileId) return null;

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );

  return JSON.parse(res.data as string) as T;
}

/** Write (create or update) a JSON file in a Drive folder. */
export async function writeJsonFile(
  accessToken: string,
  folderId: string,
  filename: string,
  data: unknown,
  subfolder?: string
): Promise<void> {
  const drive = getDriveClient(accessToken);

  // Resolve parent folder (find or create subfolder if specified)
  let parentId = folderId;
  if (subfolder) {
    const folderRes = await drive.files.list({
      q: `'${folderId}' in parents and name = '${subfolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });
    const existing = folderRes.data.files ?? [];
    if (existing.length > 0) {
      parentId = existing[0].id!;
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: subfolder,
          mimeType: "application/vnd.google-apps.folder",
          parents: [folderId],
        },
        fields: "id",
      });
      parentId = created.data.id!;
    }
  }

  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const media = { mimeType: "application/json", body: blob };

  const existingId = await findFile(accessToken, parentId, filename);

  if (existingId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await drive.files.update({ fileId: existingId, media: media as any });
  } else {
    await drive.files.create({
      requestBody: { name: filename, parents: [parentId] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      media: media as any,
    });
  }
}

/** Read a text/markdown file from a Drive folder. Returns string or null. */
export async function readTextFile(
  accessToken: string,
  folderId: string,
  filename: string,
  subfolder?: string
): Promise<string | null> {
  const drive = getDriveClient(accessToken);
  const fileId = await findFile(accessToken, folderId, filename, subfolder);
  if (!fileId) return null;

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );

  return res.data as string;
}

/** Write a text file to a Drive folder (create or update). */
export async function writeTextFile(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string,
  subfolder?: string
): Promise<void> {
  const drive = getDriveClient(accessToken);

  // Resolve parent folder
  let parentId = folderId;
  if (subfolder) {
    // Find or create subfolder
    const folderRes = await drive.files.list({
      q: `'${folderId}' in parents and name = '${subfolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });
    const existing = folderRes.data.files ?? [];
    if (existing.length > 0) {
      parentId = existing[0].id!;
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: subfolder,
          mimeType: "application/vnd.google-apps.folder",
          parents: [folderId],
        },
        fields: "id",
      });
      parentId = created.data.id!;
    }
  }

  const blob = new Blob([content], { type: "text/plain" });
  const media = { mimeType: "text/plain", body: blob };

  const existingId = await findFile(accessToken, parentId, filename);
  if (existingId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await drive.files.update({ fileId: existingId, media: media as any });
  } else {
    await drive.files.create({
      requestBody: { name: filename, parents: [parentId] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      media: media as any,
    });
  }
}

/** Upload a binary file to the inbox/ subfolder. Returns the created file ID. */
export async function uploadFile(
  accessToken: string,
  folderId: string,
  file: File
): Promise<string> {
  const drive = getDriveClient(accessToken);

  // Find or create inbox/ subfolder
  const folderRes = await drive.files.list({
    q: `'${folderId}' in parents and name = 'inbox' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
  });
  const existing = folderRes.data.files ?? [];
  let inboxId: string;

  if (existing.length > 0) {
    inboxId = existing[0].id!;
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: "inbox",
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderId],
      },
      fields: "id",
    });
    inboxId = created.data.id!;
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const created = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [inboxId],
    },
    media: {
      mimeType: file.type || "application/octet-stream",
      body: stream,
    },
    fields: "id",
  });

  return created.data.id!;
}

/** List files in the reports/ subfolder. */
export async function listReports(
  accessToken: string,
  folderId: string
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const drive = getDriveClient(accessToken);

  // Find reports/ subfolder
  const folderRes = await drive.files.list({
    q: `'${folderId}' in parents and name = 'reports' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
  });
  const folders = folderRes.data.files ?? [];
  if (folders.length === 0) return [];

  const reportsId = folders[0].id!;
  const res = await drive.files.list({
    q: `'${reportsId}' in parents and trashed = false`,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime desc",
  });

  return (res.data.files ?? []) as Array<{
    id: string;
    name: string;
    modifiedTime: string;
  }>;
}

/** Validate that a folder ID is accessible. */
export async function validateFolder(
  accessToken: string,
  folderId: string
): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const drive = getDriveClient(accessToken);
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType",
    });
    const file = res.data;
    if (file.mimeType !== "application/vnd.google-apps.folder") {
      return { valid: false, error: "That ID is not a folder." };
    }
    return { valid: true, name: file.name ?? undefined };
  } catch {
    return { valid: false, error: "Folder not found or access denied." };
  }
}
