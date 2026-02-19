"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  ShoppingCart,
  BarChart2,
  Megaphone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plug,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type { AllPlatformStatuses } from "@/lib/platform-connectors/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlatformKey = "mailchimp" | "bigcommerce" | "google_analytics" | "google_ads";

interface PlatformMeta {
  key: PlatformKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "textarea" | "password";
  hint?: string;
}

// ─── Platform Definitions ────────────────────────────────────────────────────

const PLATFORMS: PlatformMeta[] = [
  {
    key: "mailchimp",
    label: "Mailchimp",
    description: "Email list size, open rates, click rates",
    icon: <Mail className="w-5 h-5" />,
    fields: [
      {
        key: "api_key",
        label: "API Key",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21",
        type: "password",
        hint: "Found in Account → Extras → API Keys",
      },
      {
        key: "list_id",
        label: "List / Audience ID (optional)",
        placeholder: "Leave blank to auto-select largest list",
      },
    ],
  },
  {
    key: "bigcommerce",
    label: "BigCommerce",
    description: "Revenue, orders, AOV, customer counts",
    icon: <ShoppingCart className="w-5 h-5" />,
    fields: [
      {
        key: "store_hash",
        label: "Store Hash",
        placeholder: "abc123  (from store-abc123.mybigcommerce.com)",
        hint: "The short code in your store URL",
      },
      {
        key: "access_token",
        label: "API Access Token",
        placeholder: "Your V2/V3 API token",
        type: "password",
        hint: "Advanced Settings → API Accounts → Create API Account",
      },
    ],
  },
  {
    key: "google_analytics",
    label: "Google Analytics 4",
    description: "Sessions, bounce rate, traffic channels",
    icon: <BarChart2 className="w-5 h-5" />,
    fields: [
      {
        key: "property_id",
        label: "GA4 Property ID",
        placeholder: "123456789",
        hint: "Admin → Property Settings → Property ID (numbers only)",
      },
      {
        key: "service_account_json",
        label: "Service Account JSON",
        placeholder: '{"type":"service_account","client_email":"...","private_key":"..."}',
        type: "textarea",
        hint: "Google Cloud Console → IAM → Service Accounts → Keys → Add Key (JSON). Grant the service account Viewer access to your GA4 property.",
      },
    ],
  },
  {
    key: "google_ads",
    label: "Google Ads",
    description: "Ad spend, clicks, CTR, cost per conversion",
    icon: <Megaphone className="w-5 h-5" />,
    fields: [
      {
        key: "customer_id",
        label: "Customer ID",
        placeholder: "1234567890  (10 digits, no dashes)",
        hint: "Shown in the top-right corner of Google Ads",
      },
      {
        key: "developer_token",
        label: "Developer Token",
        placeholder: "Your Google Ads API developer token",
        type: "password",
        hint: "Google Ads → Tools → API Center. Requires approved API access.",
      },
      {
        key: "client_id",
        label: "OAuth Client ID",
        placeholder: "xxxxxxxx.apps.googleusercontent.com",
        hint: "Google Cloud Console → APIs → Credentials → OAuth 2.0 Client",
      },
      {
        key: "client_secret",
        label: "OAuth Client Secret",
        placeholder: "Your OAuth client secret",
        type: "password",
      },
      {
        key: "refresh_token",
        label: "Refresh Token",
        placeholder: "1//0g...",
        type: "password",
        hint: "Generate via OAuth2 Playground with scope: https://www.googleapis.com/auth/adwords",
      },
      {
        key: "login_customer_id",
        label: "Manager Account ID (optional)",
        placeholder: "Only if accessing via MCC/manager account",
      },
    ],
  },
];

// ─── Individual Platform Card ─────────────────────────────────────────────────

function PlatformCard({
  platform,
  status,
  onConnect,
  onSync,
  onDisconnect,
}: {
  platform: PlatformMeta;
  status: AllPlatformStatuses[PlatformKey] | undefined;
  onConnect: (key: PlatformKey, creds: Record<string, string>) => Promise<void>;
  onSync: (key: PlatformKey) => Promise<void>;
  onDisconnect: (key: PlatformKey) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = status?.connected ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onConnect(platform.key, formValues);
      setShowForm(false);
      setFormValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSync(platform.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDisconnect(platform.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        <div
          className={`p-2 rounded-md ${
            connected ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {platform.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-100">{platform.label}</span>
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <XCircle className="w-3 h-3" /> Not connected
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{platform.description}</p>

          {/* Key metric preview */}
          {connected && status?.preview && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {Object.entries(status.preview).map(([k, v]) => (
                <span key={k} className="text-xs text-zinc-400">
                  <span className="text-zinc-500">{k}:</span>{" "}
                  <span className="font-mono tabular-nums text-zinc-200">{v}</span>
                </span>
              ))}
            </div>
          )}

          {status?.last_synced && (
            <p className="text-xs text-zinc-600 mt-1">
              Last synced {new Date(status.last_synced).toLocaleString()}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {connected ? (
            <>
              <button
                onClick={handleSync}
                disabled={loading}
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                title="Sync now"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                title="Disconnect"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              <Plug className="w-3 h-3" />
              Connect
              {showForm ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Credential form (collapsible) */}
      {showForm && !connected && (
        <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4 space-y-3">
          {platform.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  value={formValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 font-mono resize-none"
                />
              ) : (
                <input
                  type={field.type === "password" ? "password" : "text"}
                  value={formValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFormValues((v) => ({ ...v, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              )}
              {field.hint && (
                <p className="text-xs text-zinc-600 mt-1">{field.hint}</p>
              )}
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plug className="w-3 h-3" />
              )}
              {loading ? "Connecting…" : "Connect & Test"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormValues({}); setError(null); }}
              className="px-4 py-2 text-zinc-400 hover:text-zinc-100 text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main PlatformConnector Component ────────────────────────────────────────

export default function PlatformConnector() {
  const [statuses, setStatuses] = useState<AllPlatformStatuses | null>(null);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);

  const loadStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/platforms");
      if (res.ok) {
        const json = await res.json();
        setStatuses(json.statuses);
      }
    } catch {
      // silently fail
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleConnect = async (
    platform: PlatformKey,
    credentials: Record<string, string>
  ) => {
    const res = await fetch("/api/platforms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, credentials }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Connection failed");
    setStatuses(json.statuses);
  };

  const handleSync = async (platform: PlatformKey) => {
    const res = await fetch(`/api/platforms/${platform}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Sync failed");
    setStatuses(json.statuses);
  };

  const handleDisconnect = async (platform: PlatformKey) => {
    const res = await fetch(`/api/platforms/${platform}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Disconnect failed");
    setStatuses(json.statuses);
  };

  const handleSyncAll = async () => {
    if (!statuses) return;
    setSyncingAll(true);
    const connected = (Object.keys(statuses) as PlatformKey[]).filter(
      (k) => statuses[k]?.connected
    );
    await Promise.allSettled(connected.map((k) => handleSync(k)));
    setSyncingAll(false);
    await loadStatuses();
  };

  const connectedCount = statuses
    ? (Object.values(statuses) as { connected: boolean }[]).filter((s) => s.connected)
        .length
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Platform Integrations</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Connect your marketing tools to enrich the funnel analysis with live data
          </p>
        </div>
        {connectedCount > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors disabled:opacity-50"
          >
            {syncingAll ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Sync All
          </button>
        )}
      </div>

      {/* Connected count badge */}
      {statuses && (
        <div className="text-xs text-zinc-500">
          <span className={connectedCount > 0 ? "text-emerald-400 font-medium" : ""}>
            {connectedCount}
          </span>{" "}
          of {PLATFORMS.length} platforms connected
          {connectedCount > 0 && (
            <span className="ml-2 text-zinc-600">
              · Live data will be used in your next funnel analysis
            </span>
          )}
        </div>
      )}

      {/* Platform cards */}
      {globalLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading integration status…
        </div>
      ) : (
        <div className="space-y-3">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.key}
              platform={platform}
              status={statuses?.[platform.key]}
              onConnect={handleConnect}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-medium">How it works:</span> Credentials are
          stored securely in Vercel Blob (not in browser storage). When you run a funnel
          analysis, live platform metrics are automatically injected into the AI synthesis
          prompt — giving Claude real revenue, traffic, and engagement numbers instead of
          relying solely on uploaded documents.
        </p>
      </div>
    </div>
  );
}
