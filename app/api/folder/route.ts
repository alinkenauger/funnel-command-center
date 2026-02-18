import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateFolder } from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const result = await validateFolder(session.accessToken, folderId);
  return NextResponse.json(result);
}
