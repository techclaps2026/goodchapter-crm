import "server-only";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import { demoEnabled, demoDb } from "./demo";
import { asUser, OWNER, STAFF } from "../scripts/db-harness.mjs";
import type { Snapshot, Profile, CommercialDocument } from "./types";
import { cookies } from "next/headers";
import { z } from "zod";
const tables = [
  "profiles",
  "workspace_settings",
  "clients",
  "leads",
  "products",
  "vendors",
  "documents",
  "orders",
  "order_vendors",
  "order_costs",
  "artwork",
  "followups",
  "payments",
] as const;
export async function currentDemoUser() {
  return (await cookies()).get("tgc-demo-role")?.value === "staff"
    ? STAFF
    : OWNER;
}
export async function session() {
  if (demoEnabled()) {
    const uid = await currentDemoUser();
    return { id: uid, role: uid === OWNER ? "owner" : "staff" } as Profile;
  }
  if (!isSupabaseConfigured) throw new Error("SETUP_REQUIRED");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error || !data?.active) throw new Error("UNAUTHENTICATED");
  return { ...data, email: user.email } as Profile;
}
export async function snapshot(): Promise<Snapshot> {
  const user = await session();
  let rows: Record<string, unknown[]> = {};
  if (demoEnabled()) {
    const db = await demoDb();
    rows = await asUser(db, user.id, async (tx) => {
      const result: Record<string, unknown[]> = {};
      for (const t of tables)
        result[t] = (await tx.query(`select * from public.${t}`)).rows;
      return result;
    });
  } else {
    const db = await createClient();
    const results = await Promise.all(
      tables.map(async (t) => {
        const all: unknown[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db
            .from(t)
            .select("*")
            .order(
              t === "order_vendors" || t === "order_costs" ? "order_id" : "id",
            )
            .order(
              t === "order_vendors" || t === "order_costs"
                ? "item_index"
                : "id",
            )
            .range(offset, offset + 999);
          if (error) throw new Error(error.message);
          all.push(...data);
          if (data.length < 1000) break;
        }
        return [t, all] as const;
      }),
    );
    rows = Object.fromEntries(results);
  }
  const { workspace_settings, ...rest } = rows;
  return {
    ...rest,
    settings: workspace_settings[0],
    profile: user,
    demo: demoEnabled(),
  } as Snapshot;
}
export async function mutate(action: string, payload: unknown, key: string) {
  const user = await session();
  if (demoEnabled()) {
    const { mutate } = await import("../scripts/db-harness.mjs");
    return mutate(await demoDb(), action, payload, key, user.id);
  }
  const db = await createClient();
  const { data, error } = await db.rpc("crm_mutate", {
    action,
    p: payload,
    idempotency_key: key,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function sharedDocument(
  token: string,
): Promise<CommercialDocument | null> {
  if (!z.uuid().safeParse(token).success) return null;
  if (demoEnabled())
    return asUser(
      await demoDb(),
      null,
      async (tx) =>
        (
          await tx.query<{ document: CommercialDocument }>(
            "select shared_document($1::uuid) as document",
            [token],
          )
        ).rows[0].document,
    );
  if (!isSupabaseConfigured) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("shared_document", { token });
  if (error) return null;
  return data;
}
