"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import type { Action } from "@/lib/validation";
import type { Snapshot } from "@/lib/types";
export function useCRM() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const keys = useRef(new Map<string, string>());
  const query = useQuery<Snapshot>({
    queryKey: ["crm"],
    queryFn: async () => {
      const r = await fetch("/api/crm", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data;
    },
  });
  async function mutate(action: Action, payload: unknown) {
    if (pending.current) throw new Error("Please wait for the current save");
    pending.current = true;
    setBusy(true);
    const hash = JSON.stringify({ action, payload });
    const key = keys.current.get(hash) ?? crypto.randomUUID();
    keys.current.set(hash, key);
    try {
      const r = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, key }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      keys.current.delete(hash);
      await client.invalidateQueries({ queryKey: ["crm"] });
      toast.success("Saved");
      return data as { id: string };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return {
    ...query,
    busy,
    mutate,
    refresh: () => client.invalidateQueries({ queryKey: ["crm"] }),
  };
}
export type Mutate = ReturnType<typeof useCRM>["mutate"];
