import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readTextFile, listReports } from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId");
  const filename = request.nextUrl.searchParams.get("filename");

  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  try {
    if (filename) {
      // Read specific report file
      const content = await readTextFile(session.accessToken, folderId, filename, "reports");
      return NextResponse.json({ content });
    } else {
      // List all reports
      const reports = await listReports(session.accessToken, folderId);
      return NextResponse.json({ reports });
    }
  } catch (err) {
    console.error("Reports fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
