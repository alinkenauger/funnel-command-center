"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { Loader2, BarChart3 } from "lucide-react";
import FunnelDashboard from "@/components/FunnelDashboard";
import FolderSetup from "@/components/FolderSetup";
import FileUploader from "@/components/FileUploader";
import McKinseyReport from "@/components/McKinseyReport";
import { computeReadiness } from "@/lib/report-readiness";
import type { FunnelData, McKinseyReportData } from "@/lib/types";

const FOLDER_KEY = "sob_folder_id";

type AppState =
  | "auth-loading"
  | "unauthenticated"
  | "folder-setup"
  | "data-loading"
  | "ready"
  | "error";

export default function Home() {
  const { status: authStatus } = useSession();

  const [appState, setAppState] = useState<AppState>("auth-loading");
  const [folderId, setFolderId] = useState<string>("");
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [report, setReport] = useState<McKinseyReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showUploader, setShowUploader] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // ── Auth effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === "loading") return;

    if (authStatus === "unauthenticated") {
      setAppState("unauthenticated");
      return;
    }

    // Authenticated — check for saved folder ID
    const savedFolder = localStorage.getItem(FOLDER_KEY);
    if (!savedFolder) {
      setAppState("folder-setup");
    } else {
      setFolderId(savedFolder);
    }
  }, [authStatus]);

  // ── Load data when folderId is set ──────────────────────────────────────────
  const loadData = useCallback(async (id: string) => {
    setAppState("data-loading");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/drive/data?folderId=${encodeURIComponent(id)}`);
      if (res.status === 404) {
        // Folder exists but no master-data.json yet — show empty dashboard stub
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

      // Also try to load any existing report
      try {
        const rr = await fetch(
          `/api/drive/reports?folderId=${encodeURIComponent(id)}&filename=mckinsey-assessment.json`
        );
        if (rr.ok) {
          const rj = await rr.json();
          if (rj.content) {
            const parsed =
              typeof rj.content === "string" ? JSON.parse(rj.content) : rj.content;
            setReport(parsed);
          }
        }
      } catch {
        // No existing report — that's fine
      }

      setAppState("ready");
    } catch (err) {
      console.error("Load error:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to load data");
      setAppState("error");
    }
  }, []);

  useEffect(() => {
    if (folderId && authStatus === "authenticated") {
      loadData(folderId);
    }
  }, [folderId, authStatus, loadData]);

  // ── Folder setup complete ────────────────────────────────────────────────────
  function handleFolderComplete(id: string) {
    localStorage.setItem(FOLDER_KEY, id);
    setFolderId(id);
  }

  // ── Report generation ────────────────────────────────────────────────────────
  async function handleGenerateReport() {
    if (!folderId || isGeneratingReport) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch(
        `/api/report/generate?folderId=${encodeURIComponent(folderId)}`,
        { method: "POST" }
      );
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

  // ── Readiness score ──────────────────────────────────────────────────────────
  const readiness = computeReadiness(funnelData);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (appState === "auth-loading") {
    return <LoadingScreen label="Initializing…" />;
  }

  if (appState === "unauthenticated") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center gap-3 mb-10 justify-center">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <BarChart3 className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-zinc-100 font-semibold tracking-tight">Funnel Command</p>
              <p className="text-zinc-500 text-xs">Revenue Intelligence Platform</p>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
            <h1 className="text-zinc-100 text-xl font-semibold mb-1">Sign in required</h1>
            <p className="text-zinc-400 text-sm mb-8">
              Access your shared funnel analysis workspace.
            </p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium transition-colors"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <p className="text-zinc-600 text-xs text-center mt-6">
              You&apos;ll be asked to grant Drive access to read your shared analysis folder.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (appState === "folder-setup") {
    return <FolderSetup onComplete={handleFolderComplete} />;
  }

  if (appState === "data-loading") {
    return <LoadingScreen label="Loading workspace data…" />;
  }

  if (appState === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-8 text-center">
          <p className="text-red-400 text-sm font-medium mb-2">Failed to load data</p>
          <p className="text-zinc-400 text-xs mb-6">{errorMsg}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => loadData(folderId)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(FOLDER_KEY);
                setFolderId("");
                setAppState("folder-setup");
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              Change folder
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────────
  if (appState === "ready") {
    // If no funnel data yet, show an "empty state" inside the dashboard shell
    if (!funnelData) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-8 text-center">
            <p className="text-zinc-300 font-medium mb-2">No analysis data yet</p>
            <p className="text-zinc-500 text-sm mb-6">
              No <code className="text-zinc-400 bg-zinc-800 px-1 rounded">master-data.json</code>{" "}
              found in this folder. Upload your funnel spreadsheet to get started.
            </p>
            <button
              onClick={() => setShowUploader(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              Upload Data File
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(FOLDER_KEY);
                setFolderId("");
                setAppState("folder-setup");
              }}
              className="block mt-3 mx-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Change folder
            </button>
          </div>

          {showUploader && (
            <FileUploader folderId={folderId} onClose={() => setShowUploader(false)} />
          )}
        </div>
      );
    }

    return (
      <>
        <FunnelDashboard
          data={funnelData}
          folderId={folderId}
          onRefresh={() => loadData(folderId)}
          onUploadClick={() => setShowUploader(true)}
          onReportClick={report ? () => setShowReport(true) : handleGenerateReport}
          onFolderSetup={() => {
            localStorage.removeItem(FOLDER_KEY);
            setFolderId("");
            setAppState("folder-setup");
          }}
          report={report}
          readinessScore={readiness.score}
          isGeneratingReport={isGeneratingReport}
        />

        {showUploader && (
          <FileUploader folderId={folderId} onClose={() => setShowUploader(false)} />
        )}

        {showReport && report && (
          <McKinseyReport
            report={report}
            businessName={funnelData.business.name}
            folderId={folderId}
            onClose={() => setShowReport(false)}
          />
        )}
      </>
    );
  }

  return null;
}

// ── Small shared components ───────────────────────────────────────────────────

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        <p className="text-sm text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
