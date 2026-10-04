"use client";
import { useCallback, useEffect, useState } from "react";
import type { CommercialDocument } from "@/lib/types";

type Stats = {
  opens: number;
  unique_sessions: number;
  pdf_clicks: number;
  pdf_started: number;
  option_clicks: number;
  choices_submitted: number;
  scrolled_halfway: number;
  reached_end: number;
  last_opened_at: string | null;
  option_clicks_by_id: Record<string, number>;
  devices: Record<string, number>;
  recent_visits: {
    opened_at: string;
    device_category: string | null;
    browser_family: string | null;
    country_code: string | null;
    region_code: string | null;
    scroll_percent: number;
    pdf_started: number;
    option_clicks: number;
    choices_submitted: number;
  }[];
};

async function fetchStats(documentId: string): Promise<Stats> {
  const response = await fetch(`/api/quote-engagement?documentId=${documentId}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load engagement");
  return response.json();
}

export default function QuoteEngagement({ doc }: { doc: CommercialDocument }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchStats(doc.id));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [doc.id]);
  useEffect(() => {
    let active = true;
    void fetchStats(doc.id)
      .then((result) => { if (active) { setStats(result); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doc.id]);
  const optionNames = new Map(doc.quote_options?.flatMap((group) =>
    group.options.map((option) => [option.id, option.title] as const)) ?? []);
  const optionClicks = Object.entries(stats?.option_clicks_by_id ?? {})
    .sort((a, b) => b[1] - a[1]);
  const devices = Object.entries(stats?.devices ?? {}).filter(([name]) => name !== "unknown");
  return (
    <section className="quote-engagement">
      <div className="row between">
        <div>
          <h3>Share engagement</h3>
          <p>Activity on this quotation’s shared link. New visits are tracked only with permission.</p>
        </div>
        <button className="button small" type="button" disabled={loading} onClick={() => void load()}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>
      {error ? <p>Could not load activity. Try Refresh.</p> : stats && <>
        <div className="quote-engagement-grid">
          <div><strong>{stats.opens}</strong><span>Opens</span></div>
          <div><strong>{stats.unique_sessions}</strong><span>Unique sessions</span></div>
          <div><strong>{stats.pdf_clicks}</strong><span>PDF clicks</span></div>
          <div><strong>{stats.pdf_started}</strong><span>PDF downloads started</span></div>
          <div><strong>{stats.option_clicks}</strong><span>Option clicks</span></div>
          <div><strong>{stats.scrolled_halfway}</strong><span>Scrolled halfway</span></div>
          <div><strong>{stats.reached_end}</strong><span>Reached the end</span></div>
          <div><strong>{stats.choices_submitted}</strong><span>Choices sent</span></div>
        </div>
        {devices.length > 0 && <p className="quote-engagement-options">
          Devices: {devices.map(([name, count]) => `${name} (${count})`).join(" · ")}
        </p>}
        {optionClicks.length > 0 && <p className="quote-engagement-options">
          Most clicked options: {optionClicks.slice(0, 3).map(([id, count]) =>
            `${optionNames.get(id) ?? "Removed option"} (${count})`).join(" · ")}
        </p>}
        {stats.last_opened_at && <p>Last opened: {new Date(stats.last_opened_at).toLocaleString()}</p>}
        {(stats.recent_visits?.length ?? 0) > 0 && <div className="quote-visit-section">
          <h4>Recent visits</h4>
          <div className="quote-visit-list">
            {stats.recent_visits.map((visit, index) => <div className="quote-visit" key={`${visit.opened_at}-${index}`}>
              <strong>{new Date(visit.opened_at).toLocaleString()}</strong>
              <span>{[visit.device_category, visit.browser_family,
                [visit.country_code, visit.region_code].filter(Boolean).join(" · ")]
                .filter(Boolean).join(" · ") || "Device and location unavailable"}</span>
              <span>{visit.scroll_percent > 0 ? `Read at least ${visit.scroll_percent}%` : "Scroll not recorded"}
                {visit.pdf_started > 0 ? " · PDF download started" : ""}
                {visit.option_clicks > 0 ? ` · ${visit.option_clicks} option clicks` : ""}
                {visit.choices_submitted > 0 ? " · Choices sent" : ""}</span>
            </div>)}
          </div>
        </div>}
        <p className="quote-engagement-disclaimer">
          Counts and network-based locations are approximate. A PDF download started means the browser was asked to save it;
          we cannot confirm the file was kept or read. Anyone with the link can view it, so this does not identify a specific client.
          Team previews are excluded.
        </p>
      </>}
    </section>
  );
}
