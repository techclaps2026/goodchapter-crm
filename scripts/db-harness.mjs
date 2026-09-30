import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export const OWNER = "00000000-0000-4000-8000-000000000001";
export const STAFF = "00000000-0000-4000-8000-000000000002";
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',invited_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 grant select,insert on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
  let migration = await readFile(
    resolve(
      process.cwd(),
      "supabase/migrations/20260929180000_goodchapter.sql",
    ),
    "utf8",
  );
  migration = migration.replace("create extension if not exists pgcrypto;", "");
  await db.exec(migration);
  await db.exec(
    `insert into auth.users(id,raw_user_meta_data,invited_at) values('${OWNER}','{"full_name":"Studio owner"}',now()),('${STAFF}','{"full_name":"Aanya · Studio team"}',now());update profiles set role='owner' where id='${OWNER}';`,
  );
  return db;
}
export async function asUser(db, user, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user ?? "",
    ]);
    return fn(tx);
  });
}
export async function mutate(
  db,
  action,
  p,
  key = crypto.randomUUID(),
  user = OWNER,
) {
  return asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query("select crm_mutate($1,$2::jsonb,$3::uuid) as result", [
          action,
          JSON.stringify(p),
          key,
        ])
      ).rows[0].result,
  );
}
export async function seedDemo(db) {
  const c1 = (
    await mutate(db, "save_client", {
      name: "Meera Shah",
      organisation: "Northstar Labs",
      email: "meera@example.test",
      phone: "",
      billing_address: "Bengaluru, Karnataka",
      shipping_address: "Northstar Labs, Bengaluru",
      gstin: "",
      notes: "",
    })
  ).id;
  const c2 = (
    await mutate(db, "save_client", {
      name: "Arjun Rao",
      organisation: "Fieldnotes Collective",
      email: "arjun@example.test",
      phone: "",
      billing_address: "Mumbai, Maharashtra",
      shipping_address: "Fieldnotes studio, Mumbai",
      gstin: "",
      notes: "",
    })
  ).id;
  const days = (n) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  for (const p of [
    {
      name: "Everyday heavyweight tee",
      category: "Apparel",
      description: "240 GSM cotton tee",
      customisation: "Screen print · sizes XS–3XL",
      unit_price: 650,
    },
    {
      name: "Desk companion bottle",
      category: "Bottles & drinkware",
      description: "750 ml insulated steel bottle",
      customisation: "Laser engraving",
      unit_price: 780,
    },
    {
      name: "A good start kit",
      category: "Gift boxes",
      description: "Notebook, bottle and welcome card",
      customisation: "Custom sleeve · individual names",
      unit_price: 1450,
    },
    {
      name: "Softcover notebook",
      category: "Diaries & stationery",
      description: "A5 notebook, 160 pages",
      customisation: "Foil stamp · blind deboss",
      unit_price: 290,
    },
  ])
    await mutate(db, "save_product", { ...p, image_url: "" });
  await mutate(db, "save_vendor", {
    name: "Thread & Form Studio",
    category: "Apparel",
    contact_name: "Kabir",
    email: "vendor@example.test",
    phone: "",
    city: "Delhi",
    notes: "",
  });
  for (const [i, l] of [
    {
      name: "Meera Shah",
      organisation: "Northstar Labs",
      brief: "Welcome kits for the new cohort",
      quantity: 80,
      budget: 150000,
      stage: "Won",
      client_id: c1,
    },
    {
      name: "Arjun Rao",
      organisation: "Fieldnotes Collective",
      brief: "Studio anniversary merchandise",
      quantity: 120,
      budget: 90000,
      stage: "Quote Sent",
      client_id: c2,
    },
    {
      name: "Riya Kapoor",
      organisation: "Aster Campus",
      brief: "Varsity jackets for the graduating class",
      quantity: 150,
      budget: 300000,
      stage: "New",
      client_id: null,
    },
    {
      name: "Dev Sen",
      organisation: "Common Ground",
      brief: "Diwali gifting · candles and notebooks",
      quantity: 60,
      budget: 80000,
      stage: "Follow-up",
      client_id: null,
    },
  ].entries())
    await mutate(db, "save_lead", {
      ...l,
      email: "hello@example.test",
      phone: "",
      source: ["Referral", "Instagram", "Website", "WhatsApp"][i],
      required_date: days(8 + i * 3),
      assigned_to: STAFF,
      notes: "",
    });
  const line = (description, quantity, unit_price, category = "Apparel") => ({
    description,
    quantity,
    unit_price,
    category,
    discount_pct: 0,
    tax_rate: 0,
    hsn: "",
    details: "Artwork and colour to be approved",
  });
  for (const [title, client_id, items, status, due] of [
    [
      "A good start · welcome kits",
      c1,
      [line("Welcome kit", 80, 1450, "Gift boxes")],
      "Production",
      8,
    ],
    [
      "Studio anniversary tees",
      c2,
      [line("Heavyweight cotton tee", 120, 650)],
      "Design & Approval",
      12,
    ],
  ]) {
    const q = (
      await mutate(db, "save_quote", {
        title,
        client_id,
        lead_id: null,
        valid_until: days(14),
        tax_mode: "None",
        items,
        terms: "50% advance. Balance before dispatch.",
      })
    ).id;
    await mutate(db, "quote_status", { id: q, status: "Accepted" });
    const o = (await mutate(db, "convert_quote", { id: q })).id;
    await mutate(db, "save_order", {
      id: o,
      status,
      required_date: days(due),
      shipping_address: "Client office",
      courier: "",
      tracking_ref: "",
      dispatched_on: null,
      delivered_on: null,
      approval_not_required: status === "Production",
      notes: "",
    });
    const inv = (
      await mutate(db, "create_invoice", { id: o, due_on: days(due - 1) })
    ).id;
    await mutate(db, "issue_invoice", { id: inv, due_on: days(due - 1) });
    await mutate(db, "log_payment", {
      order_id: o,
      amount: (Number(items[0].quantity) * Number(items[0].unit_price)) / 2,
      kind: "Receipt",
      method: "Bank Transfer",
      payment_date: days(-2),
      reference: "DEMO-ADVANCE",
      notes: "Fictional sample receipt",
    });
  }
  await mutate(db, "save_quote", {
    title: "Festive desk essentials",
    client_id: c2,
    lead_id: null,
    valid_until: days(7),
    tax_mode: "None",
    items: [line("Notebook & candle set", 60, 950, "Gift boxes")],
    terms: "Packaging subject to approval.",
  });
  await mutate(db, "save_followup", {
    title: "Confirm the welcome-kit sleeve artwork",
    lead_id: null,
    client_id: c1,
    order_id: null,
    assigned_to: STAFF,
    due_at: new Date(Date.now() - 86400000).toISOString(),
    done: false,
    priority: "High",
    notes: "Check the placement of the new brand mark.",
  });
  await mutate(db, "save_followup", {
    title: "Share fabric swatches with Fieldnotes",
    lead_id: null,
    client_id: c2,
    order_id: null,
    assigned_to: OWNER,
    due_at: new Date(Date.now() + 3600000).toISOString(),
    done: false,
    priority: "Medium",
    notes: "Sand and charcoal colourways.",
  });
}
