import { redirect } from "next/navigation";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import PasswordForm from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  if (demoEnabled()) redirect("/");
  try {
    await session();
  } catch {
    redirect("/login");
  }
  return <PasswordForm />;
}
