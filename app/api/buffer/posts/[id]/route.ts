import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { canManageUsers } from "@/lib/types";
import { demoEnabled } from "@/lib/demo";
import { isSameOrigin } from "@/lib/request-origin";
import { bufferChannels, bufferQuery, savedBufferConfig, type BufferPost } from "@/lib/buffer";

type Context = { params: Promise<{ id: string }> };
async function allowedPost(id: string) {
  const user = await session();
  if (!canManageUsers(user.role) || demoEnabled()) throw new Error("Owner or Admin access required");
  const config = await savedBufferConfig();
  if (!config) throw new Error("Buffer is not connected");
  const channels = await bufferChannels(config.key, config.organizationId);
  const result = await bufferQuery<{ post: BufferPost | null }>(config.key, `query { post(input: { id: ${JSON.stringify(id)} }) { id status channelId text dueAt } }`);
  if (!result.post || !channels.some((channel) => channel.id === result.post?.channelId)) throw new Error("Post is not in this CRM's connected channels");
  if (!['scheduled', 'draft'].includes(result.post.status)) throw new Error("Only scheduled posts and drafts can be changed");
  return { config, post: result.post };
}

export async function PATCH(request: Request, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { id } = await context.params;
    const input = z.object({ text: z.string().trim().min(1).max(5000), dueAt: z.iso.datetime({ offset: true }).optional() }).parse(await request.json());
    const { config } = await allowedPost(id);
    if (input.dueAt && Date.parse(input.dueAt) <= Date.now() + 60_000) throw new Error("Choose a future publishing time");
    const fields = [`id: ${JSON.stringify(id)}`, `text: ${JSON.stringify(input.text)}`];
    if (input.dueAt) fields.push(`mode: customScheduled`, `dueAt: ${JSON.stringify(new Date(input.dueAt).toISOString())}`);
    const result = await bufferQuery<{ editPost: { post?: BufferPost; message?: string } }>(config.key, `mutation { editPost(input: { ${fields.join(" ")} }) { ... on PostActionSuccess { post { id text status dueAt channelId } } ... on MutationError { message } } }`);
    if (!result.editPost.post) throw new Error(result.editPost.message || "Buffer could not update the post");
    return NextResponse.json({ post: result.editPost.post });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update post" }, { status: 400 }); }
}

export async function DELETE(request: Request, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { id } = await context.params;
    const { config } = await allowedPost(id);
    const result = await bufferQuery<{ deletePost: { id?: string; message?: string } }>(config.key, `mutation { deletePost(input: { id: ${JSON.stringify(id)} }) { ... on DeletePostSuccess { id } ... on VoidMutationError { message } } }`);
    if (!result.deletePost.id) throw new Error(result.deletePost.message || "Buffer could not delete the post");
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete post" }, { status: 400 }); }
}
