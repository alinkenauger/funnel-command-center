// ── Platform Credential Types ─────────────────────────────────────────────────

export interface MailchimpCredentials {
  api_key: string;
  list_id?: string; // optional: if empty we auto-pick the largest list
}

export interface BigCommerceCredentials {
  store_hash: string;   // e.g. "abc123" from store-abc123.mybigcommerce.com
  access_token: string; // from BigCommerce API Account
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
  bigcommerce?: BigCommerceCredentials;
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
  open_rate: number;           // avg across last 30d campaigns, 0–1
  click_rate: number;          // 0–1
  click_to_open_rate: number;  // CTOR = clicks / opens, 0–1
  unsubscribe_rate: number;    // 0–1
  bounce_rate_hard: number;    // 0–1
  campaign_count_30d: number;
  email_revenue_30d: number;   // USD, 0 if ecommerce not connected
  new_subscribers_30d: number;
  lost_subscribers_30d: number;
  list_growth_rate: number;    // net % growth (new - lost) / list_size
  automation_count: number;    // active automations
  automations: MailchimpAutomationSummary[];
  top_campaigns: MailchimpCampaignSummary[]; // outlier campaigns sorted by open_rate desc
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

export interface GoogleAnalyticsMetrics {
  platform: "google_analytics";
  fetched_at: string;
  property_id: string;
  monthly_sessions: number;
  bounce_rate: number;          // 0–1
  new_users_30d: number;
  top_channel: string;
  channels: Array<{ channel: string; sessions: number }>;
}

export interface GoogleAdsMetrics {
  platform: "google_ads";
  fetched_at: string;
  customer_id: string;
  total_spend_30d: number;      // USD
  total_clicks_30d: number;
  total_impressions_30d: number;
  avg_ctr: number;              // 0–1
  avg_cpc: number;              // USD
  total_conversions_30d: number;
  cost_per_conversion: number;  // USD
}

export type PlatformMetrics =
  | MailchimpMetrics
  | BigCommerceMetrics
  | GoogleAnalyticsMetrics
  | GoogleAdsMetrics;

export interface StoredPlatformMetrics {
  mailchimp?: MailchimpMetrics;
  bigcommerce?: BigCommerceMetrics;
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
  bigcommerce: PlatformConnectionStatus;
  google_analytics: PlatformConnectionStatus;
  google_ads: PlatformConnectionStatus;
}
