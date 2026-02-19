import type { MailchimpCredentials, MailchimpMetrics } from "./types";

function basicAuthHeader(apiKey: string): string {
  return "Basic " + Buffer.from(`user:${apiKey}`).toString("base64");
}

function serverPrefix(apiKey: string): string {
  // API keys look like "abc123def456-us21" — last segment after dash is the DC
  const parts = apiKey.split("-");
  return parts[parts.length - 1];
}

export async function fetchMailchimpMetrics(
  creds: MailchimpCredentials
): Promise<MailchimpMetrics> {
  const dc = serverPrefix(creds.api_key);
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const headers = { Authorization: basicAuthHeader(creds.api_key) };

  // Resolve list ID
  let listId = creds.list_id ?? "";
  let listName = "";

  if (!listId) {
    const res = await fetch(
      `${base}/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count`,
      { headers }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Mailchimp API error ${res.status}: ${(err as Record<string, string>).detail ?? res.statusText}`
      );
    }
    const data = await res.json();
    const lists: Array<{ id: string; name: string; stats?: { member_count?: number } }> =
      data.lists ?? [];
    if (!lists.length) throw new Error("No Mailchimp lists found in this account");
    // Pick the list with the most members
    lists.sort((a, b) => (b.stats?.member_count ?? 0) - (a.stats?.member_count ?? 0));
    listId = lists[0].id;
    listName = lists[0].name;
  }

  // Fetch list stats
  const listRes = await fetch(`${base}/lists/${listId}`, { headers });
  if (!listRes.ok) throw new Error(`Mailchimp list fetch error: ${listRes.status}`);
  const listData = await listRes.json();
  if (!listName) listName = listData.name ?? listId;
  const stats = listData.stats ?? {};

  // Recent campaign average rates (last 30 days)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const campRes = await fetch(
    `${base}/campaigns?list_id=${listId}&since_send_time=${since}&status=sent&count=50`,
    { headers }
  );
  const campData = campRes.ok ? await campRes.json() : { campaigns: [] };
  const campaigns: Array<{ report_summary?: { open_rate?: number; click_rate?: number } }> =
    campData.campaigns ?? [];

  let sumOpen = 0,
    sumClick = 0;
  for (const c of campaigns) {
    sumOpen += c.report_summary?.open_rate ?? 0;
    sumClick += c.report_summary?.click_rate ?? 0;
  }
  const n = campaigns.length;
  const openRate = n > 0 ? sumOpen / n : (stats.avg_open_rate ?? 0);
  const clickRate = n > 0 ? sumClick / n : (stats.avg_click_rate ?? 0);

  return {
    platform: "mailchimp",
    fetched_at: new Date().toISOString(),
    list_name: listName,
    list_id: listId,
    list_size: stats.member_count ?? 0,
    open_rate: openRate,
    click_rate: clickRate,
    unsubscribe_rate: stats.unsubscribe_rate ?? 0,
    bounce_rate_hard: stats.hard_bounce_rate ?? 0,
    campaign_count_30d: n,
  };
}
