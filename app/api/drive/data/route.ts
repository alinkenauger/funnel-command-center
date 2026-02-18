import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readJsonFile, writeJsonFile } from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  try {
    const data = await readJsonFile(session.accessToken, folderId, "master-data.json");
    return NextResponse.json({ data });
  } catch (err) {
    console.error("Drive read error:", err);
    return NextResponse.json({ error: "Failed to read from Drive" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    await writeJsonFile(session.accessToken, folderId, "master-data.json", body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Drive write error:", err);
    return NextResponse.json({ error: "Failed to write to Drive" }, { status: 500 });
  }
}
