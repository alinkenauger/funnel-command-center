import type { GoogleAdsCredentials, GoogleAdsMetrics, GoogleAdsCampaignSummary } from "./types";

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
  const data = await res.json().catch(() => ({})) as Record<string, string>;
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
    conversions_value?: string;
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
      metrics.conversions,
      metrics.conversions_value
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
  const searchData = await searchRes.json().catch(() => ({ results: [] }));
  const rows: GadsRow[] = searchData.results ?? [];

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalCostMicros = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;

  // Build per-campaign summaries (top 10 by spend)
  const campaignMap = new Map<string, {
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionValue: number;
  }>();

  for (const row of rows) {
    const m = row.metrics ?? {};
    const name = row.campaign?.name ?? "Unknown Campaign";
    const impressions = parseInt(m.impressions ?? "0", 10);
    const clicks = parseInt(m.clicks ?? "0", 10);
    const costMicros = parseInt(m.cost_micros ?? "0", 10);
    const conversions = parseFloat(m.conversions ?? "0");
    const conversionValue = parseFloat(m.conversions_value ?? "0");

    totalImpressions += impressions;
    totalClicks += clicks;
    totalCostMicros += costMicros;
    totalConversions += conversions;
    totalConversionValue += conversionValue;

    // Aggregate by campaign name (multiple rows can exist per campaign due to segments)
    const existing = campaignMap.get(name);
    if (existing) {
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.costMicros += costMicros;
      existing.conversions += conversions;
      existing.conversionValue += conversionValue;
    } else {
      campaignMap.set(name, { impressions, clicks, costMicros, conversions, conversionValue });
    }
  }

  const totalSpend = totalCostMicros / 1_000_000;
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas30d = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const conversionRate30d = totalClicks > 0 ? totalConversions / totalClicks : 0;

  // Build sorted campaign summary array (top 10 by spend)
  const topCampaigns: GoogleAdsCampaignSummary[] = Array.from(campaignMap.entries())
    .sort((a, b) => b[1].costMicros - a[1].costMicros)
    .slice(0, 10)
    .map(([name, c]) => {
      const spend = c.costMicros / 1_000_000;
      const ctr = c.impressions > 0 ? c.clicks / c.impressions : 0;
      const cpc = c.clicks > 0 ? spend / c.clicks : 0;
      const roas = spend > 0 ? c.conversionValue / spend : 0;
      return {
        name,
        spend: Math.round(spend * 100) / 100,
        clicks: c.clicks,
        impressions: c.impressions,
        conversions: Math.round(c.conversions * 100) / 100,
        conversion_value: Math.round(c.conversionValue * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        ctr: Math.round(ctr * 10000) / 10000,
        cpc: Math.round(cpc * 100) / 100,
      };
    });

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
    total_conversion_value_30d: Math.round(totalConversionValue * 100) / 100,
    roas_30d: Math.round(roas30d * 100) / 100,
    conversion_rate_30d: Math.round(conversionRate30d * 10000) / 10000,
    top_campaigns: topCampaigns,
  };
}
