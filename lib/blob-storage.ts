import { put, list } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN!;

export async function readJsonBlob<T>(path: string): Promise<T | null> {
  const { blobs } = await list({ prefix: path, token: TOKEN });
  const match = blobs.find((b) => b.pathname === path);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function writeJsonBlob(path: string, data: unknown): Promise<void> {
  await put(path, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    token: TOKEN,
    contentType: "application/json",
  });
}

export async function readTextBlob(path: string): Promise<string | null> {
  const { blobs } = await list({ prefix: path, token: TOKEN });
  const match = blobs.find((b) => b.pathname === path);
  if (!match) return null;
  const res = await fetch(match.url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.text();
}

export async function writeTextBlob(path: string, content: string): Promise<void> {
  await put(path, content, {
    access: "public",
    addRandomSuffix: false,
    token: TOKEN,
    contentType: "text/plain; charset=utf-8",
  });
}

export async function uploadBlob(filename: string, file: File): Promise<string> {
  const blob = await put(`inbox/${filename}`, file, {
    access: "public",
    addRandomSuffix: false,
    token: TOKEN,
  });
  return blob.url;
}

export async function listReportBlobs(): Promise<{ pathname: string; url: string }[]> {
  const { blobs } = await list({ prefix: "reports/", token: TOKEN });
  return blobs.map((b) => ({ pathname: b.pathname, url: b.url }));
}
