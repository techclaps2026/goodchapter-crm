/* eslint-disable @next/next/no-img-element -- Original SVG brand and user-provided catalogue URLs. */
"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  UserCheck,
  CalendarCheck,
  FileText,
  Package,
  Gift,
  Building2,
  Receipt,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  UserCircle,
  Plus,
  Search,
  ArrowUpRight,
  Menu,
  X,
  LogOut,
  Download,
  Copy,
  Shirt,
  BookOpen,
  Droplets,
  Flame,
  ChevronRight,
  ArrowLeft,
  Share2,
  Mail,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useCRM } from "./use-crm";
import { Badge, Empty, Modal } from "./shared";
import EntityForm, { type EntityKind } from "./EntityForm";
import QuoteEditor from "./QuoteEditor";
import DocumentView from "./DocumentView";
import QuoteEngagement from "./QuoteEngagement";
import OrderDetail from "./OrderDetail";
import Settings from "./Settings";
import AccountSettings from "./AccountSettings";
import InvoiceGenerator from "./InvoiceGenerator";
import SendEmail from "./SendEmail";
import SocialMedia from "./SocialMedia";
import MailCenter from "./MailCenter";
import { matchesVendor } from "@/lib/vendor-search";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import CrmLoading from "./CrmLoading";
import {
  money,
  dateLabel,
  today,
  orderMoney,
  paymentState,
} from "@/lib/domain";
import type { CommercialDocument, Snapshot, Followup } from "@/lib/types";
import {
  canManageUsers,
  hasOwnerAccess,
  roleLabels,
  LEAD_STAGES,
  ORDER_STAGES,
} from "@/lib/types";
import type { Action } from "@/lib/validation";
const NAV: { group: string; items: [string, string, LucideIcon][] }[] = [
  { group: "CRM", items: [["dashboard", "Dashboard", Home]] },
  {
    group: "SALES",
    items: [
      ["leads", "Leads", Users],
      ["clients", "Clients", UserCheck],
      ["followups", "Follow-ups", CalendarCheck],
      ["quotations", "Quotations", FileText],
    ],
  },
  {
    group: "OPERATIONS",
    items: [
      ["orders", "Orders", Package],
      ["vendors", "Vendors", Building2],
    ],
  },
  {
    group: "FINANCE",
    items: [
      ["invoices", "Invoices", Receipt],
      ["payments", "Payments", Wallet],
      ["reports", "Reports", BarChart3],
    ],
  },
  {
    group: "COMMUNICATION",
    items: [
      ["social", "Social Media", Share2],
      ["mail", "Mail center", Mail],
    ],
  },
  {
    group: "MANAGE",
    items: [
      ["settings", "Settings", SettingsIcon],
      ["users", "User management", Users],
      ["account", "User settings", UserCircle],
    ],
  },
];
const titles: Record<string, string> = {
  products: "Products", // Existing product links still resolve; only the menu item is hidden.
  ...Object.fromEntries(
    NAV.flatMap((g) => g.items.map(([id, title]) => [id, title])),
  ),
};
const descriptions: Record<string, string> = {
  dashboard: "A little clarity for everything you’re creating.",
  leads: "Good conversations. Great possibilities.",
  clients: "The people and organisations behind every chapter.",
  followups: "Keep the conversation moving.",
  quotations: "Turn a brief into something worth making.",
  orders: "Every detail, from the first design to the final delivery.",
  products: "A considered collection. Made personal.",
  vendors: "The makers who bring your ideas to life.",
  invoices: "Clear documents. Confident collections.",
  payments: "Every advance, receipt and balance in one place.",
  reports: "A clear view of your studio’s business.",
  settings: "Business details, documents and connected services.",
  users: "Invite teammates and manage their access.",
  account: "Your profile and sign-in settings.",
  social: "Create, schedule and manage your social posts.",
  mail: "Send thoughtful mailshots and follow each conversation.",
};
const salesFlow: Record<string, string> = {
  leads: "Start with an enquiry. Capture the brief, budget and deadline; assign an owner, then create a client when the opportunity is ready.",
  clients: "Keep one record per customer for contact and billing details. Open a client to review linked enquiries, quotations, orders and follow-ups.",
  followups: "Plan the next conversation against a lead, client or order. Prioritise by due date, then mark it done after the action is complete.",
  quotations: "Start with a selection proposal to collect the client’s preferred items without prices, then create a priced revision. Or build a priced quotation directly with photos, MOQ and notes before accepting it and creating an order.",
};
const SIDEBAR_SCROLL_KEY = "tgc-sidebar-scroll";
type FormState =
  | {
      kind: EntityKind;
      initial?: Record<string, string | number | boolean | null>;
    }
  | { kind: "quote"; doc?: CommercialDocument; clientId?: string }
  | { kind: "invoice"; doc: CommercialDocument }
  | null;
function table(headers: string[], rows: React.ReactNode[][], empty: string, className = "") {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j} data-label={headers[j]}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          title={empty}
          description="Add your first record, or adjust your search and filters."
        />
      )}
    </div>
  );
}
function clientLocation(address: string) {
  const parts = address.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "india") parts.pop();
  const location = parts.slice(-2).map((part) => part.replace(/\b\d{6}\b/g, "").replace(/[\s-]+$/, "").trim()).filter(Boolean);
  return location.join(", ") || "—";
}
function VendorSpeciality({ category, subcategories, productsList }: {
  category: string;
  subcategories: string;
  productsList: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const descriptionRef = useRef<HTMLElement>(null);
  const description = [subcategories, productsList].filter(Boolean).join(" · ");
  useLayoutEffect(() => {
    if (expanded) return;
    const element = descriptionRef.current;
    if (!element) return;
    const measure = () => setHasOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);
  return (
    <div className="vendor-speciality">
      <span>{category}</span>
      <small ref={descriptionRef} className={expanded ? "" : "vendor-speciality-preview"}>
        {description || "—"}
      </small>
      {hasOverflow && <button type="button" className="text-link vendor-speciality-toggle"
        aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : "Show full list"}
      </button>}
    </div>
  );
}
function entityValues(x: unknown) {
  return x as Record<string, string | number | boolean | null>;
}
export default function CRM({
  section: serverSection,
}: {
  section: string;
  recordId?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const pathname = usePathname();
  const [pathSection, pathRecordId] = pathname.split("/").filter(Boolean);
  const section = pathSection
    ? titles[pathSection]
      ? pathSection
      : serverSection
    : "dashboard";
  const recordId =
    pathSection && titles[pathSection] ? pathRecordId : undefined;
  const { data: s, isLoading, error, mutate, busy, refresh } = useCRM();
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [vendorLocation, setVendorLocation] = useState("All locations");
  const [form, setForm] = useState<FormState>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const sidebarNavRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!s || !sidebarNavRef.current) return;
    try {
      const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY));
      if (Number.isFinite(saved)) sidebarNavRef.current.scrollTop = saved;
    } catch {
      // Navigation still works if browser storage is unavailable.
    }
  }, [s, section, navOpen]);
  const saveSidebarScroll = () => {
    if (!sidebarNavRef.current) return;
    if (window.matchMedia("(max-width: 879px)").matches && !navOpen) return;
    try {
      sessionStorage.setItem(
        SIDEBAR_SCROLL_KEY,
        String(sidebarNavRef.current.scrollTop),
      );
    } catch {
      // Storage is only needed to restore position after route changes.
    }
  };
  const navigateSection = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    saveSidebarScroll();
    setNavOpen(false);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    setSearch("");
    setFilter("All");
    setVendorLocation("All locations");
    setForm(null);
    setEmailOpen(false);
    setInvoiceOpen(false);
    const href = id === "dashboard" ? "/" : `/${id}`;
    if (window.location.pathname !== href) {
      window.history.pushState(null, "", href);
      window.scrollTo(0, 0);
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };
  const downloadPdf = (document: CommercialDocument) =>
    run(async () => {
      setPdfBusy(true);
      try {
        await (await import("@/lib/document-pdf")).downloadDocument(document);
      } finally {
        setPdfBusy(false);
      }
    });
  if (isLoading) return <CrmLoading />;
  if (error || !s)
    return (
      <div className="error-screen">
        <h1>Couldn’t load the CRM.</h1>
        <p style={{ margin: "18px 0" }}>{error?.message}</p>
        <button className="button" onClick={() => refresh()}>
          Try again
        </button>{" "}
        <Link className="button" href="/login">
          Sign in
        </Link>
      </div>
    );
  const owner = hasOwnerAccess(s.profile.role);
  const q = search.toLowerCase();
  const matches = (x: unknown) => JSON.stringify(x).toLowerCase().includes(q);
  const link = (
    route: string,
    id: string,
    title: React.ReactNode,
    sub?: React.ReactNode,
  ) => (
    <Link className="text-link" href={`/${route}/${id}`}>
      {title}
      {sub && <small>{sub}</small>}
    </Link>
  );
  const edit = (kind: EntityKind, item: unknown, iconOnly = false) => (
    <button
      className={`button small${iconOnly ? " record-action" : ""}`}
      aria-label={iconOnly ? `Edit ${kind}` : undefined}
      title={iconOnly ? `Edit ${kind}` : undefined}
      onClick={() => setForm({ kind, initial: entityValues(item) })}
    >
      {iconOnly ? <Pencil size={16} aria-hidden="true" /> : "Edit"}
    </button>
  );
  const archive = (
    kind: "client" | "product" | "vendor",
    item: { id: string; archived: boolean },
    iconOnly = false,
  ) => (
    <button
      className={`button small${iconOnly ? " record-action" : ""}`}
      aria-label={iconOnly ? `${item.archived ? "Restore" : "Archive"} ${kind}` : undefined}
      title={iconOnly ? `${item.archived ? "Restore" : "Archive"} ${kind}` : undefined}
      disabled={busy}
      onClick={() =>
        run(() => {
          const source = s[
            kind === "client"
              ? "clients"
              : kind === "product"
                ? "products"
                : "vendors"
          ].find((i) => i.id === item.id);
          if (!source) throw new Error("Record not found");
          const payload =
            kind === "vendor"
              ? (() => {
                  const v = source as (typeof s.vendors)[number];
                  return {
                    id: v.id,
                    name: v.name,
                    category: v.category,
                    subcategories: v.subcategories,
                    contact_name: v.contact_name,
                    email: v.email,
                    phone: v.phone,
                    city: v.city,
                    notes: v.notes,
                    archived: !v.archived,
                  };
                })()
              : { ...source, archived: !item.archived };
          return mutate(`save_${kind}` as Action, payload, `${kind[0].toUpperCase()}${kind.slice(1)} ${item.archived ? "restored" : "archived"}`);
        })
      }
    >
      {iconOnly ? item.archived
        ? <ArchiveRestore size={16} aria-hidden="true" />
        : <Archive size={16} aria-hidden="true" />
        : item.archived ? "Restore" : "Archive"}
    </button>
  );
  const removeRecord = (
    kind:
      | "client"
      | "lead"
      | "product"
      | "vendor"
      | "followup"
      | "payment"
      | "quote"
      | "invoice"
      | "order",
    id: string,
    label: string,
    catalogPaths: string[] = [],
    iconOnly = false,
  ) =>
    canManageUsers(s.profile.role) ? (
      <button
        key="delete"
        className={`button small danger${iconOnly ? " record-action" : ""}`}
        aria-label={iconOnly ? `Delete ${label}` : undefined}
        title={iconOnly ? `Delete ${label}` : undefined}
        disabled={busy}
        onClick={async () => {
          const agreed = await confirm({
            title: `Delete ${label}?`,
            description: "Linked records must be removed first. This permanently deletes the record and cannot be undone.",
            confirmLabel: "Delete permanently",
            destructive: true,
          });
          if (!agreed) return;
          await run(async () => {
            await mutate("delete_record", { kind, id });
            if (catalogPaths.length)
              await createClient()
                .storage.from("vendor-catalogs")
                .remove(catalogPaths);
            if (recordId === id) router.push(`/${section}`);
          });
        }}
      >
        {iconOnly ? <Trash2 size={16} aria-hidden="true" /> : "Delete"}
      </button>
    ) : null;
  const clientName = (id: string | null) =>
    s.clients.find((c) => c.id === id)?.organisation ||
    s.clients.find((c) => c.id === id)?.name ||
    "—";
  const person = (id: string | null) =>
    s.profiles.find((p) => p.id === id)?.full_name || "Unassigned";
  const doc = recordId
    ? s.documents.find(
        (d) =>
          d.id === recordId &&
          d.kind === (section === "invoices" ? "invoice" : "quote"),
      )
    : undefined;
  const order =
    section === "orders" ? s.orders.find((o) => o.id === recordId) : undefined;
  const client =
    section === "clients"
      ? s.clients.find((c) => c.id === recordId)
      : undefined;
  const heading =
    doc?.ref ??
    order?.ref ??
    client?.organisation ??
    client?.name ??
    titles[section];
  const openNew = () => {
    const kinds: Record<string, EntityKind> = {
      leads: "lead",
      clients: "client",
      followups: "followup",
      products: "product",
      vendors: "vendor",
      payments: "payment",
    };
    if (section === "quotations") setForm({ kind: "quote" });
    else if (kinds[section]) setForm({ kind: kinds[section] });
    else router.push("/quotations");
  };
  const followupToggle = (f: Followup) =>
    run(() =>
      mutate("save_followup", {
        id: f.id,
        title: f.title,
        lead_id: f.lead_id,
        client_id: f.client_id,
        order_id: f.order_id,
        assigned_to: f.assigned_to,
        due_at: new Date(f.due_at).toISOString(),
        done: !f.done,
        priority: f.priority,
        notes: f.notes,
      }),
    );
  const documentRows = (docs: CommercialDocument[], showPayment = false) =>
    docs.map((d) => [
      link(
        d.kind === "quote" ? "quotations" : "invoices",
        d.id,
        d.ref,
        d.title,
      ),
      clientName(d.client_id),
      <span key="status"><Badge>{d.status}</Badge>{d.pricing_mode === "selection" && <small>Selection proposal</small>}</span>,
      d.kind === "quote" && d.pricing_mode === "selection" ? "Pricing pending" : money(d.total),
      ...(showPayment
        ? [
            d.kind === "quote" ? (
              <span key="payment">—</span>
            ) : d.status === "Superseded" ? (
              <Badge key="payment">Revised</Badge>
            ) : (
              <span key="payment">
                <Badge>
                  {paymentState(
                    Number(d.total),
                    orderMoney(s, d.order_id!).paid,
                  )}
                </Badge>
                <small>
                  Balance{" "}
                  {money(Math.max(0, orderMoney(s, d.order_id!).balance))}
                </small>
              </span>
            ),
          ]
        : []),
      dateLabel(d.kind === "quote" ? d.valid_until : d.due_on),
      <div className="row" key="actions">
        <Link
          className="button small"
          href={`/${d.kind === "quote" ? "quotations" : "invoices"}/${d.id}`}
        >
          Open <ArrowUpRight size={13} />
        </Link>
        {d.kind === "quote" && (
          <button
            type="button"
            className="button small"
            title="Download quotation PDF"
            aria-label={`Download ${d.ref} as PDF`}
            disabled={pdfBusy}
            onClick={() => downloadPdf(d)}
          >
            <Download size={13} /> PDF
          </button>
        )}
        {removeRecord(d.kind, d.id, d.ref)}
      </div>,
    ]);
  const formDone = (id: string) => {
    const kind = form?.kind;
    setForm(null);
    if (kind === "quote") router.push("/quotations/" + id);
    else if (kind === "invoice") router.push("/invoices/" + id);
    else if (kind === "client") router.push("/clients/" + id);
  };
  const actions = (
    <>
      {!recordId &&
        [
          "leads",
          "clients",
          "followups",
          "products",
          "vendors",
          "payments",
          "quotations",
        ].includes(section) && (
          <button className="button primary" onClick={openNew}>
            <Plus size={15} />
            {section === "payments"
              ? "Record payment"
              : `New ${section === "quotations" ? "quotation" : { leads: "lead", clients: "client", followups: "follow-up", products: "product", vendors: "vendor" }[section]}`}
          </button>
        )}
      {section === "invoices" && !recordId && (
        <button className="button primary" onClick={() => setInvoiceOpen(true)}>
          <Plus size={15} /> Generate invoice
        </button>
      )}
      {section === "dashboard" && (
        <>
          <button className="button" onClick={() => setForm({ kind: "quote" })}>
            New quotation
          </button>
          <button
            className="button primary"
            onClick={() => setForm({ kind: "lead" })}
          >
            <Plus size={15} />
            New lead
          </button>
        </>
      )}
    </>
  );
  const toolbar = (statuses: string[] = []) => (
    <div className="toolbar">
      <div className="search">
        <Search />
        <input
          aria-label={`Search ${titles[section]}`}
          placeholder={
            section === "vendors"
              ? "Search vendor or product, e.g. diary…"
              : `Search ${titles[section].toLowerCase()}…`
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="row">
        {section === "vendors" && (
          <select
            aria-label="Filter vendor location"
            value={vendorLocation}
            onChange={(event) => setVendorLocation(event.target.value)}
          >
            <option>All locations</option>
            {[...new Set(s.vendors.map((v) => v.city.trim()).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b))
              .map((city) => (
                <option key={city}>{city}</option>
              ))}
          </select>
        )}
        {statuses.length > 0 && (
          <select
            aria-label="Filter status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["All", ...statuses].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
  let body: React.ReactNode;
  if (recordId && !doc && !order && !client)
    body = (
      <Empty
        title="Record not found"
        action={
          <Link className="button" href={"/" + section}>
            Back to {titles[section]}
          </Link>
        }
      />
    );
  else if (doc) {
    const accepted = doc.status === "Accepted";
    const orderForQuote = s.orders.find((o) => o.quote_id === doc.id);
    const awaitingPrices = doc.kind === "quote" && doc.status === "Draft" && Number(doc.total) === 0 &&
      s.documents.some((parent) => parent.id === doc.revision_of && parent.pricing_mode === "selection");
    const quoteStatuses = awaitingPrices
      ? ["Draft", "Rejected"]
      : doc.pricing_mode === "selection"
        ? ["Draft", "Sent", "Rejected"]
        : ["Draft", "Sent", "Accepted", "Rejected"];
    const ledger =
      doc.order_id && doc.status !== "Superseded"
        ? orderMoney(s, doc.order_id)
        : null;
    body = (
      <div className="stack">
        <div className="panel">
          <div className="row between">
            <div className="row">
              <Badge>{doc.status}</Badge>
              {doc.pricing_mode === "selection" && <Badge>Selection proposal</Badge>}
              {doc.kind === "invoice" && ledger && (
                <Badge>{paymentState(Number(doc.total), ledger.paid)}</Badge>
              )}
              {ledger && (
                <span>
                  Received {money(ledger.paid)} · Balance{" "}
                  {money(ledger.balance)}
                </span>
              )}
            </div>
            <div className="row">
              {doc.kind === "quote" && !accepted && (
                <button
                  className="button"
                  onClick={() => setForm({ kind: "quote", doc })}
                >
                  Edit quotation
                </button>
              )}
              {doc.kind === "quote" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await mutate("revise_quote", { id: doc.id });
                      router.push("/quotations/" + r.id);
                    })
                  }
                >
                  {doc.pricing_mode === "selection" ? "Create priced quotation" : "Create revision"}
                </button>
              )}
              {doc.kind === "invoice" && doc.status === "Draft" && (
                <button
                  className="button"
                  onClick={() => setForm({ kind: "invoice", doc })}
                >
                  Edit invoice draft
                </button>
              )}
              {doc.kind === "invoice" && doc.status === "Issued" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await mutate("revise_invoice", {
                        id: doc.id,
                      });
                      router.push("/invoices/" + result.id);
                    })
                  }
                >
                  Revise invoice
                </button>
              )}
              <button
                className="button"
                disabled={pdfBusy}
                onClick={() => downloadPdf(doc)}
              >
                <Download size={15} />
                {pdfBusy ? "Preparing…" : doc.kind === "quote" ? "Download quotation PDF" : "Download PDF"}
              </button>
            </div>
          </div>
          {doc.kind === "invoice" && doc.status !== "Superseded" && !doc.business.gstin && (
            <p className="invoice-gstin-notice" role="status">
              {s.settings.gstin
                ? doc.status === "Issued"
                  ? "This issued invoice does not include your saved GSTIN. Use Revise invoice to create a corrected draft."
                  : "Your saved GSTIN will be added when you issue this invoice."
                : <>
                    Business GSTIN is missing. <Link href="/settings#business-details">Add it in Settings</Link>
                    {doc.status === "Issued" ? ", then revise this invoice." : " before issuing."}
                  </>}
            </p>
          )}
          <div className="divider" />
          <div className="row between document-actions">
            <div className="row">
              {doc.kind === "quote" && !accepted && (
                <>
                  <label>
                    Status
                    <select
                      value={doc.status}
                      disabled={busy}
                      onChange={(e) =>
                        run(() =>
                          mutate("quote_status", {
                            id: doc.id,
                            status: e.target.value,
                          }),
                        )
                      }
                    >
                      {quoteStatuses.filter((status) => status !== "Draft" || !doc.share_token || doc.status === "Draft").map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {accepted &&
                (orderForQuote ? (
                  <Link
                    className="button primary"
                    href={"/orders/" + orderForQuote.id}
                  >
                    Open order <ArrowUpRight size={14} />
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await mutate("convert_quote", { id: doc.id });
                        router.push("/orders/" + r.id);
                      })
                    }
                  >
                    Create order from quotation
                  </button>
                ))}
              {doc.kind === "invoice" && doc.status === "Draft" && (
                <>
                  <label>
                    Payment due date
                    <input
                      type="date"
                      value={dueOn || doc.due_on || ""}
                      onChange={(e) => setDueOn(e.target.value)}
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        mutate("issue_invoice", {
                          id: doc.id,
                          due_on: dueOn || doc.due_on || null,
                        }),
                      )
                    }
                  >
                    Issue invoice
                  </button>
                </>
              )}
              {doc.kind === "invoice" && doc.order_id && (
                <>
                  <Link className="text-link" href={"/orders/" + doc.order_id}>
                    Open order <ArrowUpRight className="inline-arrow" aria-hidden="true" />
                  </Link>
                  {doc.status !== "Superseded" &&
                    s.orders.find((o) => o.id === doc.order_id)?.status !==
                      "Cancelled" && (
                      <button
                        className="button"
                        onClick={() =>
                          setForm({
                            kind: "payment",
                            initial: { order_id: doc.order_id },
                          })
                        }
                      >
                        Record payment
                      </button>
                    )}
                </>
              )}
              {doc.kind === "invoice" &&
                doc.status !== "Superseded" &&
                canManageUsers(s.profile.role) &&
                (s.settings.upi_id || s.settings.payment_qr_path || doc.payment_qr_enabled ? (
                  <button
                    className="button"
                    disabled={qrBusy}
                    onClick={() =>
                      run(async () => {
                        setQrBusy(true);
                        try {
                          const { error: qrError } = await createClient().rpc(
                            "set_invoice_payment_qr",
                            {
                              p_invoice_id: doc.id,
                              p_enabled: !doc.payment_qr_enabled,
                            },
                          );
                          if (qrError) throw qrError;
                          await refresh();
                        } finally {
                          setQrBusy(false);
                        }
                      })
                    }
                  >
                    {qrBusy
                      ? "Saving…"
                      : doc.payment_qr_enabled
                        ? "Remove payment QR"
                        : "Add payment QR"}
                  </button>
                ) : (
                  <Link className="text-link" href="/settings#payment-qr">
                    Set up payment QR <ArrowUpRight className="inline-arrow" aria-hidden="true" />
                  </Link>
                ))}
              {doc.kind === "invoice" && doc.status !== "Superseded" &&
                doc.payment_qr_enabled && canManageUsers(s.profile.role) &&
                (s.settings.upi_id || s.settings.payment_qr_path) &&
                (doc.business.upi_id !== s.settings.upi_id ||
                  doc.business.payment_qr_path !== s.settings.payment_qr_path) &&
                <button className="button" disabled={qrBusy} onClick={() => run(async () => {
                  setQrBusy(true);
                  try {
                    const { error: qrError } = await createClient().rpc("set_invoice_payment_qr", {
                      p_invoice_id: doc.id, p_enabled: true,
                    });
                    if (qrError) throw qrError;
                    await refresh();
                  } finally { setQrBusy(false); }
                })}>{qrBusy ? "Saving…" : "Update payment QR"}</button>}
            </div>
            <div className="row">
              {doc.share_token ? (
                <>
                  <button
                    className="button small"
                    onClick={() =>
                      run(() =>
                        navigator.clipboard
                          .writeText(
                            location.origin + "/share/" + doc.share_token,
                          )
                          .then(() => toast.success("Link copied")),
                      )
                    }
                  >
                    <Copy size={14} />
                    Copy link
                  </button>
                  <a
                    className="button small"
                    href={`https://wa.me/?text=${encodeURIComponent("Your " + doc.kind + " from The Good Chapter: " + (typeof window !== "undefined" ? window.location.origin : "") + "/share/" + doc.share_token)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp <ArrowUpRight className="inline-arrow" aria-hidden="true" />
                  </a>
                  <a
                    className="button small"
                    href={`mailto:${doc.customer.email}?subject=${encodeURIComponent(doc.ref + " · " + doc.title)}&body=${encodeURIComponent("Your document: " + (typeof window !== "undefined" ? window.location.origin : "") + "/share/" + doc.share_token)}`}
                  >
                    Open email app <ArrowUpRight className="inline-arrow" aria-hidden="true" />
                  </a>
                  <button
                    className="button small"
                    onClick={() => setEmailOpen(true)}
                  >
                    Send email
                  </button>
                  <button
                    className="button small danger"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        mutate("share_document", {
                          id: doc.id,
                          enabled: false,
                        }),
                      )
                    }
                  >
                    Revoke link
                  </button>
                </>
              ) : doc.status !== "Superseded" ? (
                <button
                  className="button small"
                  disabled={busy || (doc.status === "Draft" && doc.pricing_mode !== "selection")}
                  onClick={() =>
                    run(() =>
                      mutate("share_document", { id: doc.id, enabled: true }),
                    )
                  }
                >
                  {doc.status === "Draft" && doc.pricing_mode === "selection"
                    ? "Send proposal & enable link"
                    : "Enable share link"}
                </button>
              ) : null}
            </div>
          </div>
          <p style={{ fontSize: 11, marginTop: 15 }}>
            {doc.pricing_mode === "selection" && doc.status === "Draft"
              ? `Enabling the link marks this selection proposal as Sent. ${doc.client_choice_enabled ? "The client can choose options." : "The client can review the ideas without choosing options."} It does not send a message.`
              : "Record status changes manually. Sharing shortcuts do not send messages or change document status."}
            {accepted
              ? " Accepted quotations are locked; revisions create a new draft."
              : ""}
          </p>
          {awaitingPrices && <p className="quote-save-hint">The client’s selected items are ready. Edit this quotation to add prices before sending it.</p>}
        </div>
        {doc.kind === "quote" && doc.quote_selected_at && (
          <div className="quote-selection-note">
            <strong>Client choices received · {dateLabel(doc.quote_selected_at)}</strong>
            <div>
              {(doc.quote_options ?? []).map((group) => {
                const chosen = group.options.find((option) => option.id === doc.quote_selections?.[group.id]);
                return chosen ? <span key={group.id}>{group.title}: {chosen.title}{doc.pricing_mode !== "selection" ? ` · ${money(chosen.unit_price)} each` : ""}{group.quantity > 1 ? ` × ${group.quantity}` : ""}<br /></span> : null;
              })}
            </div>
            <span>{doc.pricing_mode === "selection"
              ? "Create a priced quotation from these choices, then confirm the final quantities and prices."
              : "Review these choices, then create a revision to confirm the final quantities and total."}</span>
          </div>
        )}
        {doc.kind === "quote" && doc.status !== "Draft" && <QuoteEngagement doc={doc} />}
        <DocumentView doc={doc} />
      </div>
    );
  } else if (order)
    body = (
      <OrderDetail
        key={order.id}
        s={s}
        order={order}
        mutate={mutate}
        busy={busy}
        refresh={refresh}
        onPayment={() =>
          setForm({ kind: "payment", initial: { order_id: order.id } })
        }
        onInvoice={(id) => router.push("/invoices/" + id)}
      />
    );
  else if (client)
    body = (
      <div className="stack">
        <div className="panel">
          <div className="row between">
            <h2>{client.name}</h2>
            <div className="row">
              {edit("client", client)}
              <button
                className="button primary"
                onClick={() => setForm({ kind: "quote", clientId: client.id })}
              >
                New quotation
              </button>
              <button
                className="button"
                onClick={() =>
                  setForm({
                    kind: "followup",
                    initial: { client_id: client.id },
                  })
                }
              >
                Add follow-up
              </button>
            </div>
          </div>
          <dl className="kv" style={{ marginTop: 22 }}>
            <dt>Email / phone</dt>
            <dd>
              {client.email} · {client.phone || "—"}
            </dd>
            <dt>Billing</dt>
            <dd>{client.billing_address || "—"}</dd>
            <dt>Shipping</dt>
            <dd>{client.shipping_address || "—"}</dd>
            <dt>GSTIN</dt>
            <dd>{client.gstin || "—"}</dd>
            <dt>Notes</dt>
            <dd>{client.notes || "—"}</dd>
          </dl>
        </div>
        <h2>Quotations & invoices</h2>
        {table(
          ["Reference", "Client", "Status", "Total", "Payment", "Date", ""],
          documentRows(s.documents.filter((d) => d.client_id === client.id), true),
          "No documents yet",
        )}
        <h2>Orders</h2>
        {table(
          ["Order", "Status", "Deadline", "Balance"],
          s.orders
            .filter((o) => o.client_id === client.id)
            .map((o) => [
              link("orders", o.id, o.ref, o.title),
              <Badge key="s">{o.status}</Badge>,
              dateLabel(o.required_date),
              money(orderMoney(s, o.id).balance),
            ]),
          "No orders yet",
        )}
        <h2>Enquiries & follow-ups</h2>
        {table(
          ["Enquiry", "Stage", "Brief"],
          s.leads
            .filter((l) => l.client_id === client.id)
            .map((l) => [l.name, <Badge key="s">{l.stage}</Badge>, l.brief]),
          "No linked enquiries",
        )}
        <div className="panel flush">
          {s.followups
            .filter((f) => f.client_id === client.id)
            .map((f) => (
              <div className="task-row" key={f.id}>
                <input
                  type="checkbox"
                  aria-label={"Complete " + f.title}
                  checked={f.done}
                  onChange={() => followupToggle(f)}
                />
                <div>
                  <h3>{f.title}</h3>
                  <p>{dateLabel(f.due_at)}</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  else if (section === "dashboard")
    body = (
      <Dashboard
        s={s}
        onToggle={followupToggle}
        onQuote={() => setForm({ kind: "quote" })}
      />
    );
  else if (section === "leads")
    body = (
      <>
        {toolbar(LEAD_STAGES)}
        {table(
          [
            "Contact / organisation",
            "Brief",
            "Stage",
            "Required by",
            "Owner",
            "",
          ],
          s.leads
            .filter(matches)
            .filter((l) => filter === "All" || l.stage === filter)
            .map((l) => [
              <strong key="name">
                {l.name}
                <small>{l.organisation}</small>
              </strong>,
              <span
                key="brief"
                style={{
                  whiteSpace: "normal",
                  maxWidth: 230,
                  display: "block",
                }}
              >
                {l.brief}
                <small>
                  {l.quantity ?? "—"} units ·{" "}
                  {l.budget ? money(l.budget) : "Budget not set"}
                </small>
              </span>,
              <Badge key="s">{l.stage}</Badge>,
              dateLabel(l.required_date),
              person(l.assigned_to),
              <div className="row" key="a">
                {edit("lead", l)}
                {removeRecord("lead", l.id, l.name)}
                {l.client_id ? (
                  <Link
                    className="button small"
                    href={"/clients/" + l.client_id}
                  >
                    Client <ArrowUpRight className="inline-arrow" aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const r = await mutate("convert_lead", { id: l.id });
                        router.push("/clients/" + r.id);
                      })
                    }
                  >
                    Create client
                  </button>
                )}
                <button
                  className="button small"
                  onClick={() =>
                    setForm({ kind: "followup", initial: { lead_id: l.id } })
                  }
                >
                  Follow up
                </button>
              </div>,
            ]),
          "No enquiries yet",
        )}
      </>
    );
  else if (section === "clients")
    body = (
      <>
        {toolbar(["Active", "Archived"])}
        {table(
          ["Client", "Contact", "Location", "Orders", ""],
          s.clients
            .filter(matches)
            .filter((c) => (filter === "Archived" ? c.archived : !c.archived))
            .map((c) => [
              link("clients", c.id, c.organisation || c.name, c.name),
              <span key="c">
                {c.email || "—"}
                <small>{c.phone}</small>
              </span>,
              <span className="client-location" title={c.shipping_address || c.billing_address || undefined} key="location">
                {clientLocation(c.shipping_address || c.billing_address)}
              </span>,
              s.orders.filter((o) => o.client_id === c.id).length,
              <div className="row record-actions" key="a">
                {edit("client", c, true)}
                {archive("client", c, true)}
                {removeRecord("client", c.id, c.name, [], true)}
              </div>,
            ]),
          "No clients yet",
          "client-table",
        )}
      </>
    );
  else if (section === "quotations" || section === "invoices") {
    const kind = section === "quotations" ? "quote" : "invoice";
    body = (
      <>
        {toolbar(
          kind === "quote"
            ? ["Draft", "Sent", "Accepted", "Rejected"]
            : ["Draft", "Issued", "Superseded"],
        )}
        {kind === "invoice" && (
          <p style={{ marginBottom: 18, fontSize: 12 }}>
            Create an invoice from an order. Receipts and advances stay linked
            to that order.
          </p>
        )}
        {table(
          [
            "Reference",
            "Client",
            "Status",
            "Total",
            ...(kind === "invoice" ? ["Payment"] : []),
            kind === "quote" ? "Valid until" : "Due date",
            "",
          ],
          documentRows(
            s.documents
              .filter((d) => d.kind === kind)
              .filter(matches)
              .filter((d) =>
                filter === "All"
                  ? d.status !== "Superseded"
                  : d.status === filter,
              ),
            kind === "invoice",
          ),
          kind === "invoice"
            ? "No invoices yet. Use Generate invoice to choose an order."
            : "No quotations yet",
        )}
      </>
    );
  } else if (section === "orders")
    body = (
      <>
        {toolbar(ORDER_STAGES)}
        {table(
          [
            "Order",
            "Client",
            "Stage",
            "Delivery deadline",
            "Value",
            "Balance",
            "",
          ],
          s.orders
            .filter(matches)
            .filter((o) => filter === "All" || o.status === filter)
            .map((o) => [
              link("orders", o.id, o.ref, o.title),
              clientName(o.client_id),
              <Badge key="s">{o.status}</Badge>,
              dateLabel(o.required_date),
              money(orderMoney(s, o.id).total),
              money(orderMoney(s, o.id).balance),
              removeRecord("order", o.id, o.ref),
            ]),
          "No orders yet",
        )}
        <div className="note-band">
          <div>
            <div className="serif">From a yes to something real.</div>
            <p>Accept a quotation, then create its order in one step.</p>
          </div>
          <Link className="button" href="/quotations">
            View quotations <ArrowUpRight size={15} />
          </Link>
        </div>
      </>
    );
  else if (section === "products")
    body = (
      <>
        {toolbar(["Active", "Archived"])}
        <div className="product-grid">
          {s.products
            .filter(matches)
            .filter((p) => (filter === "Archived" ? p.archived : !p.archived))
            .map((p) => {
              const Icon =
                p.category === "Apparel"
                  ? Shirt
                  : p.category.includes("Bottles")
                    ? Droplets
                    : p.category.includes("Diaries")
                      ? BookOpen
                      : p.category === "Candles"
                        ? Flame
                        : Gift;
              return (
                <article className="product-card" key={p.id}>
                  <div className="product-art">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} />
                    ) : (
                      <Icon size={65} strokeWidth={0.8} />
                    )}
                  </div>
                  <div className="product-info">
                    <div className="eyebrow">{p.category}</div>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <p style={{ marginTop: 7 }}>{p.customisation}</p>
                    <div className="row between" style={{ marginTop: 21 }}>
                      <strong>
                        {money(p.unit_price)}{" "}
                        <span
                          className="muted"
                          style={{ fontSize: 10, fontWeight: 400 }}
                        >
                          / unit
                        </span>
                      </strong>
                      {edit("product", p)}
                    </div>
                    <div style={{ marginTop: 10 }}>{archive("product", p)}</div>
                    {removeRecord("product", p.id, p.name)}
                  </div>
                </article>
              );
            })}
        </div>
        {!s.products.length && (
          <Empty
            title="Build your product collection"
            description="Save reusable product details and prices. Every quotation can still be customised."
          />
        )}
      </>
    );
  else if (section === "vendors")
    body = (
      <>
        {toolbar(["Active", "Archived"])}
        {table(
          [
            "Vendor",
            "Speciality & products",
            "Contact",
            "Location",
            "Catalogues",
            "",
          ],
          s.vendors
            .filter((v) => matchesVendor(v, search))
            .filter((v) => (filter === "Archived" ? v.archived : !v.archived))
            .filter(
              (v) =>
                vendorLocation === "All locations" || v.city === vendorLocation,
            )
            .map((v) => [
              <strong key="n">{v.name}</strong>,
              <VendorSpeciality key="speciality" category={v.category}
                subcategories={v.subcategories} productsList={v.products_list} />,
              <span key="c">
                {v.contact_name}
                <small>
                  {v.email} {v.phone}
                </small>
                {v.social_links && (
                  <small style={{ whiteSpace: "pre-wrap" }}>
                    {v.social_links}
                  </small>
                )}
              </span>,
              v.city,
              <div key="catalogs" style={{ display: "grid", gap: 4 }}>
                {s.vendor_catalogs.filter((c) => c.vendor_id === v.id).length
                  ? s.vendor_catalogs
                      .filter((c) => c.vendor_id === v.id)
                      .map((catalog) => (
                        <a
                          key={catalog.id}
                          className="text-link"
                          href={`/api/vendor-catalog?catalogId=${catalog.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {catalog.file_name}
                        </a>
                      ))
                  : "—"}
              </div>,
              <div className="row record-actions" key="a">
                {edit("vendor", v, true)}
                {archive("vendor", v, true)}
                {removeRecord(
                  "vendor",
                  v.id,
                  v.name,
                  s.vendor_catalogs
                    .filter((c) => c.vendor_id === v.id)
                    .map((c) => c.storage_path),
                  true,
                )}
              </div>,
            ]),
          "No vendors yet",
          "vendor-table",
        )}
      </>
    );
  else if (section === "followups")
    body = (
      <>
        {toolbar(["Open", "Overdue", "Done"])}
        {table(
          [
            "Done",
            "Follow-up",
            "Linked to",
            "Due",
            "Assigned to",
            "Priority",
            "",
          ],
          s.followups
            .filter(matches)
            .filter(
              (f) =>
                filter === "All" ||
                (filter === "Done"
                  ? f.done
                  : filter === "Overdue"
                    ? !f.done && new Date(f.due_at) < new Date()
                    : !f.done),
            )
            .map((f) => [
              <input
                key="done"
                type="checkbox"
                aria-label={"Complete " + f.title}
                checked={f.done}
                disabled={busy}
                onChange={() => followupToggle(f)}
              />,
              <strong key="title">
                {f.title}
                <small>{f.notes}</small>
              </strong>,
              f.order_id
                ? link(
                    "orders",
                    f.order_id,
                    s.orders.find((o) => o.id === f.order_id)?.ref,
                  )
                : f.client_id
                  ? link("clients", f.client_id, clientName(f.client_id))
                  : s.leads.find((l) => l.id === f.lead_id)?.name || "—",
              <span key="due">
                {dateLabel(f.due_at)}
                {!f.done && new Date(f.due_at) < new Date() && (
                  <small>
                    <Badge>Overdue</Badge>
                  </small>
                )}
              </span>,
              person(f.assigned_to),
              <Badge key="p">{f.priority}</Badge>,
              <div className="row" key="actions">
                {edit("followup", {
                  ...f,
                  due_at: new Date(
                    new Date(f.due_at).getTime() -
                      new Date(f.due_at).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16),
                })}
                {removeRecord("followup", f.id, f.title)}
              </div>,
            ]),
          "Nothing to follow up",
        )}
      </>
    );
  else if (section === "payments")
    body = (
      <>
        {toolbar(["Receipt", "Refund"])}
        {table(
          ["Date", "Order", "Entry", "Amount", "Method", "Reference", ""],
          s.payments
            .filter(matches)
            .filter((p) => filter === "All" || p.kind === filter)
            .map((p) => [
              dateLabel(p.payment_date),
              link(
                "orders",
                p.order_id,
                s.orders.find((o) => o.id === p.order_id)?.ref,
              ),
              <Badge key="k">{p.kind}</Badge>,
              money(p.amount),
              p.method,
              p.reference || "—",
              canManageUsers(s.profile.role) ? (
                <div className="row" key="actions">
                  {edit("payment", p)}
                  {removeRecord("payment", p.id, p.reference || "this payment")}
                </div>
              ) : null,
            ]),
          "No payments recorded",
        )}
      </>
    );
  else if (section === "reports") body = <Reports s={s} />;
  else if (section === "social")
    body = (
      <SocialMedia role={s.profile.role} userId={s.profile.id} demo={s.demo} />
    );
  else if (section === "mail")
    body = (
      <MailCenter clients={s.clients} role={s.profile.role} demo={s.demo} />
    );
  else if (section === "account")
    body = <AccountSettings s={s} refresh={refresh} />;
  else
    body = (
      <Settings
        s={s}
        mutate={mutate}
        busy={busy}
        refresh={refresh}
        mode={section === "users" ? "users" : "business"}
      />
    );
  return (
    <div className="app">
      {navOpen && (
        <button
          aria-label="Close navigation"
          className="nav-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={"sidebar " + (navOpen ? "open" : "")}>
        <Link
          href="/"
          prefetch={false}
          className="brand"
          onClick={(event) => navigateSection(event, "dashboard")}
        >
          <img src="/logo.svg" alt="The Good Chapter" />
          <small>MERCHANDISE CRM</small>
        </Link>
        <nav ref={sidebarNavRef} onScroll={saveSidebarScroll}>
          {NAV.map((g) => (
            <div className="nav-group" key={g.group}>
              <p>{g.group}</p>
              {g.items
                .filter(
                  ([id]) =>
                    (id !== "settings" || owner) &&
                    (id !== "users" || canManageUsers(s.profile.role)) &&
                    (id !== "social" || canManageUsers(s.profile.role)) &&
                    (id !== "mail" || canManageUsers(s.profile.role)),
                )
                .map(([id, title, Icon]) => (
                  <Link
                    key={id}
                    href={id === "dashboard" ? "/" : "/" + id}
                    prefetch={false}
                    className={"nav-link " + (section === id ? "active" : "")}
                    onClick={(event) => navigateSection(event, id)}
                  >
                    <Icon />
                    {title}
                    {id === section && (
                      <ChevronRight style={{ marginLeft: "auto", width: 12 }} />
                    )}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="row">
            <span className="avatar">
              {s.profile.avatar_path ? (
                <img
                  src={
                    "/api/profile/avatar?v=" +
                    encodeURIComponent(s.profile.avatar_path)
                  }
                  alt=""
                />
              ) : (
                s.profile.full_name.slice(0, 1) || "G"
              )}
            </span>
            <div>
              <div style={{ fontSize: 12 }}>{s.profile.full_name}</div>
              <div style={{ fontSize: 10, color: "#aaa295" }}>
                {roleLabels[s.profile.role]}
              </div>
            </div>
            {!s.demo && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  run(async () => {
                    const { createClient } =
                      await import("@/lib/supabase/client");
                    await createClient().auth.signOut();
                    router.push("/login");
                  })
                }
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              {navOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="workspace-name">
              The Good Chapter{" "}
              <span style={{ padding: "0 10px", opacity: 0.4 }}>/</span>{" "}
              {(section === "users" || section === "settings") && (
                <>
                  <Link href="/account">User settings</Link>
                  <span style={{ padding: "0 10px", opacity: 0.4 }}>/</span>
                </>
              )}
              {titles[section]}
            </span>
          </div>
          <div className="row">
            <span className="dot" />
            <span>{dateLabel(today())}</span>
          </div>
        </div>
        {s.demo && (
          <div className="demo-banner">
            <span>
              LOCAL PREVIEW · Fictional records · Resets on server restart
            </span>
            <button
              onClick={() =>
                run(async () => {
                  await fetch("/api/demo-role", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role: owner ? "staff" : "owner" }),
                  });
                  await refresh();
                })
              }
            >
              View as {owner ? "staff" : "owner"}
            </button>
          </div>
        )}
        <main className="content">
          {(section === "users" || section === "settings") && (
            <Link className="settings-back-link" href="/account">
              <ArrowLeft size={15} /> Back to User settings
            </Link>
          )}
          {recordId && (
            <div className="breadcrumb">
              <Link href={"/" + section}>{titles[section]}</Link> / {heading}
            </div>
          )}
          <header className="page-header">
            <div>
              <div className="eyebrow">
                {section === "dashboard"
                  ? "A GOOD DAY TO MAKE SOMETHING"
                  : recordId
                    ? titles[section]
                    : "THE GOOD CHAPTER"}
              </div>
              <h1>{heading}</h1>
              <p>
                {doc?.title ??
                  order?.title ??
                  (recordId ? client?.name : descriptions[section])}
              </p>
            </div>
            <div className="row">{actions}</div>
          </header>
          {!recordId && salesFlow[section] && (
            <aside className="sales-flow-note" aria-label={`${titles[section]} workflow`}>{salesFlow[section]}</aside>
          )}
          {body}
        </main>
      </div>
      {emailOpen && doc && (
        <Modal title="Send document email" onClose={() => setEmailOpen(false)}>
          <SendEmail
            doc={doc}
            demo={s.demo}
            onDone={() => setEmailOpen(false)}
          />
        </Modal>
      )}
      {invoiceOpen && (
        <Modal title="Generate invoice" onClose={() => setInvoiceOpen(false)}>
          <InvoiceGenerator
            s={s}
            mutate={mutate}
            busy={busy}
            onDone={(id) => {
              setInvoiceOpen(false);
              router.push("/invoices/" + id);
            }}
          />
        </Modal>
      )}
      {form && (
        <Modal
          title={
            form.kind === "quote"
              ? form.doc
                ? "Edit quotation"
                : "New quotation"
              : form.kind === "invoice"
                ? "Edit invoice draft"
                : (form.initial?.id ? "Edit " : "New ") + form.kind
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
          wide={form.kind === "quote" || form.kind === "invoice"}
        >
          {form.kind === "quote" || form.kind === "invoice" ? (
            <QuoteEditor
              s={s}
              doc={form.doc}
              clientId={form.kind === "quote" ? form.clientId : undefined}
              mutate={mutate}
              busy={busy}
              onDone={formDone}
            />
          ) : (
            <EntityForm
              kind={form.kind}
              initial={form.initial}
              s={s}
              mutate={mutate}
              refresh={refresh}
              busy={busy}
              onDone={formDone}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Dashboard({
  s,
  onToggle,
  onQuote,
}: {
  s: Snapshot;
  onToggle: (f: Followup) => void;
  onQuote: () => void;
}) {
  const activeLeads = s.leads.filter((l) => !["Won", "Lost"].includes(l.stage));
  const activeOrders = s.orders.filter(
    (o) => !["Delivered", "Cancelled"].includes(o.status),
  );
  const quotes = s.documents.filter(
    (d) => d.kind === "quote" && ["Draft", "Sent"].includes(d.status),
  );
  const balance = s.orders
    .filter((o) => o.status !== "Cancelled")
    .reduce((n, o) => n + Math.max(0, orderMoney(s, o.id).balance), 0);
  const due = s.followups
    .filter((f) => !f.done)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, 4);
  return (
    <>
      <div className="stats">
        {[
          [
            "ACTIVE ENQUIRIES",
            String(activeLeads.length),
            "Conversations in progress",
          ],
          [
            "OPEN QUOTATIONS",
            String(quotes.length),
            money(quotes.reduce((n, q) => n + Number(q.total), 0)) +
              " in consideration",
          ],
          [
            "ORDERS IN MOTION",
            String(activeOrders.length),
            "From design to delivery",
          ],
          [
            "TO BE COLLECTED",
            money(balance),
            "Across active and delivered orders",
          ],
        ].map(([label, value, caption]) => (
          <div className="stat" key={label}>
            <div className="eyebrow">{label}</div>
            <div className="value">{value}</div>
            <div className="caption">{caption}</div>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-title">
          <h2>
            On the studio floor{" "}
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
              {activeOrders.length} active orders
            </span>
          </h2>
          <Link href="/orders">All orders <ArrowUpRight className="inline-arrow" aria-hidden="true" /></Link>
        </div>
        {table(
          [
            "PROJECT / ORDER",
            "CLIENT",
            "CURRENT CHAPTER",
            "DELIVERY",
            "ORDER VALUE",
          ],
          activeOrders
            .slice()
            .sort((a, b) =>
              (a.required_date ?? "9999").localeCompare(
                b.required_date ?? "9999",
              ),
            )
            .slice(0, 5)
            .map((o) => [
              <Link key="o" className="text-link" href={"/orders/" + o.id}>
                {o.title}
                <small className="mono">{o.ref}</small>
              </Link>,
              s.clients.find((c) => c.id === o.client_id)?.organisation || "—",
              <Badge key="s">{o.status}</Badge>,
              dateLabel(o.required_date),
              money(orderMoney(s, o.id).total),
            ]),
          "The studio floor is clear",
        )}
      </section>
      <div className="two-col section">
        <section>
          <div className="section-title">
            <h2>Needs a little attention</h2>
            <Link href="/followups">All follow-ups <ArrowUpRight className="inline-arrow" aria-hidden="true" /></Link>
          </div>
          <div className="panel flush">
            {due.map((f) => (
              <div className="task-row" key={f.id}>
                <input
                  type="checkbox"
                  aria-label={"Complete " + f.title}
                  checked={f.done}
                  onChange={() => onToggle(f)}
                />
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.notes}</p>
                </div>
                <span className="task-date">
                  {new Date(f.due_at) < new Date()
                    ? "Overdue"
                    : dateLabel(f.due_at)}
                </span>
              </div>
            ))}
            {!due.length && (
              <Empty
                title="You’re all caught up"
                description="No open follow-ups. Time for the next good idea."
              />
            )}
          </div>
        </section>
        <section>
          <div className="section-title">
            <h2>Conversations to conversions</h2>
            <Link href="/leads">Pipeline <ArrowUpRight className="inline-arrow" aria-hidden="true" /></Link>
          </div>
          <div className="panel">
            <div className="row between">
              <span className="muted">Your enquiry pipeline</span>
              <span className="mono">{s.leads.length} TOTAL</span>
            </div>
            <div className="pipeline">
              {LEAD_STAGES.map((stage, i) => {
                const n = s.leads.filter((l) => l.stage === stage).length;
                return n ? (
                  <span
                    key={stage}
                    style={{ flex: n, opacity: 1 - i * 0.12 }}
                    title={`${stage}: ${n}`}
                  />
                ) : null;
              })}
            </div>
            <div className="pipeline-legend">
              {[
                ["New enquiries", "New"],
                ["In conversation", "Contacted"],
                ["Quotes shared", "Quote Sent"],
                ["Good chapters won", "Won"],
              ].map(([label, stage]) => (
                <div className="row between" key={stage}>
                  <p>{label}</p>
                  <b>{s.leads.filter((l) => l.stage === stage).length}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <div className="note-band">
        <div>
          <div className="serif">Good ideas deserve to become real things.</div>
          <p>A new brief, a thoughtful quote, a chapter worth keeping.</p>
        </div>
        <button className="button" onClick={onQuote}>
          Start a quotation <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}
function Reports({ s }: { s: Snapshot }) {
  const month = today().slice(0, 7);
  const issued = s.documents.filter(
    (d) => d.kind === "invoice" && d.status === "Issued",
  );
  const total = issued
    .filter((d) => d.issued_on?.startsWith(month))
    .reduce((n, d) => n + Number(d.total), 0);
  const received = s.payments
    .filter((p) => p.payment_date.startsWith(month))
    .reduce((n, p) => n + Number(p.amount) * (p.kind === "Refund" ? -1 : 1), 0);
  const rows = s.orders.map((o) => ({
    o,
    ...orderMoney(s, o.id),
    cost: s.order_costs
      .filter((c) => c.order_id === o.id)
      .reduce((n, c) => n + Number(c.amount), 0),
    priced: s.order_costs.filter((c) => c.order_id === o.id).length,
    pricedDocument:
      s.documents.find(
        (d) =>
          d.kind === "invoice" &&
          d.order_id === o.id &&
          d.status !== "Superseded",
      ) ?? s.documents.find((d) => d.id === o.quote_id)!,
  }));
  const owner = hasOwnerAccess(s.profile.role);
  return (
    <>
      <div className="stats">
        {[
          ["INVOICED THIS MONTH", money(total)],
          ["RECEIVED THIS MONTH", money(received)],
          [
            "OUTSTANDING",
            money(
              rows
                .filter((r) => r.o.status !== "Cancelled")
                .reduce((n, r) => n + Math.max(0, r.balance), 0),
            ),
          ],
          [
            "OVERDUE FOLLOW-UPS",
            String(
              s.followups.filter(
                (f) => !f.done && new Date(f.due_at) < new Date(),
              ).length,
            ),
          ],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="eyebrow">{label}</div>
            <div className="value">{value}</div>
            <div className="caption">{month} · INR</div>
          </div>
        ))}
      </div>
      <div className="section-title section">
        <h2>Order performance</h2>
        <span className="eyebrow">{owner ? "ADMIN VIEW" : "TEAM VIEW"}</span>
      </div>
      {table(
        [
          "Order",
          "Status",
          "Value",
          "Received",
          "Balance",
          ...(owner ? ["Recorded cost", "Estimated margin"] : []),
        ],
        rows.map((r) => [
          <Link key="o" className="text-link" href={"/orders/" + r.o.id}>
            {r.o.ref}
            <small>{r.o.title}</small>
          </Link>,
          <Badge key="s">{r.o.status}</Badge>,
          money(r.total),
          money(r.paid),
          money(r.balance),
          ...(owner
            ? [
                money(r.cost),
                r.priced === r.pricedDocument.items.length
                  ? money(Number(r.pricedDocument.subtotal) - r.cost)
                  : "Costs incomplete",
              ]
            : []),
        ]),
        "No order activity yet",
      )}
      <p style={{ fontSize: 12, marginTop: 16 }}>
        Invoiced sales include issued invoices; receipts are cash recorded, net
        of refunds. Cancelled orders remain in history and are excluded from
        operational outstanding totals.
        {owner
          ? " Estimated margin is the pre-tax selling subtotal less recorded item costs; it is shown only when every item has a cost."
          : ""}
      </p>
    </>
  );
}
