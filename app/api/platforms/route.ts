export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";
import {
  fetchAllPlatformMetrics,
  buildPlatformStatuses,
} from "@/lib/platform-connectors";
import type {
  StoredPlatformCredentials,
  StoredPlatformMetrics,
} from "@/lib/platform-connectors/types";

const CREDS_PATH = "data/platform-credentials.json";
const METRICS_PATH = "data/platform-metrics.json";

// GET /api/platforms — return current connection statuses + cached metrics
export async function GET() {
  const creds =
    (await readJsonBlob<StoredPlatformCredentials>(CREDS_PATH)) ?? {};
  const metrics =
    (await readJsonBlob<StoredPlatformMetrics>(METRICS_PATH)) ?? {};

  const statuses = buildPlatformStatuses(creds, metrics);
  return NextResponse.json({ statuses, last_synced_at: metrics.last_synced_at });
}

// POST /api/platforms — save credentials + test connection + cache metrics
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { platform, credentials } = body as {
    platform: keyof StoredPlatformCredentials;
    credentials: StoredPlatformCredentials[keyof StoredPlatformCredentials];
  };

  if (!platform || !credentials) {
    return NextResponse.json(
      { error: "platform and credentials are required" },
      { status: 400 }
    );
  }

  // Load existing creds and merge
  const existing =
    (await readJsonBlob<StoredPlatformCredentials>(CREDS_PATH)) ?? {};
  const updatedCreds: StoredPlatformCredentials = {
    ...existing,
    [platform]: credentials,
  };

  // Test the connection by fetching metrics for this platform only
  const testCreds: StoredPlatformCredentials = { [platform]: credentials };
  let newMetrics: StoredPlatformMetrics;
  try {
    newMetrics = await fetchAllPlatformMetrics(testCreds);
    if (!newMetrics[platform as keyof StoredPlatformMetrics]) {
      return NextResponse.json(
        { error: `Failed to fetch metrics from ${platform} — check your credentials` },
        { status: 422 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection test failed" },
      { status: 422 }
    );
  }

  // Save updated credentials
  await writeJsonBlob(CREDS_PATH, updatedCreds);

  // Merge new metrics with existing cached metrics
  const existingMetrics =
    (await readJsonBlob<StoredPlatformMetrics>(METRICS_PATH)) ?? {};
  const updatedMetrics: StoredPlatformMetrics = {
    ...existingMetrics,
    [platform]: newMetrics[platform as keyof StoredPlatformMetrics],
    last_synced_at: new Date().toISOString(),
  };
  await writeJsonBlob(METRICS_PATH, updatedMetrics);

  const statuses = buildPlatformStatuses(updatedCreds, updatedMetrics);
  return NextResponse.json({ ok: true, statuses });
}
