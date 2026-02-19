import crypto from "crypto";
import type { GoogleAnalyticsCredentials, GoogleAnalyticsMetrics } from "./types";

interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(saJson: ServiceAccountJson, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = b64url(
    JSON.stringify({
      iss: saJson.client_email,
      scope,
      aud: saJson.token_uri ?? "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const toSign = `${header}.${claimSet}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(toSign);
  const sig = b64url(sign.sign(saJson.private_key));
  const jwt = `${toSign}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(
      `Google OAuth token error: ${tokenData.error_description ?? tokenData.error}`
    );
  }
  return tokenData.access_token as string;
}

interface GA4ReportRow {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}

export async function fetchGoogleAnalyticsMetrics(
  creds: GoogleAnalyticsCredentials
): Promise<GoogleAnalyticsMetrics> {
  const sa: ServiceAccountJson = JSON.parse(creds.service_account_json);
  const accessToken = await getAccessToken(
    sa,
    "https://www.googleapis.com/auth/analytics.readonly"
  );

  const pid = creds.property_id.replace(/^properties\//, "");
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Report 1: sessions + bounce rate + new users total (no dimension)
  const summaryRes = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      metrics: [
        { name: "sessions" },
        { name: "bounceRate" },
        { name: "newUsers" },
      ],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    }),
  });
  if (!summaryRes.ok) {
    const err = await summaryRes.json().catch(() => ({}));
    throw new Error(
      `GA4 API error ${summaryRes.status}: ${JSON.stringify((err as Record<string, unknown>).error ?? err)}`
    );
  }
  const summaryData = await summaryRes.json();
  const summaryRow: GA4ReportRow = summaryData.rows?.[0] ?? {};
  const sessions = parseInt(summaryRow.metricValues?.[0]?.value ?? "0", 10);
  const bounceRate = parseFloat(summaryRow.metricValues?.[1]?.value ?? "0") / 100;
  const newUsers = parseInt(summaryRow.metricValues?.[2]?.value ?? "0", 10);

  // Report 2: sessions by default channel group
  const channelRes = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
  });
  const channelData = channelRes.ok ? await channelRes.json() : { rows: [] };
  const channels: Array<{ channel: string; sessions: number }> = (
    channelData.rows ?? []
  ).map((r: GA4ReportRow) => ({
    channel: r.dimensionValues?.[0]?.value ?? "Unknown",
    sessions: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
  }));

  const topChannel = channels[0]?.channel ?? "Unknown";

  return {
    platform: "google_analytics",
    fetched_at: new Date().toISOString(),
    property_id: pid,
    monthly_sessions: sessions,
    bounce_rate: Math.round(bounceRate * 1000) / 1000,
    new_users_30d: newUsers,
    top_channel: topChannel,
    channels,
  };
}
