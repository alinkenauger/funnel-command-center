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

type PlatformKey = keyof StoredPlatformCredentials;

// GET /api/platforms/[platform] — fetch fresh metrics for one platform
export async function GET(
  _request: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform as PlatformKey;
  const creds =
    (await readJsonBlob<StoredPlatformCredentials>(CREDS_PATH)) ?? {};

  if (!creds[platform]) {
    return NextResponse.json(
      { error: `Platform "${platform}" is not connected` },
      { status: 404 }
    );
  }

  const testCreds: StoredPlatformCredentials = { [platform]: creds[platform] };
  let freshMetrics: StoredPlatformMetrics;
  try {
    freshMetrics = await fetchAllPlatformMetrics(testCreds);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }

  // Merge into cached metrics
  const existingMetrics =
    (await readJsonBlob<StoredPlatformMetrics>(METRICS_PATH)) ?? {};
  const updatedMetrics: StoredPlatformMetrics = {
    ...existingMetrics,
    [platform]: freshMetrics[platform as keyof StoredPlatformMetrics],
    last_synced_at: new Date().toISOString(),
  };
  await writeJsonBlob(METRICS_PATH, updatedMetrics);

  const statuses = buildPlatformStatuses(creds, updatedMetrics);
  return NextResponse.json({ ok: true, statuses, metrics: updatedMetrics[platform as keyof StoredPlatformMetrics] });
}

// DELETE /api/platforms/[platform] — disconnect a platform
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform as PlatformKey;

  const creds =
    (await readJsonBlob<StoredPlatformCredentials>(CREDS_PATH)) ?? {};
  const metrics =
    (await readJsonBlob<StoredPlatformMetrics>(METRICS_PATH)) ?? {};

  // Remove credentials
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [platform]: _removedCred, ...remainingCreds } = creds;
  await writeJsonBlob(CREDS_PATH, remainingCreds);

  // Remove cached metrics
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [platform]: _removedMetric, ...remainingMetrics } = metrics;
  await writeJsonBlob(METRICS_PATH, remainingMetrics);

  const statuses = buildPlatformStatuses(
    remainingCreds as StoredPlatformCredentials,
    remainingMetrics as StoredPlatformMetrics
  );
  return NextResponse.json({ ok: true, statuses });
}
