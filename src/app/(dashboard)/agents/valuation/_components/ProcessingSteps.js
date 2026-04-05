"use client";

import { useState, useEffect } from "react";

const STEPS = [
  { label: "Validating inputs", icon: "check_circle", duration: 600 },
  { label: "Analyzing photos via AI", icon: "photo_camera", duration: 2500 },
  { label: "Scanning DE market for comparables", icon: "search", duration: 3000 },
  { label: "Fetching live FX rate", icon: "currency_exchange", duration: 400 },
  { label: "Calculating landed cost", icon: "calculate", duration: 500 },
  { label: "Computing margin scenarios", icon: "trending_up", duration: 500 },
  { label: "Assessing risk factors", icon: "shield", duration: 2000 },
  { label: "Generating recommendation", icon: "auto_awesome", duration: 2500 },
  { label: "Assembling report", icon: "description", duration: 400 },
];

export default function ProcessingSteps() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let timeout;
    const advance = (step) => {
      if (step < STEPS.length) {
        timeout = setTimeout(() => {
          setCurrentStep(step + 1);
          advance(step + 1);
        }, STEPS[step].duration);
      }
    };
    advance(0);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <span className="material-symbols-outlined text-primary text-2xl animate-spin" role="status" aria-label="Processing">progress_activity</span>
        <h3 className="font-headline font-bold text-lg sm:text-xl">Processing Valuation</h3>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${isDone ? "bg-emerald-400/5" : isActive ? "bg-primary/5" : "opacity-40"}`}>
              <span className={`material-symbols-outlined text-lg ${isDone ? "text-emerald-400" : isActive ? "text-primary animate-pulse" : "text-on-surface-variant"}`}>
                {isDone ? "check_circle" : isActive ? step.icon : "radio_button_unchecked"}
              </span>
              <span className={`text-sm ${isDone ? "text-emerald-400" : isActive ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                Step {i + 1}: {step.label}
                {isDone && " ✓"}
                {isActive && "..."}
              </span>
              {(i === 1 || i === 2) && isActive && (
                <span className="text-[10px] text-on-surface-variant ml-auto">parallel</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <div className="flex justify-between text-xs text-on-surface-variant mb-1">
          <span>Progress</span>
          <span>{Math.round((currentStep / STEPS.length) * 100)}%</span>
        </div>
        <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
