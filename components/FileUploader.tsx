"use client";

import { useState, useRef, DragEvent } from "react";
import { Upload, X, CheckCircle, AlertCircle, File, Loader2 } from "lucide-react";

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

interface FileUploaderProps {
  onClose?: () => void;
}

const ACCEPTED_TYPES = [
  "text/plain",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
];

export default function FileUploader({ onClose }: FileUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const entries: UploadFile[] = Array.from(newFiles).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...entries]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function uploadFile(entry: UploadFile) {
    setFiles((prev) =>
      prev.map((f) => (f.id === entry.id ? { ...f, status: "uploading" } : f))
    );

    try {
      const formData = new FormData();
      formData.append("file", entry.file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: "done" } : f
          )
        );
      } else {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Upload failed");
      }
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id
            ? { ...f, status: "error", errorMsg: err instanceof Error ? err.message : "Upload failed" }
            : f
        )
      );
    }
  }

  async function uploadAll() {
    const pending = files.filter((f) => f.status === "pending");
    await Promise.all(pending.map(uploadFile));
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Upload Files</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Files are stored in the workspace inbox</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-indigo-500 bg-indigo-500/5"
                : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30"
            }`}
          >
            <Upload
              size={24}
              className={`mx-auto mb-3 ${isDragging ? "text-indigo-400" : "text-zinc-500"}`}
            />
            <p className="text-sm text-zinc-300 mb-1">
              Drop files here or <span className="text-indigo-400">browse</span>
            </p>
            <p className="text-xs text-zinc-600">
              CSV, TXT, JSON, PDF, XLSX, PNG, JPG — any data file
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="px-6 pb-4 space-y-2 max-h-48 overflow-y-auto">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2"
              >
                <File size={14} className="text-zinc-400 flex-shrink-0" />
                <span className="flex-1 text-xs text-zinc-300 truncate">{f.file.name}</span>
                <span className="text-xs text-zinc-600 flex-shrink-0">
                  {(f.file.size / 1024).toFixed(0)} KB
                </span>
                <div className="flex-shrink-0">
                  {f.status === "uploading" && (
                    <Loader2 size={13} className="text-indigo-400 animate-spin" />
                  )}
                  {f.status === "done" && <CheckCircle size={13} className="text-emerald-400" />}
                  {f.status === "error" && (
                    <span title={f.errorMsg}>
                      <AlertCircle size={13} className="text-red-400" />
                    </span>
                  )}
                  {f.status === "pending" && (
                    <button
                      onClick={() => removeFile(f.id)}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">
            {doneCount > 0 && `${doneCount} uploaded · `}
            {pendingCount > 0 && `${pendingCount} ready`}
          </span>
          <div className="flex items-center gap-2">
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Done
              </button>
            )}
            {pendingCount > 0 && (
              <button
                onClick={uploadAll}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Upload size={13} />
                Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
