export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";
import {
  buildPlatformStatuses,
  fetchMailchimpMetrics,
  fetchWooCommerceMetrics,
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
  let body: { platform?: unknown; credentials?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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
    } else if (platform === "woocommerce") {
      platformMetric = await fetchWooCommerceMetrics(
        credentials as StoredPlatformCredentials["woocommerce"] & object
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
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 }
    );
  }

  // Save updated credentials + metrics (outside connection try-catch so blob errors surface clearly)
  try {
    await writeJsonBlob(CREDS_PATH, updatedCreds);

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
  } catch (err) {
    return NextResponse.json(
      { error: `Storage error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
