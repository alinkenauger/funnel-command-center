import type { WooCommerceCredentials, WooCommerceMetrics } from "./types";

function basicAuthHeader(key: string, secret: string): string {
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

export async function fetchWooCommerceMetrics(
  creds: WooCommerceCredentials
): Promise<WooCommerceMetrics> {
  const base = creds.store_url.replace(/\/$/, "") + "/wp-json/wc/v3";
  const headers = {
    Authorization: basicAuthHeader(creds.consumer_key, creds.consumer_secret),
    "Content-Type": "application/json",
  };

  // Date helpers for WC API (ISO 8601, UTC)
  const now = new Date();
  const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const after = ago30.toISOString();
  const before = now.toISOString();

  // ── Parallel requests ────────────────────────────────────────────────────────
  const [salesRes, customersRes, newCustomersRes, productsRes, refundsRes, currencyRes] =
    await Promise.all([
      // Sales report for the last 30 days
      fetch(
        `${base}/reports/sales?date_min=${after.slice(0, 10)}&date_max=${before.slice(0, 10)}`,
        { headers }
      ),
      // Total customer count (1 item, read X-WP-Total header)
      fetch(`${base}/customers?per_page=1`, { headers }),
      // New customers in last 30 days
      fetch(`${base}/customers?per_page=1&role=customer&after=${after}`, { headers }),
      // Total product count
      fetch(`${base}/products?per_page=1&status=publish`, { headers }),
      // Refunds in last 30 days (orders endpoint with status=refunded)
      fetch(`${base}/orders?per_page=1&status=refunded&after=${after}&before=${before}`, {
        headers,
      }),
      // Store currency from general settings
      fetch(`${base}/settings/general/woocommerce_currency`, { headers }),
    ]);

  // ── Check primary (sales) response ───────────────────────────────────────────
  if (!salesRes.ok) {
    const err = await salesRes.json().catch(() => ({}));
    throw new Error(
      `WooCommerce API error ${salesRes.status}: ${
        (err as Record<string, unknown>).message ?? salesRes.statusText
      }`
    );
  }

  // ── Parse sales report ───────────────────────────────────────────────────────
  const salesData = await salesRes.json();
  // WC returns an array with one summary object
  const sales = Array.isArray(salesData) ? salesData[0] : salesData;
  const totalOrders = parseInt(String(sales?.total_orders ?? "0"), 10);
  const totalRevenue = parseFloat(String(sales?.gross_sales ?? sales?.net_revenue ?? "0"));
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // ── Parse customer counts from X-WP-Total header ─────────────────────────────
  const totalCustomers = customersRes.ok
    ? parseInt(customersRes.headers.get("X-WP-Total") ?? "0", 10)
    : 0;
  const newCustomers = newCustomersRes.ok
    ? parseInt(newCustomersRes.headers.get("X-WP-Total") ?? "0", 10)
    : 0;

  // ── Parse product count ───────────────────────────────────────────────────────
  const productCount = productsRes.ok
    ? parseInt(productsRes.headers.get("X-WP-Total") ?? "0", 10)
    : 0;

  // ── Parse refund count ────────────────────────────────────────────────────────
  const refundCount = refundsRes.ok
    ? parseInt(refundsRes.headers.get("X-WP-Total") ?? "0", 10)
    : 0;

  // ── Parse currency ────────────────────────────────────────────────────────────
  let currency = "USD";
  if (currencyRes.ok) {
    const currData = await currencyRes.json().catch(() => null);
    if (currData?.value) currency = String(currData.value);
  }

  return {
    platform: "woocommerce",
    fetched_at: new Date().toISOString(),
    store_url: creds.store_url.replace(/\/$/, ""),
    currency,
    total_orders_30d: totalOrders,
    total_revenue_30d: Math.round(totalRevenue * 100) / 100,
    aov_30d: Math.round(aov * 100) / 100,
    total_customers: totalCustomers,
    new_customers_30d: newCustomers,
    product_count: productCount,
    refund_count_30d: refundCount,
  };
}
