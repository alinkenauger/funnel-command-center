import type { BigCommerceCredentials, BigCommerceMetrics } from "./types";

interface BCOrder {
  total_inc_tax: string;
  currency_code: string;
  customer_id: number;
  date_created: string;
}

export async function fetchBigCommerceMetrics(
  creds: BigCommerceCredentials
): Promise<BigCommerceMetrics> {
  const base = `https://api.bigcommerce.com/stores/${creds.store_hash}`;
  const headers = {
    "X-Auth-Token": creds.access_token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Fetch last 30 days of completed orders (status 10 = Completed, also try all)
  const ordersRes = await fetch(
    `${base}/v2/orders?min_date_created=${thirtyDaysAgo}&limit=250&sort=date_created:desc`,
    { headers }
  );
  if (!ordersRes.ok && ordersRes.status !== 204) {
    const err = await ordersRes.text();
    throw new Error(`BigCommerce orders API error ${ordersRes.status}: ${err}`);
  }

  let orders: BCOrder[] = [];
  try {
    orders = ordersRes.status !== 204 ? await ordersRes.json() : [];
    if (!Array.isArray(orders)) orders = [];
  } catch {
    orders = [];
  }

  const totalRevenue = orders.reduce(
    (sum, o) => sum + parseFloat(o.total_inc_tax ?? "0"),
    0
  );
  const aov = orders.length > 0 ? totalRevenue / orders.length : 0;
  const currency = orders[0]?.currency_code ?? "USD";

  // Count unique returning customers (customer_id > 0 and seen more than once)
  const customerOrderCounts = new Map<number, number>();
  for (const o of orders) {
    if (o.customer_id > 0) {
      customerOrderCounts.set(o.customer_id, (customerOrderCounts.get(o.customer_id) ?? 0) + 1);
    }
  }
  const returningCustomerIds = Array.from(customerOrderCounts.values()).filter((c) => c > 1).length;
  const repeatRate = orders.length > 0 ? returningCustomerIds / orders.length : 0;

  // Total customer count
  const custCountRes = await fetch(`${base}/v2/customers/count`, { headers });
  const custCountData = custCountRes.ok ? await custCountRes.json() : { count: 0 };
  const totalCustomers: number = custCountData.count ?? 0;

  // New customers in period
  const newCustRes = await fetch(
    `${base}/v2/customers?min_date_created=${thirtyDaysAgo}&limit=1`,
    { headers }
  );
  const newCustomerCount = parseInt(newCustRes.headers.get("X-Total") ?? "0", 10);

  // Product count
  const prodRes = await fetch(`${base}/v2/products/count`, { headers });
  const prodData = prodRes.ok ? await prodRes.json() : { count: 0 };

  return {
    platform: "bigcommerce",
    fetched_at: new Date().toISOString(),
    currency,
    total_orders_30d: orders.length,
    total_revenue_30d: Math.round(totalRevenue * 100) / 100,
    aov_30d: Math.round(aov * 100) / 100,
    total_customers: totalCustomers,
    new_customers_30d: newCustomerCount,
    repeat_purchase_rate: Math.round(repeatRate * 1000) / 1000,
    product_count: prodData.count ?? 0,
  };
}
