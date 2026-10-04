export type Role = "owner" | "co_owner" | "admin" | "staff";
export const hasOwnerAccess = (role: Role) => role !== "staff";
export const canManageUsers = (role: Role) =>
  role === "owner" || role === "admin";
export const roleLabels: Record<Role, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  admin: "Admin",
  staff: "Staff",
};
export interface Profile {
  id: string;
  full_name: string;
  email?: string;
  role: Role;
  active: boolean;
  deleted_at?: string | null;
  avatar_path?: string;
}
export interface Settings {
  company_name: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  logo_url: string;
  bank_details: string;
  upi_id: string;
  terms: string;
}
export interface Client {
  id: string;
  name: string;
  organisation: string;
  email: string;
  phone: string;
  billing_address: string;
  shipping_address: string;
  gstin: string;
  notes: string;
  archived: boolean;
}
export interface Lead {
  id: string;
  name: string;
  organisation: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  brief: string;
  quantity: number | null;
  budget: number | null;
  required_date: string | null;
  assigned_to: string | null;
  client_id: string | null;
  notes: string;
  created_at: string;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  customisation: string;
  image_url: string;
  unit_price: number;
  archived: boolean;
}
export interface Vendor {
  id: string;
  name: string;
  category: string;
  subcategories: string;
  social_links: string;
  products_list: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  notes: string;
  archived: boolean;
  catalog_path: string;
  catalog_name: string;
}
export interface VendorCatalog {
  id: string;
  vendor_id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
}
export interface LineInput {
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_rate: number;
  hsn: string;
  details: string;
  category: string;
  image_path?: string;
  moq?: number | null;
  notes?: string;
}
export interface Line extends LineInput {
  subtotal: number;
  tax_amount: number;
  total: number;
}
export type TaxMode = "None" | "CGST/SGST" | "IGST";
export type QuotePricingMode = "priced" | "selection";
export interface QuoteOption {
  id: string;
  title: string;
  details: string;
  image_path: string;
  unit_price: number;
}
export interface QuoteOptionGroup {
  id: string;
  title: string;
  note?: string;
  quantity: number;
  options: QuoteOption[];
}
export interface CommercialDocument {
  id: string;
  kind: "quote" | "invoice";
  ref: string;
  title: string;
  client_id: string;
  lead_id: string | null;
  order_id: string | null;
  status: string;
  valid_until: string | null;
  issued_on: string | null;
  due_on: string | null;
  tax_mode: TaxMode;
  show_discount: boolean;
  pricing_mode?: QuotePricingMode;
  client_choice_enabled?: boolean;
  items: Line[];
  quote_options?: QuoteOptionGroup[];
  quote_selections?: Record<string, string>;
  quote_selected_at?: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  customer: Omit<Client, "id" | "notes" | "archived">;
  business: Settings;
  terms: string;
  revision_of: string | null;
  share_token: string | null;
  payment_qr_enabled: boolean;
  created_at: string;
}
export interface Order {
  id: string;
  ref: string;
  title: string;
  quote_id: string;
  client_id: string;
  status: string;
  required_date: string | null;
  shipping_address: string;
  courier: string;
  tracking_ref: string;
  dispatched_on: string | null;
  delivered_on: string | null;
  approval_not_required: boolean;
  notes: string;
  created_at: string;
}
export interface Artwork {
  id: string;
  order_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  status: string;
  notes: string;
  approved_at: string | null;
  approved_by: string | null;
}
export interface Followup {
  id: string;
  title: string;
  lead_id: string | null;
  client_id: string | null;
  order_id: string | null;
  assigned_to: string | null;
  due_at: string;
  priority: string;
  notes: string;
  done: boolean;
}
export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  kind: "Receipt" | "Refund";
  method: string;
  payment_date: string;
  reference: string;
  notes: string;
}
export interface Snapshot {
  demo: boolean;
  profile: Profile;
  profiles: Profile[];
  settings: Settings;
  leads: Lead[];
  clients: Client[];
  products: Product[];
  vendors: Vendor[];
  vendor_catalogs: VendorCatalog[];
  documents: CommercialDocument[];
  orders: Order[];
  artwork: Artwork[];
  followups: Followup[];
  payments: Payment[];
  order_vendors: {
    order_id: string;
    item_index: number;
    vendor_id: string | null;
  }[];
  order_costs: { order_id: string; item_index: number; amount: number }[];
}
export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Quote Sent",
  "Follow-up",
  "Won",
  "Lost",
];
export const ORDER_STAGES = [
  "Confirmed",
  "Design & Approval",
  "Production",
  "Quality Check",
  "Dispatched",
  "Delivered",
  "Cancelled",
];
export const CATEGORIES = [
  "Apparel",
  "Bottles & drinkware",
  "Diaries & stationery",
  "Candles",
  "Gift boxes",
  "Packaging",
  "Service / charge",
  "Other",
];
