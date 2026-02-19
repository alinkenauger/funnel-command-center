import type { GoogleAdsCredentials, GoogleAdsMetrics } from "./types";

async function refreshAccessToken(creds: GoogleAdsCredentials): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Google Ads token refresh error: ${data.error_description ?? data.error}`
    );
  }
  return data.access_token as string;
}

interface GadsRow {
  campaign?: { name?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    cost_micros?: string;
    conversions?: string;
  };
}

export async function fetchGoogleAdsMetrics(
  creds: GoogleAdsCredentials
): Promise<GoogleAdsMetrics> {
  const accessToken = await refreshAccessToken(creds);

  const customerId = creds.customer_id.replace(/-/g, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": creds.developer_token,
    "Content-Type": "application/json",
  };
  if (creds.login_customer_id) {
    headers["login-customer-id"] = creds.login_customer_id.replace(/-/g, "");
  }

  const gaqlQuery = `
    SELECT
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;

  const searchRes = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gaqlQuery }),
    }
  );
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(
      `Google Ads API error ${searchRes.status}: ${JSON.stringify((err as Record<string, unknown>).error ?? err)}`
    );
  }
  const searchData = await searchRes.json();
  const rows: GadsRow[] = searchData.results ?? [];

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalCostMicros = 0;
  let totalConversions = 0;

  for (const row of rows) {
    const m = row.metrics ?? {};
    totalImpressions += parseInt(m.impressions ?? "0", 10);
    totalClicks += parseInt(m.clicks ?? "0", 10);
    totalCostMicros += parseInt(m.cost_micros ?? "0", 10);
    totalConversions += parseFloat(m.conversions ?? "0");
  }

  const totalSpend = totalCostMicros / 1_000_000;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;

  return {
    platform: "google_ads",
    fetched_at: new Date().toISOString(),
    customer_id: customerId,
    total_spend_30d: Math.round(totalSpend * 100) / 100,
    total_clicks_30d: totalClicks,
    total_impressions_30d: totalImpressions,
    avg_ctr: Math.round(avgCtr * 10000) / 10000,
    avg_cpc: Math.round(avgCpc * 100) / 100,
    total_conversions_30d: Math.round(totalConversions * 100) / 100,
    cost_per_conversion: Math.round(costPerConversion * 100) / 100,
  };
}
