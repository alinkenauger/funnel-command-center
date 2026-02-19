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

function rowMetric(row: GA4ReportRow, idx: number, fallback = "0"): string {
  return row.metricValues?.[idx]?.value ?? fallback;
}
function rowDim(row: GA4ReportRow, idx: number): string {
  return row.dimensionValues?.[idx]?.value ?? "Unknown";
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

  // ── Run all reports in parallel ───────────────────────────────────────────
  const [summaryRes, channelRes, deviceRes, landingRes, annual30Res] = await Promise.all([
    // Report 1: 30-day aggregate — sessions, bounce rate, new users, engagement,
    //           avg session duration, page views
    fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        metrics: [
          { name: "sessions" },
          { name: "bounceRate" },
          { name: "newUsers" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
          { name: "screenPageViews" },
        ],
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      }),
    }),

    // Report 2: sessions by channel (30d)
    fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
    }),

    // Report 3: sessions by device category (30d)
    fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
    }),

    // Report 4: top landing pages — sessions + bounce rate (30d)
    fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "bounceRate" }],
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
    }),

    // Report 5: 12-month totals — sessions + new users
    fetch(endpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        metrics: [{ name: "sessions" }, { name: "newUsers" }],
        dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
      }),
    }),
  ]);

  // ── Parse summary ─────────────────────────────────────────────────────────
  if (!summaryRes.ok) {
    const err = await summaryRes.json().catch(() => ({}));
    throw new Error(
      `GA4 API error ${summaryRes.status}: ${JSON.stringify(
        (err as Record<string, unknown>).error ?? err
      )}`
    );
  }
  const summaryData = await summaryRes.json();
  const sRow: GA4ReportRow = summaryData.rows?.[0] ?? {};
  const sessions = parseInt(rowMetric(sRow, 0), 10);
  const bounceRate = parseFloat(rowMetric(sRow, 1)) / 100;
  const newUsers = parseInt(rowMetric(sRow, 2), 10);
  const engagementRate = parseFloat(rowMetric(sRow, 3)) / 100;
  const avgSessionDurationSec = parseFloat(rowMetric(sRow, 4));
  const pageViews = parseInt(rowMetric(sRow, 5), 10);

  // ── Parse channels ────────────────────────────────────────────────────────
  const channelData = channelRes.ok ? await channelRes.json() : { rows: [] };
  const channels: Array<{ channel: string; sessions: number }> = (
    channelData.rows ?? []
  ).map((r: GA4ReportRow) => ({
    channel: rowDim(r, 0),
    sessions: parseInt(rowMetric(r, 0), 10),
  }));
  const topChannel = channels[0]?.channel ?? "Unknown";

  // ── Parse device breakdown ────────────────────────────────────────────────
  const deviceData = deviceRes.ok ? await deviceRes.json() : { rows: [] };
  const deviceBreakdown: Array<{ device: string; sessions: number }> = (
    deviceData.rows ?? []
  ).map((r: GA4ReportRow) => ({
    device: rowDim(r, 0),
    sessions: parseInt(rowMetric(r, 0), 10),
  }));

  // ── Parse top landing pages ───────────────────────────────────────────────
  const landingData = landingRes.ok ? await landingRes.json() : { rows: [] };
  const topLandingPages: Array<{ page: string; sessions: number; bounce_rate: number }> = (
    landingData.rows ?? []
  ).map((r: GA4ReportRow) => ({
    page: rowDim(r, 0),
    sessions: parseInt(rowMetric(r, 0), 10),
    bounce_rate: Math.round((parseFloat(rowMetric(r, 1)) / 100) * 1000) / 1000,
  }));

  // ── Parse 12-month totals ─────────────────────────────────────────────────
  let sessions12m = 0, newUsers12m = 0;
  if (annual30Res.ok) {
    const annData = await annual30Res.json().catch(() => ({}));
    const aRow: GA4ReportRow = annData.rows?.[0] ?? {};
    sessions12m = parseInt(rowMetric(aRow, 0), 10);
    newUsers12m = parseInt(rowMetric(aRow, 1), 10);
  }

  return {
    platform: "google_analytics",
    fetched_at: new Date().toISOString(),
    property_id: pid,
    monthly_sessions: sessions,
    bounce_rate: Math.round(bounceRate * 1000) / 1000,
    engagement_rate: Math.round(engagementRate * 1000) / 1000,
    avg_session_duration_sec: Math.round(avgSessionDurationSec),
    page_views_30d: pageViews,
    new_users_30d: newUsers,
    sessions_12m: sessions12m,
    new_users_12m: newUsers12m,
    top_channel: topChannel,
    channels,
    device_breakdown: deviceBreakdown,
    top_landing_pages: topLandingPages,
  };
}
