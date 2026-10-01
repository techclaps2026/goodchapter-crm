import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/social/providers";

export type BufferOrganization = { id: string; name: string };
export type BufferChannel = { id: string; name: string; service: string };
export type BufferPost = { id: string; text: string; status: string; dueAt: string | null; channelId: string };

export async function bufferQuery<T>(key: string, query: string): Promise<T> {
  const response = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Buffer API key is invalid or expired" : `Buffer API returned ${response.status}`);
  const result = await response.json() as { data?: T; errors?: { message: string }[] };
  if (result.errors?.length) throw new Error(result.errors[0].message);
  if (!result.data) throw new Error("Buffer returned no data");
  return result.data;
}

export async function bufferOrganizations(key: string) {
  const data = await bufferQuery<{ account: { organizations: BufferOrganization[] } }>(key, "query { account { organizations { id name } } }");
  return data.account.organizations;
}

export async function bufferChannels(key: string, organizationId: string) {
  const data = await bufferQuery<{ channels: BufferChannel[] }>(key, `query { channels(input: { organizationId: ${JSON.stringify(organizationId)} }) { id name service } }`);
  return data.channels.filter((channel) => channel.service === "instagram" || channel.service === "linkedin");
}

export async function bufferPosts(key: string, organizationId: string) {
  const data = await bufferQuery<{ posts: { edges: { node: BufferPost }[] } }>(key, `query { posts(first: 50, input: { organizationId: ${JSON.stringify(organizationId)}, sort: [{ field: dueAt, direction: asc }] }) { edges { node { id text status dueAt channelId } } } }`);
  return data.posts.edges.map((edge) => edge.node);
}

export async function savedBufferConfig() {
  const db = await createClient();
  const { data, error } = await db.rpc("buffer_config_secret");
  if (error) throw error;
  const row = data?.[0] as { api_key_cipher: string; organization_id: string; organization_name: string } | undefined;
  if (!row) return null;
  return { key: decryptToken(row.api_key_cipher, "buffer"), organizationId: row.organization_id, organizationName: row.organization_name };
}
