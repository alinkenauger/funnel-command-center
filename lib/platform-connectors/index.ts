export * from "./types";
export { fetchMailchimpMetrics } from "./mailchimp";
export { fetchBigCommerceMetrics } from "./bigcommerce";
export { fetchGoogleAnalyticsMetrics } from "./google-analytics";
export { fetchGoogleAdsMetrics } from "./google-ads";

import { fetchMailchimpMetrics } from "./mailchimp";
import { fetchBigCommerceMetrics } from "./bigcommerce";
import { fetchGoogleAnalyticsMetrics } from "./google-analytics";
import { fetchGoogleAdsMetrics } from "./google-ads";
import type {
  StoredPlatformCredentials,
  StoredPlatformMetrics,
  AllPlatformStatuses,
  MailchimpMetrics,
  BigCommerceMetrics,
  GoogleAnalyticsMetrics,
  GoogleAdsMetrics,
} from "./types";

// Fetch all connected platforms concurrently, returning whatever succeeds
export async function fetchAllPlatformMetrics(
  creds: StoredPlatformCredentials
): Promise<StoredPlatformMetrics> {
  const results: StoredPlatformMetrics = {};

  const tasks: Promise<void>[] = [];

  if (creds.mailchimp) {
    tasks.push(
      fetchMailchimpMetrics(creds.mailchimp)
        .then((m) => { results.mailchimp = m; })
        .catch(() => {/* silently skip failed platforms */})
    );
  }
  if (creds.bigcommerce) {
    tasks.push(
      fetchBigCommerceMetrics(creds.bigcommerce)
        .then((m) => { results.bigcommerce = m; })
        .catch(() => {})
    );
  }
  if (creds.google_analytics) {
    tasks.push(
      fetchGoogleAnalyticsMetrics(creds.google_analytics)
        .then((m) => { results.google_analytics = m; })
        .catch(() => {})
    );
  }
  if (creds.google_ads) {
    tasks.push(
      fetchGoogleAdsMetrics(creds.google_ads)
        .then((m) => { results.google_ads = m; })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
  results.last_synced_at = new Date().toISOString();
  return results;
}

// Build platform status summary for UI
export function buildPlatformStatuses(
  creds: StoredPlatformCredentials,
  metrics: StoredPlatformMetrics
): AllPlatformStatuses {
  const fmt = (n: number, type: "pct" | "usd" | "num" | "k") => {
    if (type === "pct") return `${(n * 100).toFixed(1)}%`;
    if (type === "usd") return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
    if (type === "k")
      return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
    return n.toLocaleString();
  };

  const mailchimpPreview = (m: MailchimpMetrics) => ({
    "List size": fmt(m.list_size, "k"),
    "Open rate": fmt(m.open_rate, "pct"),
    "CTOR": fmt(m.click_to_open_rate, "pct"),
    "Growth (30d)": `+${m.new_subscribers_30d} / -${m.lost_subscribers_30d}`,
    "Automations": String(m.automation_count),
  });

  const bcPreview = (m: BigCommerceMetrics) => ({
    "Revenue (30d)": fmt(m.total_revenue_30d, "usd"),
    "Orders (30d)": fmt(m.total_orders_30d, "num"),
    AOV: fmt(m.aov_30d, "usd"),
  });

  const gaPreview = (m: GoogleAnalyticsMetrics) => ({
    "Sessions (30d)": fmt(m.monthly_sessions, "k"),
    "Bounce rate": fmt(m.bounce_rate, "pct"),
    "Top channel": m.top_channel,
  });

  const gadsPreview = (m: GoogleAdsMetrics) => ({
    "Spend (30d)": fmt(m.total_spend_30d, "usd"),
    "Clicks (30d)": fmt(m.total_clicks_30d, "k"),
    CTR: fmt(m.avg_ctr, "pct"),
  });

  return {
    mailchimp: {
      connected: !!creds.mailchimp,
      last_synced: metrics.mailchimp?.fetched_at,
      preview: metrics.mailchimp ? mailchimpPreview(metrics.mailchimp) : undefined,
    },
    bigcommerce: {
      connected: !!creds.bigcommerce,
      last_synced: metrics.bigcommerce?.fetched_at,
      preview: metrics.bigcommerce ? bcPreview(metrics.bigcommerce) : undefined,
    },
    google_analytics: {
      connected: !!creds.google_analytics,
      last_synced: metrics.google_analytics?.fetched_at,
      preview: metrics.google_analytics ? gaPreview(metrics.google_analytics) : undefined,
    },
    google_ads: {
      connected: !!creds.google_ads,
      last_synced: metrics.google_ads?.fetched_at,
      preview: metrics.google_ads ? gadsPreview(metrics.google_ads) : undefined,
    },
  };
}

// Build a plain-text summary of all platform metrics for injection into Claude prompts
export function buildPlatformMetricsSummary(metrics: StoredPlatformMetrics): string {
  const lines: string[] = ["## Live Platform Metrics (real-time API data)\n"];

  if (metrics.mailchimp) {
    const m = metrics.mailchimp;
    lines.push(
      `### Mailchimp (Email Marketing)`,
      `- List: "${m.list_name}" — ${m.list_size.toLocaleString()} subscribers`,
      `- Average open rate (last 30d campaigns): ${(m.open_rate * 100).toFixed(1)}%`,
      `- Average click rate: ${(m.click_rate * 100).toFixed(1)}%`,
      `- Click-to-open rate (CTOR): ${(m.click_to_open_rate * 100).toFixed(1)}%`,
      `- Unsubscribe rate: ${(m.unsubscribe_rate * 100).toFixed(2)}%`,
      `- Hard bounce rate: ${(m.bounce_rate_hard * 100).toFixed(2)}%`,
      `- Campaigns sent in last 30 days: ${m.campaign_count_30d}`,
      `- Email-attributed revenue (last 30d): $${m.email_revenue_30d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- New subscribers (last month): ${m.new_subscribers_30d.toLocaleString()} | Lost: ${m.lost_subscribers_30d.toLocaleString()} | Net growth rate: ${(m.list_growth_rate * 100).toFixed(2)}%`,
      `- Active automations/flows: ${m.automation_count}`,
    );

    if (m.automations.length > 0) {
      lines.push(`- Automation details:`);
      for (const a of m.automations) {
        lines.push(
          `  - "${a.title}" — open ${(a.open_rate * 100).toFixed(1)}%, click ${(a.click_rate * 100).toFixed(1)}%`
        );
      }
    }

    if (m.top_campaigns.length > 0) {
      lines.push(
        `- Top-performing campaigns (≥20% above avg open rate, sorted by open rate):`
      );
      for (const c of m.top_campaigns) {
        const sentDate = c.send_time ? new Date(c.send_time).toLocaleDateString() : "?";
        const revNote = c.revenue > 0 ? ` | revenue $${c.revenue.toLocaleString()}` : "";
        lines.push(
          `  - "${c.subject}" (${sentDate}) — open ${(c.open_rate * 100).toFixed(1)}%, CTOR ${(c.ctor * 100).toFixed(1)}%${revNote}`
        );
      }
    }

    lines.push(``);
  }

  if (metrics.bigcommerce) {
    const m = metrics.bigcommerce;
    lines.push(
      `### BigCommerce (Ecommerce)`,
      `- Revenue last 30 days: $${m.total_revenue_30d.toLocaleString()} ${m.currency}`,
      `- Orders last 30 days: ${m.total_orders_30d.toLocaleString()}`,
      `- Average order value: $${m.aov_30d.toFixed(2)}`,
      `- Total customers: ${m.total_customers.toLocaleString()}`,
      `- New customers last 30 days: ${m.new_customers_30d.toLocaleString()}`,
      `- Repeat purchase rate: ${(m.repeat_purchase_rate * 100).toFixed(1)}%`,
      `- Product catalog size: ${m.product_count.toLocaleString()} products`,
      ``
    );
  }

  if (metrics.google_analytics) {
    const m = metrics.google_analytics;
    lines.push(
      `### Google Analytics 4 (Traffic)`,
      `- Sessions last 30 days: ${m.monthly_sessions.toLocaleString()}`,
      `- Bounce rate: ${(m.bounce_rate * 100).toFixed(1)}%`,
      `- New users last 30 days: ${m.new_users_30d.toLocaleString()}`,
      `- Top traffic channel: ${m.top_channel}`,
      `- Channel breakdown: ${m.channels.map((c) => `${c.channel} (${c.sessions.toLocaleString()})`).join(", ")}`,
      ``
    );
  }

  if (metrics.google_ads) {
    const m = metrics.google_ads;
    lines.push(
      `### Google Ads (Paid Traffic)`,
      `- Total ad spend last 30 days: $${m.total_spend_30d.toLocaleString()}`,
      `- Total clicks: ${m.total_clicks_30d.toLocaleString()}`,
      `- Total impressions: ${m.total_impressions_30d.toLocaleString()}`,
      `- Average CTR: ${(m.avg_ctr * 100).toFixed(2)}%`,
      `- Average CPC: $${m.avg_cpc.toFixed(2)}`,
      `- Conversions: ${m.total_conversions_30d}`,
      `- Cost per conversion: $${m.cost_per_conversion.toFixed(2)}`,
      ``
    );
  }

  if (lines.length === 1) {
    return ""; // No platforms connected
  }

  lines.push(
    `Note: The above are live metrics fetched directly from integrated platforms. ` +
      `These are authoritative data points — use them to grade the relevant funnel stages with HIGH confidence.`
  );

  return lines.join("\n");
}
