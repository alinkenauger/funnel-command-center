export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { extractFolderIdFromUrl, listFolderFiles } from "@/lib/google-drive";
import { readJsonBlob } from "@/lib/blob-storage";
import type { DriveConfig, DriveFile } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { folderUrl } = body as { folderUrl: string };

  if (!folderUrl) {
    return NextResponse.json({ error: "folderUrl is required" }, { status: 400 });
  }

  const folderId = extractFolderIdFromUrl(folderUrl);
  if (!folderId) {
    return NextResponse.json(
      {
        error:
          'Could not extract a folder ID from that URL. Make sure it looks like: https://drive.google.com/drive/folders/...',
      },
      { status: 400 }
    );
  }

  let files: DriveFile[];
  try {
    files = await listFolderFiles(folderId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list files from Google Drive" },
      { status: 500 }
    );
  }

  // Detect new files vs last known set
  const existingConfig = await readJsonBlob<DriveConfig>("data/drive-config.json");
  const knownIds = new Set(existingConfig?.knownFileIds ?? []);
  const newFiles = files.filter((f) => !knownIds.has(f.id));

  return NextResponse.json({
    folderId,
    files,
    newFileCount: newFiles.length,
    newFiles,
  });
}
