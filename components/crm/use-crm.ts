"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import type { Action } from "@/lib/validation";
import type { Snapshot } from "@/lib/types";

const recordNames: Record<string, string> = {
  client: "Client",
  lead: "Lead",
  product: "Product",
  vendor: "Vendor",
  followup: "Follow-up",
  payment: "Payment",
  quote: "Quotation",
  invoice: "Invoice",
  order: "Order",
  expense: "Expense",
};

function successMessage(action: Action, payload: unknown) {
  const values = payload as Record<string, unknown>;
  if (action === "delete_record")
    return `${recordNames[String(values.kind)] ?? "Record"} deleted`;
  if (action === "save_cost") return "Cost saved";
  if (action.startsWith("save_")) {
    const name = action === "save_settings"
      ? "Settings"
      : recordNames[action.slice(5)] ?? "Changes";
    return `${name} saved`;
  }
  switch (action) {
    case "quote_status":
      return `Quotation marked ${String(values.status).toLowerCase()}`;
    case "share_document":
      return values.enabled ? "Share link enabled" : "Share link revoked";
    case "convert_lead":
      return "Client created from lead";
    case "revise_quote":
      return "Quotation revision created";
    case "convert_quote":
      return "Order created from quotation";
    case "revise_invoice":
      return "Invoice revision created";
    case "create_invoice":
      return "Invoice created";
    case "issue_invoice":
      return "Invoice issued";
    case "log_payment":
      return "Payment recorded";
    case "update_payment":
      return "Payment updated";
    case "assign_vendor":
      return "Vendor assignment updated";
    case "add_artwork":
      return "Artwork added";
    case "review_artwork":
      return "Artwork review saved";
    case "update_user":
      return "User updated";
    default:
      return "Changes saved";
  }
}

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
  async function mutate(action: Action, payload: unknown, message?: string) {
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
      toast.success(message ?? successMessage(action, payload));
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
