export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeJsonBlob } from "@/lib/blob-storage";

function extractDriveFileId(url: string): string | null {
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const url: string = body.url ?? "";

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  const fileId = extractDriveFileId(url);
  if (!fileId) {
    return NextResponse.json(
      { error: "Could not extract a file ID from that URL. Paste the full share link." },
      { status: 400 }
    );
  }

  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  let data: unknown;
  try {
    const res = await fetch(downloadUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Google Drive returned HTTP ${res.status}` },
        { status: 400 }
      );
    }

    const text = await res.text();

    // If we get HTML back the file isn't public or hit a virus-scan gate
    if (text.trimStart().startsWith("<")) {
      return NextResponse.json(
        {
          error:
            'File is not publicly accessible. In Google Drive, right-click the file → Share → change to "Anyone with the link" (Viewer), then try again.',
        },
        { status: 400 }
      );
    }

    data = JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "The file downloaded but is not valid JSON." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch the file from Google Drive." },
      { status: 500 }
    );
  }

  await writeJsonBlob("data/master-data.json", data);
  return NextResponse.json({ ok: true });
}
