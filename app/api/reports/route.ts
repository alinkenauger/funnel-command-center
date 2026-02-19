export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readTextBlob, listReportBlobs } from "@/lib/blob-storage";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");

  if (filename) {
    const content = await readTextBlob(`reports/${filename}`);
    if (!content) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ content });
  }

  // List all reports
  const reports = await listReportBlobs();
  return NextResponse.json({ reports });
}
