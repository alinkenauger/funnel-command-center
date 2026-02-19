import type {
  MailchimpCredentials,
  MailchimpMetrics,
  MailchimpCampaignSummary,
  MailchimpAutomationSummary,
} from "./types";

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

  // ── Step 1: Resolve list ID ─────────────────────────────────────────────────
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
    lists.sort((a, b) => (b.stats?.member_count ?? 0) - (a.stats?.member_count ?? 0));
    listId = lists[0].id;
    listName = lists[0].name;
  }

  // ── Step 2: Fetch all data in parallel ──────────────────────────────────────
  const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [listRes, campRes, growthRes, automationsRes] = await Promise.all([
    // Full list stats
    fetch(`${base}/lists/${listId}`, { headers }),

    // Last 60 days of campaign reports (ecommerce revenue included in report_summary)
    fetch(
      `${base}/reports?list_id=${listId}&since_send_time=${since60d}&count=100` +
        `&fields=reports.id,reports.subject_line,reports.send_time,` +
        `reports.report_summary,reports.ecommerce`,
      { headers }
    ),

    // Growth history — last 3 months to cover a full 30-day window
    fetch(
      `${base}/lists/${listId}/growth-history?count=3&fields=history.month,history.subscribed,history.unsubscribed`,
      { headers }
    ),

    // Active automations
    fetch(
      `${base}/automations?status=sending&count=50` +
        `&fields=automations.id,automations.settings.title,automations.status,` +
        `automations.report_summary`,
      { headers }
    ),
  ]);

  // ── Step 3: Parse list stats ─────────────────────────────────────────────────
  if (!listRes.ok) throw new Error(`Mailchimp list fetch error: ${listRes.status}`);
  const listData = await listRes.json();
  if (!listName) listName = listData.name ?? listId;
  const stats = listData.stats ?? {};

  // ── Step 4: Parse campaign reports ──────────────────────────────────────────
  const campData = campRes.ok ? await campRes.json() : { reports: [] };
  interface RawReport {
    id: string;
    subject_line?: string;
    send_time?: string;
    report_summary?: {
      open_rate?: number;
      click_rate?: number;
      opens?: number;
      clicks?: number;
      unique_opens?: number;
      unique_clicks?: number;
    };
    ecommerce?: { total_revenue?: number };
  }
  const reports: RawReport[] = campData.reports ?? [];

  // Separate into last-30d (for averages) and full set (for top campaign ranking)
  const since30dMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const reports30d = reports.filter(
    (r) => r.send_time && new Date(r.send_time).getTime() >= since30dMs
  );

  let sumOpen = 0, sumClick = 0, sumClickOpens = 0, emailRevenue = 0;
  for (const r of reports30d) {
    const s = r.report_summary ?? {};
    sumOpen += s.open_rate ?? 0;
    sumClick += s.click_rate ?? 0;
    // CTOR = unique clicks / unique opens (avoid div-by-zero)
    const uo = s.unique_opens ?? 0;
    const uc = s.unique_clicks ?? 0;
    sumClickOpens += uo > 0 ? uc / uo : 0;
    emailRevenue += r.ecommerce?.total_revenue ?? 0;
  }
  const n30 = reports30d.length;
  const openRate = n30 > 0 ? sumOpen / n30 : (stats.avg_open_rate ?? 0);
  const clickRate = n30 > 0 ? sumClick / n30 : (stats.avg_click_rate ?? 0);
  const clickToOpenRate = n30 > 0 ? sumClickOpens / n30 : 0;

  // Identify outlier campaigns: open_rate at least 20% above the computed average
  const threshold = openRate * 1.2;
  const allCampaigns: MailchimpCampaignSummary[] = reports
    .filter((r) => (r.report_summary?.open_rate ?? 0) >= threshold)
    .sort((a, b) => (b.report_summary?.open_rate ?? 0) - (a.report_summary?.open_rate ?? 0))
    .slice(0, 10)
    .map((r) => {
      const s = r.report_summary ?? {};
      const uo = s.unique_opens ?? 0;
      const uc = s.unique_clicks ?? 0;
      return {
        id: r.id,
        subject: r.subject_line ?? "(no subject)",
        send_time: r.send_time ?? "",
        open_rate: s.open_rate ?? 0,
        click_rate: s.click_rate ?? 0,
        ctor: uo > 0 ? uc / uo : 0,
        revenue: r.ecommerce?.total_revenue ?? 0,
        unique_opens: uo,
        unique_clicks: uc,
      };
    });

  // ── Step 5: Parse growth history ─────────────────────────────────────────────
  const growthData = growthRes.ok ? await growthRes.json() : { history: [] };
  interface GrowthEntry { month: string; subscribed?: number; unsubscribed?: number }
  const growthHistory: GrowthEntry[] = growthData.history ?? [];
  // Sum across the most recent full month(s) to approximate 30d
  let newSubs = 0, lostSubs = 0;
  if (growthHistory.length > 0) {
    // The first entry is the most recent month
    const latest = growthHistory[0];
    newSubs = latest.subscribed ?? 0;
    lostSubs = latest.unsubscribed ?? 0;
  }
  const listSize = stats.member_count ?? 0;
  const listGrowthRate = listSize > 0 ? (newSubs - lostSubs) / listSize : 0;

  // ── Step 6: Parse automations ────────────────────────────────────────────────
  const autoData = automationsRes.ok ? await automationsRes.json() : { automations: [] };
  interface RawAutomation {
    id: string;
    settings?: { title?: string };
    status?: string;
    report_summary?: { open_rate?: number; click_rate?: number };
  }
  const rawAutos: RawAutomation[] = autoData.automations ?? [];
  const automations: MailchimpAutomationSummary[] = rawAutos.map((a) => ({
    id: a.id,
    title: a.settings?.title ?? a.id,
    status: a.status ?? "unknown",
    open_rate: a.report_summary?.open_rate ?? 0,
    click_rate: a.report_summary?.click_rate ?? 0,
  }));

  // ── Step 7: Build 3-month growth history ─────────────────────────────────
  const growthHistory3m = growthHistory.slice(0, 3).map((e: GrowthEntry) => ({
    month: e.month,
    subscribed: e.subscribed ?? 0,
    unsubscribed: e.unsubscribed ?? 0,
  }));

  return {
    platform: "mailchimp",
    fetched_at: new Date().toISOString(),
    list_name: listName,
    list_id: listId,
    list_size: listSize,
    open_rate: openRate,
    click_rate: clickRate,
    click_to_open_rate: clickToOpenRate,
    unsubscribe_rate: stats.unsubscribe_rate ?? 0,
    bounce_rate_hard: stats.hard_bounce_rate ?? 0,
    soft_bounce_rate: stats.soft_bounce_rate ?? 0,
    cleaned_count: stats.cleaned_count ?? 0,
    total_contacts: stats.total_contacts ?? stats.member_count ?? listSize,
    campaign_count_30d: n30,
    email_revenue_30d: emailRevenue,
    new_subscribers_30d: newSubs,
    lost_subscribers_30d: lostSubs,
    list_growth_rate: listGrowthRate,
    avg_sub_rate_monthly: stats.avg_sub_rate ?? 0,
    list_rating: listData.list_rating ?? 0,
    automation_count: automations.length,
    automations,
    top_campaigns: allCampaigns,
    growth_history_3m: growthHistory3m,
  };
}
