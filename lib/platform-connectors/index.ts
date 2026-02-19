export * from "./types";
export { fetchMailchimpMetrics } from "./mailchimp";
export { fetchBigCommerceMetrics } from "./bigcommerce";
export { fetchWooCommerceMetrics } from "./woocommerce";
export { fetchGoogleAnalyticsMetrics } from "./google-analytics";
export { fetchGoogleAdsMetrics } from "./google-ads";

import { fetchMailchimpMetrics } from "./mailchimp";
import { fetchWooCommerceMetrics } from "./woocommerce";
import { fetchGoogleAnalyticsMetrics } from "./google-analytics";
import { fetchGoogleAdsMetrics } from "./google-ads";
import type {
  StoredPlatformCredentials,
  StoredPlatformMetrics,
  AllPlatformStatuses,
  MailchimpMetrics,
  WooCommerceMetrics,
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
  if (creds.woocommerce) {
    tasks.push(
      fetchWooCommerceMetrics(creds.woocommerce)
        .then((m) => { results.woocommerce = m; })
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
  const fmt = (n: number | undefined | null, type: "pct" | "usd" | "num" | "k" | "x") => {
    if (n == null || !isFinite(n)) return "—";
    if (type === "pct") return `${(n * 100).toFixed(1)}%`;
    if (type === "usd") return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
    if (type === "x") return `${n.toFixed(2)}x`;
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
    "List rating": `${m.list_rating}/5`,
  });

  const wooPreview = (m: WooCommerceMetrics) => ({
    "Revenue (30d)": fmt(m.total_revenue_30d, "usd"),
    "Orders (30d)": fmt(m.total_orders_30d, "num"),
    AOV: fmt(m.aov_30d, "usd"),
    "Customers": fmt(m.total_customers, "k"),
    "Repeat rate": fmt(m.repeat_purchase_rate, "pct"),
    "Revenue (12m)": fmt(m.total_revenue_12m, "usd"),
  });

  const gaPreview = (m: GoogleAnalyticsMetrics) => ({
    "Sessions (30d)": fmt(m.monthly_sessions, "k"),
    "Bounce rate": fmt(m.bounce_rate, "pct"),
    "Engagement rate": fmt(m.engagement_rate, "pct"),
    "Avg session": `${m.avg_session_duration_sec}s`,
    "Top channel": m.top_channel,
  });

  const gadsPreview = (m: GoogleAdsMetrics) => ({
    "Spend (30d)": fmt(m.total_spend_30d, "usd"),
    "Clicks (30d)": fmt(m.total_clicks_30d, "k"),
    CTR: fmt(m.avg_ctr, "pct"),
    ROAS: fmt(m.roas_30d, "x"),
    "Conv. rate": fmt(m.conversion_rate_30d, "pct"),
  });

  return {
    mailchimp: {
      connected: !!creds.mailchimp,
      last_synced: metrics.mailchimp?.fetched_at,
      preview: metrics.mailchimp ? mailchimpPreview(metrics.mailchimp) : undefined,
    },
    woocommerce: {
      connected: !!creds.woocommerce,
      last_synced: metrics.woocommerce?.fetched_at,
      preview: metrics.woocommerce ? wooPreview(metrics.woocommerce) : undefined,
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
      `- List: "${m.list_name}" — ${m.list_size.toLocaleString()} active subscribers (${m.total_contacts.toLocaleString()} total contacts incl. unsubscribed)`,
      `- Mailchimp list quality rating: ${m.list_rating}/5`,
      `- Average open rate (last 30d campaigns): ${(m.open_rate * 100).toFixed(1)}%`,
      `- Average click rate: ${(m.click_rate * 100).toFixed(1)}%`,
      `- Click-to-open rate (CTOR): ${(m.click_to_open_rate * 100).toFixed(1)}%`,
      `- Unsubscribe rate: ${(m.unsubscribe_rate * 100).toFixed(2)}%`,
      `- Hard bounce rate: ${(m.bounce_rate_hard * 100).toFixed(2)}% | Soft bounce rate: ${(m.soft_bounce_rate * 100).toFixed(2)}%`,
      `- Cleaned addresses (hard bounced / abuse complaints, all-time): ${m.cleaned_count.toLocaleString()}`,
      `- Campaigns sent in last 30 days: ${m.campaign_count_30d}`,
      `- Email-attributed revenue (last 30d): $${m.email_revenue_30d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- New subscribers (last month): ${m.new_subscribers_30d.toLocaleString()} | Lost: ${m.lost_subscribers_30d.toLocaleString()} | Net growth rate: ${(m.list_growth_rate * 100).toFixed(2)}%`,
      `- Avg new subscribers added per month (all-time): ${m.avg_sub_rate_monthly.toLocaleString()}`,
      `- Active automations/flows: ${m.automation_count}`,
    );

    if (m.growth_history_3m.length > 0) {
      lines.push(`- 3-month subscriber growth history:`);
      for (const g of m.growth_history_3m) {
        lines.push(
          `  - ${g.month}: +${g.subscribed.toLocaleString()} subscribed / -${g.unsubscribed.toLocaleString()} unsubscribed`
        );
      }
    }

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

  if (metrics.woocommerce) {
    const m = metrics.woocommerce;
    lines.push(
      `### WooCommerce (Ecommerce)`,
      `- Store: ${m.store_url} | Currency: ${m.currency}`,
      `── 30-Day Window ──`,
      `- Revenue: ${m.currency} ${m.total_revenue_30d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- Orders: ${m.total_orders_30d.toLocaleString()} | AOV: ${m.currency} ${m.aov_30d.toFixed(2)}`,
      `- New customers: ${m.new_customers_30d.toLocaleString()} | Refunds: ${m.refund_count_30d.toLocaleString()}`,
      `── 12-Month Window ──`,
      `- Revenue: ${m.currency} ${m.total_revenue_12m.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `- Orders: ${m.total_orders_12m.toLocaleString()} | AOV: ${m.currency} ${m.aov_12m.toFixed(2)}`,
      `- New customers: ${m.new_customers_12m.toLocaleString()} | Refunds: ${m.refund_count_12m.toLocaleString()}`,
      `── All-Time ──`,
      `- Total customers: ${m.total_customers.toLocaleString()} | Product catalog: ${m.product_count.toLocaleString()} products`,
      `- Repeat purchase rate (% of 12m buyers who purchased again): ${(m.repeat_purchase_rate * 100).toFixed(1)}%`,
    );

    if (m.top_products_12m.length > 0) {
      lines.push(`- Top products by units sold (last 12 months):`);
      for (const p of m.top_products_12m) {
        lines.push(`  - "${p.name}" — ${p.quantity_sold.toLocaleString()} units`);
      }
    }

    if (m.repeat_purchase_products.length > 0) {
      lines.push(`- Most common products bought as a customer's 2nd purchase:`);
      for (const p of m.repeat_purchase_products) {
        lines.push(`  - "${p.name}" — ${p.quantity_sold.toLocaleString()} repeat buyers`);
      }
    }

    lines.push(``);
  }

  if (metrics.google_analytics) {
    const m = metrics.google_analytics;
    lines.push(
      `### Google Analytics 4 (Traffic)`,
      `── 30-Day Window ──`,
      `- Sessions: ${m.monthly_sessions.toLocaleString()} | Page views: ${m.page_views_30d.toLocaleString()}`,
      `- New users: ${m.new_users_30d.toLocaleString()}`,
      `- Bounce rate: ${(m.bounce_rate * 100).toFixed(1)}% | Engagement rate: ${(m.engagement_rate * 100).toFixed(1)}%`,
      `- Average session duration: ${m.avg_session_duration_sec}s`,
      `── 12-Month Window ──`,
      `- Sessions: ${m.sessions_12m.toLocaleString()} | New users: ${m.new_users_12m.toLocaleString()}`,
      `── Traffic Sources ──`,
      `- Top traffic channel: ${m.top_channel}`,
      `- Channel breakdown: ${m.channels.map((c) => `${c.channel} (${c.sessions.toLocaleString()})`).join(", ")}`,
    );

    if (m.device_breakdown.length > 0) {
      lines.push(
        `- Device breakdown: ${m.device_breakdown.map((d) => `${d.device} (${d.sessions.toLocaleString()})`).join(", ")}`
      );
    }

    if (m.top_landing_pages.length > 0) {
      lines.push(`- Top landing pages (by sessions, last 30d):`);
      for (const p of m.top_landing_pages.slice(0, 5)) {
        lines.push(
          `  - ${p.page} — ${p.sessions.toLocaleString()} sessions, bounce rate ${(p.bounce_rate * 100).toFixed(1)}%`
        );
      }
    }

    lines.push(``);
  }

  if (metrics.google_ads) {
    const m = metrics.google_ads;
    lines.push(
      `### Google Ads (Paid Traffic)`,
      `── 30-Day Aggregate ──`,
      `- Total ad spend: $${m.total_spend_30d.toLocaleString()}`,
      `- Clicks: ${m.total_clicks_30d.toLocaleString()} | Impressions: ${m.total_impressions_30d.toLocaleString()}`,
      `- Avg CTR: ${(m.avg_ctr * 100).toFixed(2)}% | Avg CPC: $${m.avg_cpc.toFixed(2)}`,
      `- Conversions: ${m.total_conversions_30d.toLocaleString()} | Conversion rate: ${(m.conversion_rate_30d * 100).toFixed(2)}%`,
      `- Cost per conversion: $${m.cost_per_conversion.toFixed(2)}`,
      `- Conversion value: $${m.total_conversion_value_30d.toLocaleString()} | ROAS: ${m.roas_30d.toFixed(2)}x`,
    );

    if (m.top_campaigns.length > 0) {
      lines.push(`- Top campaigns by spend:`);
      for (const c of m.top_campaigns) {
        const roasNote = c.roas > 0 ? ` | ROAS ${c.roas.toFixed(2)}x` : "";
        const convNote = c.conversions > 0 ? ` | ${c.conversions} conv.` : "";
        lines.push(
          `  - "${c.name}" — $${c.spend.toLocaleString()} spend, ${c.clicks.toLocaleString()} clicks, CTR ${(c.ctr * 100).toFixed(2)}%${convNote}${roasNote}`
        );
      }
    }

    lines.push(``);
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
