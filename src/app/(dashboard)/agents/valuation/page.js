"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatEur } from "@/lib/format";
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
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto p-12 text-center text-on-surface-variant">Loading...</div>}>
      <ValuationPageInner />
    </Suspense>
  );
}

function ValuationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState("form"); // form | processing | report | loading
  const [report, setReport] = useState(null);
  const [lastInput, setLastInput] = useState(null);
  const [pipelineSent, setPipelineSent] = useState(false);
  const [errorModal, setErrorModal] = useState(null); // { title, message, onRetry? }
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch valuation history & stats
  const fetchHistory = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/agents/valuation/history");
      const data = await res.json();
      setStats(data.stats || null);
      setRecent(data.recent || []);
    } catch { /* ignore */ }
    setRefreshing(false);
  }, []);

  // Instant-inject a completed valuation into stats + recent list (no round-trip needed)
  const injectValuation = useCallback((reportData) => {
    const verdict = reportData.recommendation?.verdict;
    const marginEur = reportData.marginAnalysis?.grossMarginEur;
    const confidence = reportData.marginAnalysis?.marginConfidence;
    const vs = reportData.vehicleSummary || {};

    setRecent((prev) => [{
      id: reportData.valuationId || `temp-${Date.now()}`,
      make: vs.make, model: vs.model, year: vs.year,
      verdict, marginEur, confidence,
      aiPowered: true,
      processingTime: reportData.processingTimeSeconds,
      createdAt: reportData.timestamp || new Date().toISOString(),
    }, ...prev].slice(0, 10));

    setStats((prev) => {
      if (!prev) return { total: 1, verdicts: { BUY: verdict === "BUY" ? 1 : 0, REVIEW: verdict === "REVIEW" ? 1 : 0, PASS: verdict === "PASS" ? 1 : 0 }, avgMarginEur: marginEur, pipelineCount: 0 };
      const newTotal = prev.total + 1;
      const newVerdicts = { ...prev.verdicts };
      if (verdict && newVerdicts[verdict] !== undefined) newVerdicts[verdict]++;
      const oldMarginSum = (prev.avgMarginEur || 0) * prev.total;
      const newAvg = marginEur != null ? Math.round((oldMarginSum + marginEur) / newTotal) : prev.avgMarginEur;
      return { ...prev, total: newTotal, verdicts: newVerdicts, avgMarginEur: newAvg };
    });
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Load report from URL param (?report=val-123) on mount or param change
  useEffect(() => {
    const reportId = searchParams.get("report");
    if (reportId && state !== "processing") {
      setState("loading");
      fetch(`/api/agents/valuation/history/${reportId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.report) {
            setReport(data.report);
            setState("report");
          } else {
            showError("Report Not Found", "This valuation report could not be loaded.");
            setState("form");
            router.replace("/agents/valuation");
          }
        })
        .catch(() => {
          setState("form");
          router.replace("/agents/valuation");
        });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
      injectValuation(data); // Instant-update stats + recent list
      // Push report ID to URL so it survives navigation
      if (data.valuationId) {
        router.replace(`/agents/valuation?report=${data.valuationId}`, { scroll: false });
      }
    } catch (err) {
      showError("Valuation Error", err.message || "An unexpected error occurred. Please try again.", () => handleSubmit(input));
      setState("form");
    }
  };

  const handleNewValuation = () => {
    setReport(null);
    setState("form");
    setPipelineSent(false);
    router.replace("/agents/valuation", { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRerun = () => {
    if (lastInput) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      handleSubmit(lastInput);
    }
  };

  const handleLoadReport = (id) => {
    router.push(`/agents/valuation?report=${id}`, { scroll: false });
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
        <>
          <ValuationForm onSubmit={handleSubmit} loading={false} />

          {/* Stats + Recent History — below the upload form */}
          {stats && stats.total > 0 && (
            <>
              {/* Section header with refresh */}
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">analytics</span>
                  Valuation History
                </h3>
                <button
                  onClick={fetchHistory}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/15 transition-all disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-sm ${refreshing ? "animate-spin" : ""}`}>refresh</span>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Total Analysed</p>
                  <p className="font-headline text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-on-surface-variant">auction sheets</p>
                </div>
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Verdicts</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-lg font-bold text-emerald-400">{stats.verdicts.BUY}</span>
                    <span className="text-[10px] text-emerald-400">BUY</span>
                    <span className="text-lg font-bold text-amber-400">{stats.verdicts.REVIEW}</span>
                    <span className="text-[10px] text-amber-400">REV</span>
                    <span className="text-lg font-bold text-slate-400">{stats.verdicts.PASS}</span>
                    <span className="text-[10px] text-slate-400">PASS</span>
                  </div>
                </div>
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Avg Margin</p>
                  <p className={`font-headline text-2xl font-bold ${(stats.avgMarginEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {stats.avgMarginEur != null ? `€${(stats.avgMarginEur / 1000).toFixed(0)}K` : "—"}
                  </p>
                  <p className="text-xs text-on-surface-variant">per vehicle</p>
                </div>
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-widest mb-1">Sent to Pipeline</p>
                  <p className="font-headline text-2xl font-bold">{stats.pipelineCount}</p>
                  <p className="text-xs text-on-surface-variant">vehicles</p>
                </div>
              </div>

              {/* Recent Valuations Table */}
              {recent.length > 0 && (
                <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
                  <h3 className="font-headline font-bold text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-lg">history</span>
                    Recent Valuations
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="border-b border-outline-variant/15">
                          {["Vehicle", "Verdict", "Margin", "Confidence", "Time"].map((h) => (
                            <th key={h} className="text-left py-2 px-3 text-[10px] uppercase tracking-widest text-on-surface-variant">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((v) => (
                          <tr key={v.id} onClick={() => handleLoadReport(v.id)} className="border-b border-outline-variant/8 hover:bg-surface-container-high/30 cursor-pointer transition-colors">
                            <td className="py-2 px-3 text-sm font-bold">{v.make} {v.model} <span className="text-on-surface-variant font-normal">({v.year})</span></td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                v.verdict === "BUY" ? "bg-emerald-400/15 text-emerald-400" :
                                v.verdict === "PASS" ? "bg-slate-400/10 text-slate-400" :
                                "bg-amber-400/15 text-amber-400"
                              }`}>{v.verdict || "—"}</span>
                            </td>
                            <td className={`py-2 px-3 text-sm font-mono ${(v.marginEur || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {formatEur(v.marginEur)}
                            </td>
                            <td className="py-2 px-3 text-sm text-on-surface-variant">
                              {v.confidence != null ? `${(v.confidence * 100).toFixed(0)}%` : "—"}
                            </td>
                            <td className="py-2 px-3 text-xs text-on-surface-variant">
                              {v.createdAt ? `${new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${new Date(v.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {state === "loading" && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm text-on-surface-variant">Loading valuation report...</p>
          </div>
        </div>
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
