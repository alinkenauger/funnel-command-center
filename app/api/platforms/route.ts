export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";
import {
  buildPlatformStatuses,
  fetchMailchimpMetrics,
  fetchBigCommerceMetrics,
  fetchGoogleAnalyticsMetrics,
  fetchGoogleAdsMetrics,
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

  // Test the connection by calling the specific connector directly so real errors surface
  let platformMetric: StoredPlatformMetrics[keyof StoredPlatformMetrics];
  try {
    if (platform === "mailchimp") {
      platformMetric = await fetchMailchimpMetrics(
        credentials as StoredPlatformCredentials["mailchimp"] & object
      );
    } else if (platform === "bigcommerce") {
      platformMetric = await fetchBigCommerceMetrics(
        credentials as StoredPlatformCredentials["bigcommerce"] & object
      );
    } else if (platform === "google_analytics") {
      platformMetric = await fetchGoogleAnalyticsMetrics(
        credentials as StoredPlatformCredentials["google_analytics"] & object
      );
    } else if (platform === "google_ads") {
      platformMetric = await fetchGoogleAdsMetrics(
        credentials as StoredPlatformCredentials["google_ads"] & object
      );
    } else {
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
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
    [platform]: platformMetric,
    last_synced_at: new Date().toISOString(),
  };
  await writeJsonBlob(METRICS_PATH, updatedMetrics);

  const statuses = buildPlatformStatuses(updatedCreds, updatedMetrics);
  return NextResponse.json({ ok: true, statuses });
}
