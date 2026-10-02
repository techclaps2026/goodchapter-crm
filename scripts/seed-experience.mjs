// Run once against the linked workspace: node --env-file=.env.local scripts/seed-experience.mjs --apply
// Every record is fictional and uses a stable ID. Re-running never overwrites edits.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set the Supabase URL and service role key");
const db = createClient(url, key, { auth: { persistSession: false } });
const uid = (label) => {
  const hash = createHash("sha256")
    .update(`goodchapter-sample-v1:${label}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const date = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const timestamp = (days) =>
  new Date(Date.now() + days * 86400000).toISOString();
const created = [];
async function record(table, label, fields) {
  const id = uid(`${table}:${label}`);
  const { data: existing, error: readError } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing && apply) {
    const { error } = await db.from(table).insert({ id, ...fields });
    if (error) throw new Error(`${table}/${label}: ${error.message}`);
    created.push(`${table}: ${label}`);
  }
  return id;
}
async function link(table, label, fields) {
  let query = db
    .from(table)
    .select("order_id")
    .eq("order_id", fields.order_id)
    .eq("item_index", fields.item_index);
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw readError;
  if (!existing && apply) {
    const { error } = await db.from(table).insert(fields);
    if (error) throw new Error(`${table}/${label}: ${error.message}`);
    created.push(`${table}: ${label}`);
  }
}
const { data: profile, error: ownerError } = await db
  .from("profiles")
  .select("id")
  .eq("role", "owner")
  .eq("active", true)
  .limit(1)
  .maybeSingle();
if (ownerError || !profile) throw new Error("An active owner is required");
const { data: settings, error: settingsError } = await db
  .from("workspace_settings")
  .select("*")
  .eq("id", true)
  .single();
if (settingsError) throw settingsError;
const business = { ...settings };
delete business.id;

const clients = [
  {
    label: "welcome",
    name: "Sample · Meera Shah",
    organisation: "Sample Northstar Studio",
    email: "meera@example.test",
    shipping_address: "New Delhi, Delhi",
  },
  {
    label: "festive",
    name: "Sample · Arjun Rao",
    organisation: "Sample Fieldnotes Co.",
    email: "arjun@example.test",
    shipping_address: "Mumbai, Maharashtra",
  },
];
for (const c of clients) {
  c.id = await record("clients", c.label, {
    name: c.name,
    organisation: c.organisation,
    email: c.email,
    phone: "",
    billing_address: c.shipping_address,
    shipping_address: c.shipping_address,
    gstin: "",
    notes: "SAMPLE DATA · Fictional client for exploring the CRM.",
  });
}
const vendors = [
  {
    label: "apparel",
    name: "Sample · Thread & Form",
    category: "Apparel",
    subcategories: "Hoodies, varsity jackets, T-shirts, sweatshirts",
    city: "Delhi NCR",
  },
  {
    label: "diaries",
    name: "Sample · Paperfolk",
    category: "Diaries & stationery",
    subcategories: "Diaries, journals, notebooks, planners",
    city: "Mumbai",
  },
  {
    label: "candles",
    name: "Sample · Khate Meethe Desires",
    category: "Candles",
    subcategories: "Scented candles, gift candles, wax melts",
    city: "Delhi NCR",
  },
];
for (const v of vendors) {
  v.id = await record("vendors", v.label, {
    name: v.name,
    category: v.category,
    subcategories: v.subcategories,
    contact_name: "Sample contact",
    email: "",
    phone: "",
    city: v.city,
    notes:
      "SAMPLE DATA · Fictional vendor. Replace with real contact and catalogue details.",
  });
}
const leads = [
  {
    label: "welcome",
    name: "Sample · Meera Shah",
    client_id: clients[0].id,
    organisation: clients[0].organisation,
    source: "Referral",
    stage: "Won",
    brief: "Welcome kits with notebooks and T-shirts",
    quantity: 80,
    budget: 120000,
  },
  {
    label: "festive",
    name: "Sample · Arjun Rao",
    client_id: clients[1].id,
    organisation: clients[1].organisation,
    source: "Instagram",
    stage: "Won",
    brief: "Festive candle and diary sets",
    quantity: 60,
    budget: 90000,
  },
  {
    label: "varsity",
    name: "Sample · Riya Kapoor",
    client_id: null,
    organisation: "Sample Aster Campus",
    source: "Website",
    stage: "New",
    brief: "Varsity jackets for a graduating class",
    quantity: 120,
    budget: 240000,
  },
];
for (const lead of leads) {
  lead.id = await record("leads", lead.label, {
    name: lead.name,
    organisation: lead.organisation,
    email: "",
    phone: "",
    source: lead.source,
    stage: lead.stage,
    brief: lead.brief,
    quantity: lead.quantity,
    budget: lead.budget,
    required_date: date(21),
    assigned_to: profile.id,
    client_id: lead.client_id,
    notes: "SAMPLE DATA · Fictional enquiry.",
  });
}
function item(description, quantity, unit_price, category) {
  const subtotal = quantity * unit_price;
  return {
    description,
    quantity,
    unit_price,
    discount_pct: 0,
    tax_rate: 0,
    hsn: "",
    details: "Sample artwork and colours to be confirmed",
    category,
    subtotal,
    tax_amount: 0,
    total: subtotal,
  };
}
const quotes = [
  {
    label: "welcome",
    ref: "Q-SAMPLE-WELCOME",
    client: clients[0],
    lead: leads[0],
    title: "Sample · New starter welcome kits",
    status: "Accepted",
    items: [item("Notebook and T-shirt welcome kit", 80, 1250, "Gift boxes")],
  },
  {
    label: "festive",
    ref: "Q-SAMPLE-FESTIVE",
    client: clients[1],
    lead: leads[1],
    title: "Sample · Festive gift sets",
    status: "Accepted",
    items: [item("Scented candle and diary set", 60, 1450, "Gift boxes")],
  },
  {
    label: "hoodies",
    ref: "Q-SAMPLE-HOODIES",
    client: clients[0],
    lead: leads[0],
    title: "Sample · Team hoodies",
    status: "Draft",
    items: [item("Embroidered heavyweight hoodie", 40, 1850, "Apparel")],
  },
];
for (const quote of quotes) {
  const subtotal = quote.items.reduce((sum, line) => sum + line.subtotal, 0);
  quote.id = await record("documents", `quote:${quote.label}`, {
    kind: "quote",
    ref: quote.ref,
    title: quote.title,
    client_id: quote.client.id,
    lead_id: quote.lead.id,
    status: quote.status,
    valid_until: date(14),
    tax_mode: "None",
    items: quote.items,
    subtotal,
    tax_amount: 0,
    total: subtotal,
    customer: {
      name: quote.client.name,
      organisation: quote.client.organisation,
      email: quote.client.email,
      phone: "",
      billing_address: quote.client.shipping_address,
      shipping_address: quote.client.shipping_address,
      gstin: "",
    },
    business,
    terms: "SAMPLE DATA · Fictional quotation. Do not send to a customer.",
  });
}
const orders = [
  {
    label: "welcome",
    ref: "O-SAMPLE-WELCOME",
    quote: quotes[0],
    client: clients[0],
    vendor: vendors[0],
    status: "Design & Approval",
  },
  {
    label: "festive",
    ref: "O-SAMPLE-FESTIVE",
    quote: quotes[1],
    client: clients[1],
    vendor: vendors[2],
    status: "Confirmed",
  },
];
for (const order of orders) {
  order.id = await record("orders", order.label, {
    ref: order.ref,
    title: order.quote.title,
    quote_id: order.quote.id,
    client_id: order.client.id,
    status: order.status,
    required_date: date(21),
    shipping_address: order.client.shipping_address,
    notes: "SAMPLE DATA · Fictional order for exploring the workflow.",
  });
  await link("order_vendors", order.label, {
    order_id: order.id,
    item_index: 0,
    vendor_id: order.vendor.id,
  });
  await link("order_costs", order.label, {
    order_id: order.id,
    item_index: 0,
    amount: order.label === "welcome" ? 68000 : 50000,
  });
}
for (const order of orders) {
  const invoice = {
    label: order.label,
    ref: `INV-SAMPLE-${order.label.toUpperCase()}`,
    status: order.label === "welcome" ? "Issued" : "Draft",
    title: order.quote.title,
  };
  await record("documents", `invoice:${invoice.label}`, {
    kind: "invoice",
    ref: invoice.ref,
    title: invoice.title,
    client_id: order.client.id,
    order_id: order.id,
    status: invoice.status,
    issued_on: invoice.status === "Issued" ? date(-1) : null,
    due_on: date(14),
    tax_mode: "None",
    items: order.quote.items,
    subtotal: order.quote.items[0].subtotal,
    tax_amount: 0,
    total: order.quote.items[0].total,
    customer: {
      name: order.client.name,
      organisation: order.client.organisation,
      email: order.client.email,
      phone: "",
      billing_address: order.client.shipping_address,
      shipping_address: order.client.shipping_address,
      gstin: "",
    },
    business,
    terms: "SAMPLE DATA · Fictional invoice. No payment is due.",
  });
}
for (const [index, order] of orders.entries()) {
  await record("payments", order.label, {
    order_id: order.id,
    amount: index === 0 ? 50000 : 25000,
    kind: "Receipt",
    method: "Bank Transfer",
    payment_date: date(-1),
    reference: `SAMPLE-ADVANCE-${index + 1}`,
    notes: "SAMPLE DATA · Fictional receipt. No money changed hands.",
    created_by: profile.id,
  });
}
for (const followup of [
  {
    label: "artwork",
    title: "Sample · Review welcome-kit artwork",
    order_id: orders[0].id,
    client_id: clients[0].id,
    due_at: timestamp(2),
    priority: "High",
  },
  {
    label: "candles",
    title: "Sample · Confirm candle fragrances",
    order_id: orders[1].id,
    client_id: clients[1].id,
    due_at: timestamp(5),
    priority: "Medium",
  },
  {
    label: "varsity",
    title: "Sample · Send varsity jacket swatches",
    order_id: null,
    client_id: null,
    lead_id: leads[2].id,
    due_at: timestamp(-1),
    priority: "High",
  },
]) {
  await record("followups", followup.label, {
    title: followup.title,
    lead_id: followup.lead_id ?? null,
    client_id: followup.client_id,
    order_id: followup.order_id,
    assigned_to: profile.id,
    due_at: followup.due_at,
    done: false,
    priority: followup.priority,
    notes: "SAMPLE DATA · Fictional follow-up.",
  });
}

if (apply) {
  for (const sample of [
    {
      vendor: vendors[0],
      title: "Sample apparel catalogue",
      products: "Hoodies | Varsity jackets | T-shirts | Sweatshirts",
    },
    {
      vendor: vendors[2],
      title: "Sample candle catalogue",
      products: "Scented candles | Gift candles | Wax melts",
    },
  ]) {
    const vendorId = sample.vendor.id;
    const path = `${vendorId}/${uid(`catalog:${sample.vendor.label}`)}.pdf`;
    const { data: vendor, error } = await db
      .from("vendors")
      .select("catalog_path")
      .eq("id", vendorId)
      .single();
    if (error) throw error;
    if (vendor.catalog_path) continue;
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(sample.title, 20, 28);
    pdf.setFontSize(11);
    pdf.text("Fictional products for trying The Good Chapter CRM", 20, 42);
    pdf.text(sample.products, 20, 58);
    pdf.text("SAMPLE DATA - Not a real vendor offer", 20, 75);
    const { error: uploadError } = await db.storage
      .from("vendor-catalogs")
      .upload(path, new Uint8Array(pdf.output("arraybuffer")), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError && !/already exists/i.test(uploadError.message))
      throw uploadError;
    const { error: updateError } = await db
      .from("vendors")
      .update({ catalog_path: path, catalog_name: `${sample.title}.pdf` })
      .eq("id", vendorId);
    if (updateError) throw updateError;
    created.push(`catalogue: ${sample.title}.pdf`);
  }
}
console.log(
  apply
    ? `Created ${created.length} sample records/files`
    : "Dry run complete; pass --apply to seed",
);
if (apply) created.forEach((entry) => console.log(entry));
