"use client";
import { useCallback, useEffect, useState } from "react";
import type { CommercialDocument } from "@/lib/types";

type Stats = {
  opens: number;
  unique_sessions: number;
  pdf_clicks: number;
  option_clicks: number;
  choices_submitted: number;
  scrolled_halfway: number;
  reached_end: number;
  last_opened_at: string | null;
  option_clicks_by_id: Record<string, number>;
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
  return (
    <section className="quote-engagement">
      <div className="row between">
        <div>
          <h3>Share engagement</h3>
          <p>Activity on this quotation’s shared link.</p>
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
          <div><strong>{stats.option_clicks}</strong><span>Option clicks</span></div>
          <div><strong>{stats.scrolled_halfway}</strong><span>Scrolled halfway</span></div>
          <div><strong>{stats.reached_end}</strong><span>Reached the end</span></div>
        </div>
        {optionClicks.length > 0 && <p className="quote-engagement-options">
          Most clicked options: {optionClicks.slice(0, 3).map(([id, count]) =>
            `${optionNames.get(id) ?? "Removed option"} (${count})`).join(" · ")}
        </p>}
        {stats.last_opened_at && <p>Last opened: {new Date(stats.last_opened_at).toLocaleString()}</p>}
        <p className="quote-engagement-disclaimer">
          Counts are approximate. A session can open the link more than once, and anyone with the link can view it.
          This does not identify a specific client. Team previews are excluded.
        </p>
      </>}
    </section>
  );
}
