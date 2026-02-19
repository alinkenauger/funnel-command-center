"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import FunnelDashboard from "@/components/FunnelDashboard";
import FileUploader from "@/components/FileUploader";
import McKinseyReport from "@/components/McKinseyReport";
import { computeReadiness } from "@/lib/report-readiness";
import type { FunnelData, McKinseyReportData } from "@/lib/types";

type AppState = "loading" | "ready" | "error";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [report, setReport] = useState<McKinseyReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showUploader, setShowUploader] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const loadData = useCallback(async () => {
    setAppState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/data");
      if (res.status === 404) {
        setFunnelData(null);
        setAppState("ready");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setFunnelData(json.data ?? null);

      // Try to load existing report
      try {
        const rr = await fetch("/api/reports?filename=mckinsey-assessment.json");
        if (rr.ok) {
          const rj = await rr.json();
          if (rj.content) {
            const parsed =
              typeof rj.content === "string" ? JSON.parse(rj.content) : rj.content;
            setReport(parsed);
          }
        }
      } catch {
        // No existing report — fine
      }

      setAppState("ready");
    } catch (err) {
      console.error("Load error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load data");
      setAppState("error");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerateReport() {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch("/api/report/generate", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { report: newReport } = await res.json();
      setReport(newReport);
      setShowReport(true);
    } catch (err) {
      console.error("Report generation failed:", err);
      alert("Report generation failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const readiness = computeReadiness(funnelData);

  if (appState === "loading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          <p className="text-sm text-zinc-500">Loading workspace data…</p>
        </div>
      </div>
    );
  }

  if (appState === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-red-400 text-sm font-medium mb-2">Failed to load data</p>
          <p className="text-zinc-400 text-xs mb-6">{errorMsg}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Ready — no data yet
  if (!funnelData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-zinc-300 font-medium mb-2">No analysis data yet</p>
          <p className="text-zinc-500 text-sm mb-6">
            No{" "}
            <code className="text-zinc-400 bg-zinc-800 px-1 rounded">master-data.json</code>{" "}
            found. Upload your funnel spreadsheet to get started.
          </p>
          <button
            onClick={() => setShowUploader(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            Upload Data File
          </button>
          <button
            onClick={handleLogout}
            className="block mt-3 mx-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Sign out
          </button>
        </div>

        {showUploader && (
          <FileUploader onClose={() => { setShowUploader(false); loadData(); }} />
        )}
      </div>
    );
  }

  return (
    <>
      <FunnelDashboard
        data={funnelData}
        onRefresh={loadData}
        onUploadClick={() => setShowUploader(true)}
        onReportClick={report ? () => setShowReport(true) : handleGenerateReport}
        onLogout={handleLogout}
        report={report}
        readinessScore={readiness.score}
        isGeneratingReport={isGeneratingReport}
      />

      {showUploader && (
        <FileUploader onClose={() => { setShowUploader(false); loadData(); }} />
      )}

      {showReport && report && (
        <McKinseyReport
          report={report}
          businessName={funnelData.business.name}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
