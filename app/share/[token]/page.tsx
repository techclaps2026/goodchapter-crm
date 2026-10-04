import { session, sharedDocument } from "@/lib/server";
import { notFound } from "next/navigation";
import SharedDocument from "@/components/crm/SharedDocument";
import { cookies } from "next/headers";
import { QUOTE_ANALYTICS_COOKIE, quoteAnalyticsConsent } from "@/lib/quote-analytics";
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
  const consent = quoteAnalyticsConsent((await cookies()).get(QUOTE_ANALYTICS_COOKIE)?.value);
  return <SharedDocument doc={doc} token={token}
    trackEngagement={!isTeamMember && doc.kind === "quote"} initialConsent={consent} />;
}
