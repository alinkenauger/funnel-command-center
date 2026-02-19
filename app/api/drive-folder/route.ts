export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";
import type { DriveConfig } from "@/lib/types";

export async function GET() {
  const config = await readJsonBlob<DriveConfig>("data/drive-config.json");
  if (!config) return NextResponse.json({ config: null });
  return NextResponse.json({ config });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { folderId, folderName, knownFileIds } = body as {
    folderId: string;
    folderName?: string;
    knownFileIds?: string[];
  };

  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const existing = await readJsonBlob<DriveConfig>("data/drive-config.json");

  const config: DriveConfig = {
    folderId,
    folderName: folderName ?? existing?.folderName,
    connectedAt: existing?.connectedAt ?? new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    knownFileIds: knownFileIds ?? existing?.knownFileIds ?? [],
  };

  await writeJsonBlob("data/drive-config.json", config);
  return NextResponse.json({ ok: true, config });
}
