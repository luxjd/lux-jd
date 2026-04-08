"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function PhotoUploadButton({ vehicleId, stage, vehicleName }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const router = useRouter();

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("vehicleId", vehicleId);
    fd.append("stage", stage);
    for (const file of files) {
      fd.append("photos", file);
    }

    try {
      const res = await fetch("/api/agents/logistics/photos", { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
      if (data.success) router.refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 px-2 py-1 bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded-md text-[10px] font-bold hover:bg-amber-400/20 transition-all disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-xs">{uploading ? "progress_activity" : "add_a_photo"}</span>
        {uploading ? "Uploading..." : "Upload Photos"}
      </button>
      {result?.success && <p className="text-[10px] text-emerald-400 mt-0.5">{result.uploaded} photos saved</p>}
      {result?.error && <p className="text-[10px] text-red-400 mt-0.5">{result.error}</p>}
    </div>
  );
}
