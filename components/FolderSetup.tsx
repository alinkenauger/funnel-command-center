"use client";

import { useState } from "react";
import { FolderOpen, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface FolderSetupProps {
  onComplete: (folderId: string) => void;
}

export default function FolderSetup({ onComplete }: FolderSetupProps) {
  const [folderId, setFolderId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [folderName, setFolderName] = useState("");

  async function handleValidate() {
    if (!folderId.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/folder?folderId=${encodeURIComponent(folderId.trim())}`);
      const json = await res.json();
      if (json.valid) {
        setFolderName(json.name ?? folderId.trim());
        setStatus("success");
        setTimeout(() => onComplete(folderId.trim()), 800);
      } else {
        setStatus("error");
        setErrorMsg(json.error ?? "Folder not found or not accessible.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — check your connection.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-8">
          {/* Icon */}
          <div className="flex items-center justify-center w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-lg mb-6 mx-auto">
            <FolderOpen size={22} className="text-indigo-400" />
          </div>

          <h1 className="text-lg font-semibold text-zinc-100 text-center mb-1">
            Connect Google Drive Folder
          </h1>
          <p className="text-sm text-zinc-500 text-center mb-6">
            Enter the ID of your shared Google Drive folder. This is where all data, uploads,
            and reports are stored.
          </p>

          {/* Instructions */}
          <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 text-xs text-zinc-400 space-y-1.5">
            <p className="font-medium text-zinc-300">How to find your folder ID:</p>
            <p>1. Open the folder in Google Drive</p>
            <p>
              2. Copy the ID from the URL:{" "}
              <code className="bg-zinc-700 px-1 rounded text-zinc-200">
                drive.google.com/drive/folders/
                <span className="text-indigo-400">[FOLDER-ID]</span>
              </code>
            </p>
            <p>3. Paste it below</p>
          </div>

          {/* Input */}
          <div className="space-y-3">
            <input
              type="text"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleValidate()}
              placeholder="1A2B3C4D5E6F7G8H9I0J..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 font-mono"
            />

            <button
              onClick={handleValidate}
              disabled={!folderId.trim() || status === "loading"}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Validating…
                </>
              ) : (
                "Connect Folder"
              )}
            </button>
          </div>

          {/* Status */}
          {status === "success" && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle size={15} />
              Connected to &ldquo;{folderName}&rdquo;. Loading dashboard…
            </div>
          )}
          {status === "error" && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-400">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
