"use client";

import { useState, useEffect } from "react";

export default function ConversationThread({ leadId, onClose }) {
  const [lead, setLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConversation = async () => {
    try {
      const res = await fetch(`/api/agents/concierge/leads?leadId=${leadId}`);
      const data = await res.json();
      setLead(data.lead || null);
      setMessages(data.messages || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConversation(); }, [leadId]);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !lead) return;
    setSending(true);

    try {
      const res = await fetch("/api/agents/concierge/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry: reply,
          customerName: lead.name,
          customerEmail: lead.email,
          vehicle: lead.vehicle || {},
          source: lead.source || "platform",
          leadId: lead.id,
        }),
      });
      await res.json();
      setReply("");
      fetchConversation();
    } catch {} finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="material-symbols-outlined text-primary animate-spin text-2xl">progress_activity</span>
      </div>
    );
  }

  if (!lead) {
    return <p className="text-sm text-on-surface-variant">Lead not found.</p>;
  }

  const BUYER_STYLES = { COLLECTOR: "text-secondary", SERIOUS: "text-emerald-400", TRADE: "text-primary", BROWSER: "text-on-surface-variant", COMPETITOR: "text-red-400" };

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-headline font-bold">{lead.name || "Unknown"}</h4>
            {lead.buyerType && (
              <span className={`text-[10px] font-bold uppercase ${BUYER_STYLES[lead.buyerType] || ""}`}>{lead.buyerType}</span>
            )}
            {lead.score != null && (
              <span className="text-[10px] font-bold text-on-surface-variant">Score: {lead.score}/100</span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">
            {lead.email} · {lead.source} · {lead.status}
            {lead.vehicle?.make && ` · ${lead.vehicle.make} ${lead.vehicle.model}`}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-4">No messages yet</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "customer" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                msg.role === "customer"
                  ? "bg-surface-container-high text-on-surface"
                  : "bg-primary/10 border border-primary/20 text-on-surface"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase text-on-surface-variant">
                    {msg.role === "customer" ? lead.name || "Customer" : "Concierge AI"}
                  </span>
                  {msg.aiPowered && <span className="material-symbols-outlined text-primary text-xs">auto_awesome</span>}
                  <span className="text-[10px] text-on-surface-variant ml-auto">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply */}
      <form onSubmit={handleReply} className="p-4 border-t border-outline-variant/10 flex gap-2">
        <input
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type customer's follow-up message..."
          className="flex-1 px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50"
        />
        <button type="submit" disabled={sending || !reply.trim()}
          className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-1">
          <span className={`material-symbols-outlined text-sm ${sending ? "animate-spin" : ""}`}>{sending ? "progress_activity" : "send"}</span>
          {sending ? "" : "Send"}
        </button>
      </form>
    </div>
  );
}
