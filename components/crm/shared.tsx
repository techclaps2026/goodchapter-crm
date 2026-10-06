"use client";
import { PackageOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function Badge({ children }: { children: React.ReactNode }) {
  const s = String(children);
  const cls = [
    "Accepted",
    "Delivered",
    "Paid",
    "Fully paid",
    "Won",
    "Approved",
    "Issued",
    "Done",
  ].includes(s)
    ? "good"
    : [
          "Lost",
          "Rejected",
          "Cancelled",
          "Overdue",
          "Changes requested",
        ].includes(s)
      ? "bad"
      : [
            "Follow-up",
            "Design & Approval",
            "Pending",
            "Partial",
            "High",
            "Production",
            "Partially paid",
          ].includes(s)
        ? "warn"
        : "";
  return <span className={"badge " + cls}>{children}</span>;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={27} />
      <h3>{title}</h3>
      <p>{description ?? "Your next good chapter starts here."}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={`max-h-[90vh] overflow-y-auto ${wide ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Keep the details together, from first brief to final delivery.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Totals({
  subtotal,
  tax_amount,
  total,
  tax_mode,
}: {
  subtotal: number;
  tax_amount: number;
  total: number;
  tax_mode: string;
}) {
  const m = (n: number) =>
    Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR" });
  return (
    <div className="totals">
      <div>
        <span>Subtotal after discounts</span>
        <span>{m(subtotal)}</span>
      </div>
      {tax_mode === "CGST/SGST" ? (
        <>
          <div>
            <span>CGST</span>
            <span>{m(tax_amount / 2)}</span>
          </div>
          <div>
            <span>SGST</span>
            <span>{m(tax_amount / 2)}</span>
          </div>
        </>
      ) : (
        <div>
          <span>{tax_mode === "IGST" ? "IGST" : "Tax"}</span>
          <span>{m(tax_amount)}</span>
        </div>
      )}
      <div className="grand">
        <strong>Total</strong>
        <strong>{m(total)}</strong>
      </div>
    </div>
  );
}
export function table(headers: string[], rows: React.ReactNode[][], empty: string, className = "") {
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
