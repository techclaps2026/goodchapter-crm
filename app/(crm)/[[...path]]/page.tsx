import { redirect, notFound } from "next/navigation";
import { session } from "@/lib/server";
import { canManageUsers, hasOwnerAccess } from "@/lib/types";
import CRM from "@/components/crm/CRM";
export const dynamic = "force-dynamic";
const modules = [
  "dashboard",
  "leads",
  "clients",
  "followups",
  "quotations",
  "orders",
  "products",
  "vendors",
  "invoices",
  "payments",
  "expenses",
  "reports",
  "settings",
  "users",
  "account",
  "social",
  "mail",
];
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const section = path[0] ?? "dashboard";
  if (!modules.includes(section) || path.length > 2) notFound();
  let profile;
  try {
    profile = await session();
  } catch (e) {
    redirect(
      e instanceof Error && e.message === "SETUP_REQUIRED"
        ? "/setup"
        : "/login",
    );
  }
  if (section === "users" && !canManageUsers(profile.role)) notFound();
  if (section === "settings" && !hasOwnerAccess(profile.role)) notFound();
  if (section === "expenses" && !hasOwnerAccess(profile.role)) notFound();
  if (section === "social" && !canManageUsers(profile.role)) notFound();
  if (section === "mail" && !canManageUsers(profile.role)) notFound();
  return <CRM section={section} recordId={path[1]} />;
}
