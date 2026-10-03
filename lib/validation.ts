import { z } from "zod";
export const roleSchema = z.enum(["owner", "co_owner", "admin", "staff"]);
export const invitationSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(1).max(100),
  role: roleSchema,
});
const text = z.string().trim().max(5000);
const name = text.min(1).max(200);
const id = z.uuid();
const optionalId = id.nullable();
const date = z.iso.date().nullable();
const amount = z.number().min(0).max(100000000).multipleOf(0.01);
const email = z.union([z.email(), z.literal("")]);
const url = z.union([
  z.url().refine((u) => u.startsWith("https://"), "Use an HTTPS image URL"),
  z.literal(""),
]);
const common = { id: id.optional() };
const line = z.object({
  description: name,
  quantity: z.number().int().min(1).max(1000000),
  unit_price: amount,
  discount_pct: z.number().min(0).max(100).multipleOf(0.01),
  tax_rate: z.number().min(0).max(100).multipleOf(0.01),
  hsn: text.max(20),
  details: text,
  category: name,
  image_path: z.union([z.literal(""), z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)]).optional(),
  moq: z.number().int().min(1).max(1000000).nullable().optional(),
  notes: text.max(1000).optional(),
});
const quoteOption = z.object({
  id,
  title: name.max(120),
  details: text.max(1000),
  image_path: z.union([z.literal(""), z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)]),
  unit_price: amount,
});
const quoteOptionGroup = z.object({
  id,
  title: name.max(120),
  quantity: z.number().int().min(1).max(1000000),
  options: z.array(quoteOption).min(1).max(8),
});
export const schemas = {
  save_client: z.object({
    ...common,
    name,
    organisation: text,
    email,
    phone: text,
    billing_address: text,
    shipping_address: text,
    gstin: text.max(20),
    notes: text,
    archived: z.boolean().optional(),
  }),
  save_lead: z.object({
    ...common,
    name,
    organisation: text,
    email,
    phone: text,
    source: z.enum([
      "Website",
      "Referral",
      "Instagram",
      "WhatsApp",
      "Walk-in",
      "Other",
    ]),
    stage: z.enum([
      "New",
      "Contacted",
      "Quote Sent",
      "Follow-up",
      "Won",
      "Lost",
    ]),
    brief: text,
    quantity: z.number().int().positive().nullable(),
    budget: amount.nullable(),
    required_date: date,
    assigned_to: optionalId,
    client_id: optionalId,
    notes: text,
  }),
  save_product: z.object({
    ...common,
    name,
    category: name,
    description: text,
    customisation: text,
    image_url: url,
    unit_price: amount,
    archived: z.boolean().optional(),
  }),
  save_vendor: z.object({
    ...common,
    name,
    category: name,
    subcategories: text.max(2000).optional(),
    social_links: text.max(3000).optional(),
    products_list: text.max(5000).optional(),
    contact_name: text,
    email,
    phone: text,
    city: text,
    notes: text,
    archived: z.boolean().optional(),
  }),
  save_followup: z.object({
    ...common,
    title: name,
    lead_id: optionalId,
    client_id: optionalId,
    order_id: optionalId,
    assigned_to: optionalId,
    due_at: z.iso.datetime({ offset: true }),
    done: z.boolean(),
    priority: z.enum(["High", "Medium", "Low"]),
    notes: text,
  }),
  save_quote: z.object({
    ...common,
    title: name,
    client_id: id,
    lead_id: optionalId,
    valid_until: date,
    tax_mode: z.enum(["None", "CGST/SGST", "IGST"]),
    pricing_mode: z.enum(["priced", "selection"]).default("priced"),
    items: z.array(line).max(100),
    quote_options: z.array(quoteOptionGroup).max(20).optional(),
    terms: text,
  }).superRefine((quote, ctx) => {
    if (quote.pricing_mode === "priced" && quote.items.length === 0)
      ctx.addIssue({ code: "custom", path: ["items"], message: "Add at least one priced item" });
    if (quote.pricing_mode === "selection") {
      if (!quote.quote_options?.length)
        ctx.addIssue({ code: "custom", path: ["quote_options"], message: "Add at least one choice group" });
      if (quote.tax_mode !== "None")
        ctx.addIssue({ code: "custom", path: ["tax_mode"], message: "Selection proposals cannot include tax" });
      if (quote.quote_options?.some((group) => group.options.some((option) => option.unit_price !== 0)))
        ctx.addIssue({ code: "custom", path: ["quote_options"], message: "Selection proposals cannot include prices" });
    }
  }),
  quote_status: z.object({
    id,
    status: z.enum(["Draft", "Sent", "Accepted", "Rejected"]),
  }),
  convert_lead: z.object({ id }),
  revise_quote: z.object({ id }),
  convert_quote: z.object({ id }),
  save_order: z.object({
    id,
    status: z.enum([
      "Confirmed",
      "Design & Approval",
      "Production",
      "Quality Check",
      "Dispatched",
      "Delivered",
      "Cancelled",
    ]),
    required_date: date,
    shipping_address: text,
    courier: text,
    tracking_ref: text,
    dispatched_on: date,
    delivered_on: date,
    approval_not_required: z.boolean(),
    notes: text,
  }),
  assign_vendor: z.object({
    order_id: id,
    item_index: z.number().int().nonnegative(),
    vendor_id: optionalId,
  }),
  save_cost: z.object({
    order_id: id,
    item_index: z.number().int().nonnegative(),
    amount,
  }),
  add_artwork: z.object({
    order_id: id,
    file_name: name,
    storage_path: text.min(1),
    notes: text,
  }),
  review_artwork: z.object({
    id,
    status: z.enum(["Pending", "Approved", "Changes requested"]),
    notes: text,
  }),
  create_invoice: z.object({ id, due_on: date }),
  save_invoice: z.object({
    id,
    title: name,
    due_on: date,
    tax_mode: z.enum(["None", "CGST/SGST", "IGST"]),
    items: z.array(line).min(1).max(100),
    terms: text,
  }),
  revise_invoice: z.object({ id }),
  issue_invoice: z.object({ id, due_on: date }),
  share_document: z.object({ id, enabled: z.boolean() }),
  log_payment: z.object({
    order_id: id,
    amount: amount.positive(),
    kind: z.enum(["Receipt", "Refund"]),
    method: z.enum(["UPI", "Bank Transfer", "Cash", "Card", "Cheque", "Other"]),
    payment_date: z.iso.date(),
    reference: text,
    notes: text,
  }),
  update_payment: z.object({
    id,
    order_id: id,
    amount: amount.positive(),
    kind: z.enum(["Receipt", "Refund"]),
    method: z.enum(["UPI", "Bank Transfer", "Cash", "Card", "Cheque", "Other"]),
    payment_date: z.iso.date(),
    reference: text,
    notes: text,
  }),
  delete_record: z.object({
    id,
    kind: z.enum([
      "client",
      "lead",
      "product",
      "vendor",
      "followup",
      "payment",
      "quote",
      "invoice",
      "order",
    ]),
  }),
  save_settings: z.object({
    company_name: name,
    email,
    phone: text,
    address: text,
    gstin: text.max(20),
    bank_details: text,
    terms: text,
  }),
  update_user: z.object({
    id,
    full_name: name,
    role: roleSchema,
    active: z.boolean(),
  }),
} as const;
export type Action = keyof typeof schemas;
export function validateMutation(input: unknown) {
  const env = z
    .object({
      action: z.enum(Object.keys(schemas) as [Action, ...Action[]]),
      payload: z.unknown(),
      key: id,
    })
    .parse(input);
  return { ...env, payload: schemas[env.action].parse(env.payload) };
}
