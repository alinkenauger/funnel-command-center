export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";

export async function GET() {
  const data = await readJsonBlob("data/master-data.json");
  if (!data) {
    return NextResponse.json({ error: "No data file found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  await writeJsonBlob("data/master-data.json", body);
  return NextResponse.json({ ok: true });
}
