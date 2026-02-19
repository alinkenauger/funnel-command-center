// ── Platform Credential Types ─────────────────────────────────────────────────

export interface MailchimpCredentials {
  api_key: string;
  list_id?: string; // optional: if empty we auto-pick the largest list
}

export interface BigCommerceCredentials {
  store_hash: string;   // e.g. "abc123" from store-abc123.mybigcommerce.com
  access_token: string; // from BigCommerce API Account
}

export interface WooCommerceCredentials {
  store_url: string;      // e.g. "https://yourstore.com"
  consumer_key: string;   // ck_... from WooCommerce → Settings → Advanced → REST API
  consumer_secret: string; // cs_...
}

export interface GoogleAnalyticsCredentials {
  property_id: string;          // e.g. "123456789" (numeric GA4 property ID)
  service_account_json: string; // full contents of the downloaded JSON key file
}

export interface GoogleAdsCredentials {
  customer_id: string;    // 10-digit customer ID without dashes
  developer_token: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  login_customer_id?: string; // MCC / manager account ID (optional)
}

export interface StoredPlatformCredentials {
  mailchimp?: MailchimpCredentials;
  bigcommerce?: BigCommerceCredentials; // kept so bigcommerce.ts still compiles
  woocommerce?: WooCommerceCredentials;
  google_analytics?: GoogleAnalyticsCredentials;
  google_ads?: GoogleAdsCredentials;
}

// ── Normalized Metrics Returned by Each Connector ────────────────────────────

export interface MailchimpCampaignSummary {
  id: string;
  subject: string;
  send_time: string;
  open_rate: number;   // 0–1
  click_rate: number;  // 0–1
  ctor: number;        // click-to-open rate 0–1
  revenue: number;     // email-attributed revenue (USD), 0 if not tracked
  unique_opens: number;
  unique_clicks: number;
}

export interface MailchimpAutomationSummary {
  id: string;
  title: string;
  status: string;
  open_rate: number;  // 0–1
  click_rate: number; // 0–1
}

export interface MailchimpMetrics {
  platform: "mailchimp";
  fetched_at: string;
  list_name: string;
  list_id: string;
  list_size: number;
  open_rate: number;              // avg across last 30d campaigns, 0–1
  click_rate: number;             // 0–1
  click_to_open_rate: number;     // CTOR = clicks / opens, 0–1
  unsubscribe_rate: number;       // 0–1 all-time list stat
  bounce_rate_hard: number;       // 0–1 all-time list stat
  soft_bounce_rate: number;       // 0–1 all-time list stat
  cleaned_count: number;          // total addresses cleaned (hard bounced/abuse)
  total_contacts: number;         // total incl. unsubscribed
  campaign_count_30d: number;
  email_revenue_30d: number;      // USD, 0 if ecommerce not connected
  new_subscribers_30d: number;
  lost_subscribers_30d: number;
  list_growth_rate: number;       // net % growth (new - lost) / list_size
  avg_sub_rate_monthly: number;   // avg new subscribers added per month (all-time stat)
  list_rating: number;            // Mailchimp quality score 1–5
  automation_count: number;       // active automations
  automations: MailchimpAutomationSummary[];
  top_campaigns: MailchimpCampaignSummary[]; // outlier campaigns sorted by open_rate desc
  growth_history_3m: Array<{ month: string; subscribed: number; unsubscribed: number }>;
}

export interface BigCommerceMetrics {
  platform: "bigcommerce";
  fetched_at: string;
  currency: string;
  total_orders_30d: number;
  total_revenue_30d: number;
  aov_30d: number;
  total_customers: number;
  new_customers_30d: number;
  repeat_purchase_rate: number; // 0–1
  product_count: number;
}

export interface WooCommerceProductSummary {
  product_id: number;
  name: string;
  quantity_sold: number;  // units sold (top sellers) or # customers (repeat purchase)
  revenue: number;        // USD; 0 if unavailable from the endpoint
}

export interface WooCommerceMetrics {
  platform: "woocommerce";
  fetched_at: string;
  store_url: string;
  currency: string;
  // 30-day window
  total_orders_30d: number;
  total_revenue_30d: number;
  aov_30d: number;
  new_customers_30d: number;
  refund_count_30d: number;
  // 12-month window
  total_orders_12m: number;
  total_revenue_12m: number;
  aov_12m: number;
  new_customers_12m: number;
  refund_count_12m: number;
  // All-time totals
  total_customers: number;
  product_count: number;
  repeat_purchase_rate: number;       // 0–1, derived from 12m order sample
  // Product intelligence
  top_products_12m: WooCommerceProductSummary[];       // by units sold
  repeat_purchase_products: WooCommerceProductSummary[]; // most common 2nd purchases
}

export interface GoogleAnalyticsMetrics {
  platform: "google_analytics";
  fetched_at: string;
  property_id: string;
  // 30-day
  monthly_sessions: number;
  bounce_rate: number;              // 0–1
  engagement_rate: number;          // 0–1 (GA4 engaged sessions / total sessions)
  avg_session_duration_sec: number; // average seconds per session
  page_views_30d: number;
  new_users_30d: number;
  // 12-month
  sessions_12m: number;
  new_users_12m: number;
  // Breakdowns
  top_channel: string;
  channels: Array<{ channel: string; sessions: number }>;
  device_breakdown: Array<{ device: string; sessions: number }>;
  top_landing_pages: Array<{ page: string; sessions: number; bounce_rate: number }>;
}

export interface GoogleAdsCampaignSummary {
  name: string;
  spend: number;            // USD
  clicks: number;
  impressions: number;
  conversions: number;
  conversion_value: number; // USD revenue tracked (0 if not set up)
  roas: number;             // conversion_value / spend (0 if no value tracked)
  ctr: number;              // 0–1
  cpc: number;              // USD
}

export interface GoogleAdsMetrics {
  platform: "google_ads";
  fetched_at: string;
  customer_id: string;
  // Aggregate 30-day totals
  total_spend_30d: number;            // USD
  total_clicks_30d: number;
  total_impressions_30d: number;
  avg_ctr: number;                    // 0–1
  avg_cpc: number;                    // USD
  total_conversions_30d: number;
  cost_per_conversion: number;        // USD
  total_conversion_value_30d: number; // USD revenue tracked via Google Ads
  roas_30d: number;                   // total_conversion_value / total_spend
  conversion_rate_30d: number;        // total_conversions / total_clicks (0–1)
  // Campaign breakdown
  top_campaigns: GoogleAdsCampaignSummary[]; // top 10 by spend
}

export type PlatformMetrics =
  | MailchimpMetrics
  | BigCommerceMetrics
  | WooCommerceMetrics
  | GoogleAnalyticsMetrics
  | GoogleAdsMetrics;


export interface StoredPlatformMetrics {
  mailchimp?: MailchimpMetrics;
  bigcommerce?: BigCommerceMetrics; // kept for backward compat with cached data
  woocommerce?: WooCommerceMetrics;
  google_analytics?: GoogleAnalyticsMetrics;
  google_ads?: GoogleAdsMetrics;
  last_synced_at?: string;
}

// ── Connection Status for UI ─────────────────────────────────────────────────

export interface PlatformConnectionStatus {
  connected: boolean;
  last_synced?: string;
  error?: string;
  preview?: Record<string, string>; // key metrics as formatted strings
}

export interface AllPlatformStatuses {
  mailchimp: PlatformConnectionStatus;
  woocommerce: PlatformConnectionStatus;
  google_analytics: PlatformConnectionStatus;
  google_ads: PlatformConnectionStatus;
}
