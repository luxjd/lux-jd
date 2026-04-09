"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import ValuationForm from "./_components/ValuationForm";
import ProcessingSteps from "./_components/ProcessingSteps";
import ValuationReport from "./_components/ValuationReport";

function ErrorModal({ title, message, onClose, onRetry }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-container border border-outline-variant/15 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 mx-auto mb-4">
          <span className="material-symbols-outlined text-red-400 text-2xl">error</span>
        </div>

        {/* Content */}
        <h3 className="font-headline font-bold text-lg text-center text-on-surface mb-2">{title}</h3>
        <p className="text-sm text-on-surface-variant text-center leading-relaxed mb-6">{message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          {onRetry && (
            <button
              onClick={() => { onClose(); onRetry(); }}
              className="flex-1 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface font-medium text-sm hover:bg-surface-container-highest transition-all"
            >
              Try Again
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-medium text-sm hover:shadow-[0_0_20px_rgba(248,113,113,0.3)] transition-all"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ValuationPage() {
  const [state, setState] = useState("form"); // form | processing | report
  const [report, setReport] = useState(null);
  const [lastInput, setLastInput] = useState(null);
  const [pipelineSent, setPipelineSent] = useState(false);
  const [errorModal, setErrorModal] = useState(null); // { title, message, onRetry? }

  const showError = useCallback((title, message, onRetry) => {
    setErrorModal({ title, message, onRetry: onRetry || null });
  }, []);

  const closeError = useCallback(() => setErrorModal(null), []);

  const handleSubmit = async (input) => {
    setLastInput(input);
    setState("processing");

    try {
      const photos = input._photos || [];
      const auctionSheet = input._auctionSheet || null;
      const hasFiles = photos.length > 0 || auctionSheet;

      let res;

      if (hasFiles) {
        // Send as multipart/form-data with files
        const fd = new FormData();
        fd.append("make", input.make);
        fd.append("model", input.model);
        fd.append("year", input.year);
        fd.append("mileageKm", input.mileageKm);
        fd.append("driveSide", input.driveSide);
        fd.append("askingPriceJpy", input.askingPriceJpy);
        fd.append("exteriorColor", input.exteriorColor);
        fd.append("interiorColor", input.interiorColor || "");
        fd.append("serviceHistory", input.serviceHistory || "UNKNOWN");
        fd.append("accidentHistory", input.accidentHistory ? "true" : "false");
        if (input.auctionGrade) fd.append("auctionGrade", input.auctionGrade);
        fd.append("specificationNotes", input.specificationNotes || "");

        for (const photo of photos) {
          fd.append("photos", photo);
        }
        if (auctionSheet) {
          fd.append("auctionSheet", auctionSheet);
        }

        res = await fetch("/api/agents/valuation/valuate", { method: "POST", body: fd });
      } else {
        // JSON only (no files)
        const { _photos, _auctionSheet, ...jsonInput } = input;
        res = await fetch("/api/agents/valuation/valuate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jsonInput),
        });
      }

      const data = await res.json();

      // Wait for processing animation to finish (~12s)
      await new Promise((resolve) => setTimeout(resolve, 12500));

      if (data.error) {
        showError("Valuation Failed", data.error, () => handleSubmit(input));
        setState("form");
        return;
      }

      setReport(data);
      setState("report");
    } catch (err) {
      showError("Valuation Error", err.message || "An unexpected error occurred. Please try again.", () => handleSubmit(input));
      setState("form");
    }
  };

  const handleNewValuation = () => {
    setReport(null);
    setState("form");
    setPipelineSent(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRerun = () => {
    if (lastInput) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      handleSubmit(lastInput);
    }
  };

  const handleSendToPipeline = async () => {
    try {
      const res = await fetch("/api/pipeline/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPipelineSent(true);
    } catch (err) {
      showError("Pipeline Error", `Failed to send to pipeline: ${err.message}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Error Modal */}
      {errorModal && (
        <ErrorModal
          title={errorModal.title}
          message={errorModal.message}
          onClose={closeError}
          onRetry={errorModal.onRetry}
        />
      )}

      {/* Back nav */}
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary text-2xl">auto_awesome</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline text-xl font-bold">Valuation Agent</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">agent_0</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">STANDALONE</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Upload auction sheets & photos → AI extracts data → Get instant German market valuation and BUY/REVIEW/PASS recommendation
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic content based on state */}
      {state === "form" && (
        <ValuationForm onSubmit={handleSubmit} loading={false} />
      )}

      {state === "processing" && (
        <ProcessingSteps />
      )}

      {state === "report" && report && (
        <ValuationReport
          report={report}
          onNewValuation={handleNewValuation}
          onRerun={handleRerun}
          onSendToPipeline={handleSendToPipeline}
          pipelineSent={pipelineSent}
        />
      )}
    </div>
  );
}
