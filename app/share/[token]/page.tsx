import { session, sharedDocument } from "@/lib/server";
import { notFound } from "next/navigation";
import SharedDocument from "@/components/crm/SharedDocument";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const doc = await sharedDocument(token);
  if (!doc) notFound();
  const isTeamMember = await session().then(() => true, () => false);
  return <SharedDocument doc={doc} token={token} trackEngagement={!isTeamMember && doc.kind === "quote"} />;
}
