import type {
  WooCommerceCredentials,
  WooCommerceMetrics,
  WooCommerceProductSummary,
} from "./types";

function basicAuthHeader(key: string, secret: string): string {
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

/** Parse the WooCommerce reports/sales response.
 *  WC v3 returns an array with one summary object.
 *  The revenue field is `total_sales`, orders is `num_orders`. */
function parseSalesReport(data: unknown): { orders: number; revenue: number } {
  const raw = Array.isArray(data) ? data[0] : data;
  const orders = parseInt(String((raw as Record<string, unknown>)?.num_orders ?? "0"), 10);
  // total_sales is the correct field name (gross_sales / net_revenue do not exist)
  const revenue = parseFloat(
    String((raw as Record<string, unknown>)?.total_sales ?? "0")
  );
  return { orders, revenue };
}

function getTotal(res: Response): number {
  return parseInt(res.headers.get("X-WP-Total") ?? "0", 10);
}

export async function fetchWooCommerceMetrics(
  creds: WooCommerceCredentials
): Promise<WooCommerceMetrics> {
  const base = creds.store_url.replace(/\/$/, "") + "/wp-json/wc/v3";
  const headers = {
    Authorization: basicAuthHeader(creds.consumer_key, creds.consumer_secret),
    "Content-Type": "application/json",
  };

  const now = new Date();
  const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ago365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  // WC reports/sales uses YYYY-MM-DD dates
  const d = (date: Date) => date.toISOString().slice(0, 10);
  // WC orders/customers endpoints use full ISO timestamps
  const ts = (date: Date) => date.toISOString();

  // ── Parallel fetch ──────────────────────────────────────────────────────────
  const [
    sales30Res, sales12mRes,
    customersRes,
    newCust30Res, newCust12mRes,
    productsRes,
    refunds30Res, refunds12mRes,
    currencyRes,
    topSellersRes,
    orders1Res, orders2Res,
  ] = await Promise.all([
    // Sales summary reports
    fetch(`${base}/reports/sales?date_min=${d(ago30)}&date_max=${d(now)}`, { headers }),
    fetch(`${base}/reports/sales?date_min=${d(ago365)}&date_max=${d(now)}`, { headers }),

    // Customer counts (X-WP-Total header)
    fetch(`${base}/customers?per_page=1`, { headers }),
    fetch(`${base}/customers?per_page=1&role=customer&after=${ts(ago30)}`, { headers }),
    fetch(`${base}/customers?per_page=1&role=customer&after=${ts(ago365)}`, { headers }),

    // Product catalog count
    fetch(`${base}/products?per_page=1&status=publish`, { headers }),

    // Refund counts (orders with status=refunded)
    fetch(`${base}/orders?per_page=1&status=refunded&after=${ts(ago30)}&before=${ts(now)}`, { headers }),
    fetch(`${base}/orders?per_page=1&status=refunded&after=${ts(ago365)}&before=${ts(now)}`, { headers }),

    // Store currency
    fetch(`${base}/settings/general/woocommerce_currency`, { headers }),

    // Top sellers by quantity (12 months)
    fetch(`${base}/reports/top_sellers?date_min=${d(ago365)}&date_max=${d(now)}&per_page=15`, { headers }),

    // Completed orders for repeat-purchase analysis (2 pages × 100 = up to 200 orders)
    fetch(
      `${base}/orders?status=completed&after=${ts(ago365)}&per_page=100&page=1` +
        `&_fields=id,customer_id,date_created,line_items`,
      { headers }
    ),
    fetch(
      `${base}/orders?status=completed&after=${ts(ago365)}&per_page=100&page=2` +
        `&_fields=id,customer_id,date_created,line_items`,
      { headers }
    ),
  ]);

  // ── Error check on primary endpoint ────────────────────────────────────────
  if (!sales30Res.ok) {
    const err = await sales30Res.json().catch(() => ({}));
    throw new Error(
      `WooCommerce API error ${sales30Res.status}: ${
        (err as Record<string, unknown>).message ?? sales30Res.statusText
      }`
    );
  }

  // ── Parse sales reports ──────────────────────────────────────────────────
  const { orders: orders30, revenue: revenue30 } = parseSalesReport(
    await sales30Res.json().catch(() => ({}))
  );
  const aov30 = orders30 > 0 ? revenue30 / orders30 : 0;

  let orders12m = 0, revenue12m = 0, aov12m = 0;
  if (sales12mRes.ok) {
    const d12 = await sales12mRes.json().catch(() => null);
    if (d12) {
      const p = parseSalesReport(d12);
      orders12m = p.orders;
      revenue12m = p.revenue;
      aov12m = orders12m > 0 ? revenue12m / orders12m : 0;
    }
  }

  // ── Customer counts ──────────────────────────────────────────────────────
  const totalCustomers = customersRes.ok ? getTotal(customersRes) : 0;
  const newCust30 = newCust30Res.ok ? getTotal(newCust30Res) : 0;
  const newCust12m = newCust12mRes.ok ? getTotal(newCust12mRes) : 0;

  // ── Product and refund counts ────────────────────────────────────────────
  const productCount = productsRes.ok ? getTotal(productsRes) : 0;
  const refunds30 = refunds30Res.ok ? getTotal(refunds30Res) : 0;
  const refunds12m = refunds12mRes.ok ? getTotal(refunds12mRes) : 0;

  // ── Currency ─────────────────────────────────────────────────────────────
  let currency = "USD";
  if (currencyRes.ok) {
    const currData = await currencyRes.json().catch(() => null);
    if (currData?.value) currency = String(currData.value);
  }

  // ── Top products ─────────────────────────────────────────────────────────
  const topProducts: WooCommerceProductSummary[] = [];
  if (topSellersRes.ok) {
    const raw = await topSellersRes.json().catch(() => []);
    if (Array.isArray(raw)) {
      for (const item of raw.slice(0, 15)) {
        topProducts.push({
          product_id: Number(item.product_id ?? item.id ?? 0),
          name: String(item.title ?? item.name ?? `Product ${item.product_id}`),
          quantity_sold: parseInt(String(item.quantity ?? "0"), 10),
          revenue: 0, // not returned by top_sellers endpoint
        });
      }
    }
  }

  // ── Repeat-purchase analysis ──────────────────────────────────────────────
  interface OrderLine { product_id: number; name: string; quantity: number }
  interface Order { id: number; customer_id: number; date_created: string; line_items: OrderLine[] }

  const allOrders: Order[] = [];
  for (const res of [orders1Res, orders2Res]) {
    if (res.ok) {
      const data = await res.json().catch(() => []);
      if (Array.isArray(data)) allOrders.push(...(data as Order[]));
    }
  }

  // Group by customer (skip guests where customer_id = 0)
  const byCustomer = new Map<number, Order[]>();
  for (const order of allOrders) {
    if (!order.customer_id) continue;
    if (!byCustomer.has(order.customer_id)) byCustomer.set(order.customer_id, []);
    byCustomer.get(order.customer_id)!.push(order);
  }

  // Sort each customer's orders by date ascending, then harvest 2nd-order products
  const secondPurchaseCounts = new Map<number, { name: string; count: number }>();
  let repeatBuyers = 0;
  for (const orders of Array.from(byCustomer.values())) {
    if (orders.length < 2) continue;
    repeatBuyers++;
    orders.sort(
      (a, b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime()
    );
    for (const item of orders[1].line_items ?? []) {
      const pid = item.product_id;
      if (!pid) continue;
      const existing = secondPurchaseCounts.get(pid);
      if (existing) {
        existing.count++;
      } else {
        secondPurchaseCounts.set(pid, { name: item.name ?? `Product ${pid}`, count: 1 });
      }
    }
  }

  const repeatPurchaseRate =
    byCustomer.size > 0 ? repeatBuyers / byCustomer.size : 0;

  const repeatProducts: WooCommerceProductSummary[] = Array.from(
    secondPurchaseCounts.entries()
  )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([pid, { name, count }]) => ({
      product_id: pid,
      name,
      quantity_sold: count,
      revenue: 0,
    }));

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    platform: "woocommerce",
    fetched_at: new Date().toISOString(),
    store_url: creds.store_url.replace(/\/$/, ""),
    currency,
    total_orders_30d: orders30,
    total_revenue_30d: Math.round(revenue30 * 100) / 100,
    aov_30d: Math.round(aov30 * 100) / 100,
    new_customers_30d: newCust30,
    refund_count_30d: refunds30,
    total_orders_12m: orders12m,
    total_revenue_12m: Math.round(revenue12m * 100) / 100,
    aov_12m: Math.round(aov12m * 100) / 100,
    new_customers_12m: newCust12m,
    refund_count_12m: refunds12m,
    total_customers: totalCustomers,
    product_count: productCount,
    repeat_purchase_rate: Math.round(repeatPurchaseRate * 1000) / 1000,
    top_products_12m: topProducts,
    repeat_purchase_products: repeatProducts,
  };
}
