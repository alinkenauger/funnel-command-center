"use client";

import { useState, useCallback } from "react";
import {
  FolderOpen,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  X,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import type { DriveFile, FileFinding, GapQuestion } from "@/lib/types";

const BATCH_SIZE = 4;

type Phase =
  | "idle"
  | "listing"
  | "confirming"
  | "processing"
  | "synthesizing"
  | "done"
  | "error";

interface BatchStatus {
  index: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
  findingsCount: number;
  skippedCount: number;
  errorMsg?: string;
}

interface DriveIngestionProps {
  onComplete: () => void;
  onClose?: () => void;
  compact?: boolean;
}

function mimeIcon(mimeType: string) {
  if (mimeType.includes("spreadsheet") || mimeType === "text/csv")
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />;
  if (mimeType.includes("document") || mimeType === "text/plain")
    return <FileText className="w-3.5 h-3.5 text-blue-400" />;
  if (mimeType.startsWith("image/"))
    return <FileImage className="w-3.5 h-3.5 text-purple-400" />;
  if (mimeType === "application/pdf")
    return <FileText className="w-3.5 h-3.5 text-red-400" />;
  return <FileIcon className="w-3.5 h-3.5 text-zinc-500" />;
}

function mimeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "application/vnd.google-apps.document": "Doc",
    "application/vnd.google-apps.spreadsheet": "Sheet",
    "application/vnd.google-apps.presentation": "Slides",
    "application/pdf": "PDF",
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "text/plain": "TXT",
    "text/csv": "CSV",
  };
  return map[mimeType] ?? "File";
}

export default function DriveIngestion({ onComplete, onClose, compact }: DriveIngestionProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [folderUrl, setFolderUrl] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [newFileCount, setNewFileCount] = useState(0);
  const [folderId, setFolderId] = useState("");
  const [batches, setBatches] = useState<BatchStatus[]>([]);
  const [allFindings, setAllFindings] = useState<FileFinding[]>([]);
  const [gapQuestions, setGapQuestions] = useState<GapQuestion[]>([]);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // ── Step 1: List files ──────────────────────────────────────────
  const handleList = useCallback(async () => {
    if (!folderUrl.trim()) return;
    setPhase("listing");
    setErrorMsg("");

    try {
      const res = await fetch("/api/ingest/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: folderUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setFiles(json.files);
      setNewFileCount(json.newFileCount);
      setFolderId(json.folderId);
      setPhase("confirming");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to list files");
      setPhase("error");
    }
  }, [folderUrl]);

  // ── Step 2: Run batches ─────────────────────────────────────────
  const handleStartIngestion = useCallback(async () => {
    setPhase("processing");

    const chunks: DriveFile[][] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      chunks.push(files.slice(i, i + BATCH_SIZE));
    }

    const initialBatches: BatchStatus[] = chunks.map((chunk, i) => ({
      index: i,
      label: `Batch ${i + 1} of ${chunks.length} (${chunk.length} files)`,
      status: "pending",
      findingsCount: 0,
      skippedCount: 0,
    }));
    setBatches(initialBatches);

    const accumulated: FileFinding[] = [];
    let skipped = 0;

    for (let i = 0; i < chunks.length; i++) {
      // Mark running
      setBatches((prev) =>
        prev.map((b) => (b.index === i ? { ...b, status: "running" } : b))
      );

      try {
        const res = await fetch("/api/ingest/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: chunks[i], batchIndex: i }),
        });
        const json = await res.json();

        const batchFindings: FileFinding[] = json.findings ?? [];
        const batchSkipped: number = (json.skipped ?? []).length;
        const batchError: string | undefined = json.error;

        accumulated.push(...batchFindings);
        skipped += batchSkipped;

        setBatches((prev) =>
          prev.map((b) =>
            b.index === i
              ? {
                  ...b,
                  status: batchError ? "error" : "done",
                  findingsCount: batchFindings.length,
                  skippedCount: batchSkipped,
                  errorMsg: batchError,
                }
              : b
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
        setBatches((prev) =>
          prev.map((b) => (b.index === i ? { ...b, status: "error", errorMsg: msg } : b))
        );
        // Continue with remaining batches
      }
    }

    setAllFindings(accumulated);
    setTotalSkipped(skipped);

    // ── Step 3: Synthesize ────────────────────────────────────────
    setPhase("synthesizing");

    try {
      const res = await fetch("/api/ingest/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allFindings: accumulated, folderId, allFiles: files }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setGapQuestions(json.gapQuestions ?? []);

      // Save drive-folder config
      await fetch("/api/drive-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });

      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Synthesis failed");
      setPhase("error");
    }
  }, [files, folderId]);

  // ── Shared wrapper classes ──────────────────────────────────────
  const wrapperClass = compact
    ? "w-full"
    : "fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4";
  const cardClass = compact
    ? "w-full bg-zinc-900 border border-zinc-700 rounded-xl p-6"
    : "w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl";

  return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold text-zinc-100 text-sm">Import from Google Drive</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── IDLE / LISTING: URL input ────────────────────────── */}
          {(phase === "idle" || phase === "listing") && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Paste the URL of a publicly shared Google Drive folder. Claude will read every
                file and build a complete funnel analysis.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleList()}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={phase === "listing"}
                />
                <button
                  onClick={handleList}
                  disabled={!folderUrl.trim() || phase === "listing"}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  {phase === "listing" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {phase === "listing" ? "Scanning…" : "Scan Folder"}
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                The folder must be set to &ldquo;Anyone with the link can view&rdquo; in Google Drive sharing settings.
              </p>
            </div>
          )}

          {/* ── CONFIRMING: File list ────────────────────────────── */}
          {phase === "confirming" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {files.length} files found
                  </p>
                  {newFileCount > 0 && (
                    <p className="text-xs text-indigo-400 mt-0.5">
                      {newFileCount} new since last ingestion
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setPhase("idle")}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Change folder
                </button>
              </div>

              {/* File list */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-h-52 overflow-y-auto">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 last:border-0"
                  >
                    {mimeIcon(file.mimeType)}
                    <span className="text-xs text-zinc-300 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-zinc-600 font-mono shrink-0">
                      {mimeLabel(file.mimeType)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleStartIngestion}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  Start AI Analysis ({Math.ceil(files.length / BATCH_SIZE)} batches)
                </button>
              </div>
              <p className="text-xs text-zinc-600 text-center">
                Claude will process {BATCH_SIZE} files per batch. Unsupported or restricted files
                are skipped automatically.
              </p>
            </div>
          )}

          {/* ── PROCESSING: Batch progress ───────────────────────── */}
          {(phase === "processing" || phase === "synthesizing") && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                {phase === "synthesizing"
                  ? "Synthesizing all findings into funnel report…"
                  : `Processing batches — ${batches.filter((b) => b.status === "done").length} of ${batches.length} complete`}
              </p>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {batches.map((batch) => (
                  <div
                    key={batch.index}
                    className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5"
                  >
                    <div className="shrink-0">
                      {batch.status === "done" && (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      )}
                      {batch.status === "running" && (
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      )}
                      {batch.status === "pending" && (
                        <div className="w-4 h-4 rounded-full border border-zinc-700" />
                      )}
                      {batch.status === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <span className="text-xs text-zinc-400 flex-1">{batch.label}</span>
                    {batch.status === "done" && (
                      <span className="text-xs text-zinc-500">
                        {batch.findingsCount} findings
                        {batch.skippedCount > 0 && `, ${batch.skippedCount} skipped`}
                      </span>
                    )}
                    {batch.status === "error" && batch.errorMsg && (
                      <span className="text-xs text-red-400 truncate max-w-[180px]" title={batch.errorMsg}>
                        {batch.errorMsg}
                      </span>
                    )}
                  </div>
                ))}

                {phase === "synthesizing" && (
                  <div className="flex items-center gap-3 bg-zinc-950 border border-indigo-800/50 rounded-lg px-3 py-2.5">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                    <span className="text-xs text-indigo-300">
                      Building master funnel report from {allFindings.length} file findings…
                    </span>
                  </div>
                )}
              </div>

              {/* Totals bar */}
              {batches.some((b) => b.status === "done") && phase === "processing" && (
                <div className="text-xs text-zinc-500 text-center">
                  {allFindings.length} findings extracted · {totalSkipped} files skipped
                </div>
              )}
            </div>
          )}

          {/* ── DONE: Gap questions ──────────────────────────────── */}
          {phase === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Analysis complete</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-center">
                  <p className="text-lg font-semibold text-zinc-100 tabular-nums">{files.length}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Files scanned</p>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-center">
                  <p className="text-lg font-semibold text-zinc-100 tabular-nums">{allFindings.length}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Findings extracted</p>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 text-center">
                  <p className="text-lg font-semibold text-zinc-100 tabular-nums">{totalSkipped}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Files skipped</p>
                </div>
              </div>

              {gapQuestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-xs font-medium text-amber-400">
                      {gapQuestions.length} data gap{gapQuestions.length !== 1 ? "s" : ""} identified
                    </p>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {gapQuestions.map((q, i) => (
                      <div
                        key={i}
                        className="bg-zinc-950 border border-amber-900/40 rounded-lg px-3 py-2.5"
                      >
                        <p className="text-xs font-medium text-zinc-300">{q.question}</p>
                        <p className="text-xs text-zinc-500 mt-1">{q.context}</p>
                        <span className="inline-block mt-1.5 text-xs text-amber-500/70 font-mono">
                          {q.stage}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-600">
                    Share these questions with your client to fill in the gaps and improve grades.
                  </p>
                </div>
              )}

              <button
                onClick={onComplete}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                View Dashboard
              </button>
            </div>
          )}

          {/* ── ERROR ────────────────────────────────────────────── */}
          {phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">Error</p>
                  <p className="text-xs text-red-400/80 mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button
                onClick={() => { setPhase("idle"); setErrorMsg(""); }}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
