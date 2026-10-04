import { notFound } from "next/navigation";
import { sharedOrderSizes } from "@/lib/server";
import SizeCollection from "@/components/crm/SizeCollection";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Order sizes | The Good Chapter",
  robots: "noindex, nofollow",
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = await sharedOrderSizes(token);
  if (!form) notFound();
  return <SizeCollection initial={form} token={token} />;
}
