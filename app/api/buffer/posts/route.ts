import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { bufferChannels, bufferQuery, savedBufferConfig } from "@/lib/buffer";

const schema = z.object({
  idempotencyKey: z.uuid(),
  channelId: z.string().min(1).max(255),
  text: z.string().trim().min(1).max(5000),
  imageUrl: z.url().optional().or(z.literal("")),
  mode: z.enum(["addToQueue", "customScheduled", "shareNow"]),
  dueAt: z.iso.datetime({ offset: true }).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled()) return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    const input = schema.parse(await request.json());
    const config = await savedBufferConfig();
    if (!config) throw new Error("Connect Buffer in Settings first");
    const channels = await bufferChannels(config.key, config.organizationId);
    const channel = channels.find((item) => item.id === input.channelId);
    if (!channel) throw new Error("Choose a connected Instagram or LinkedIn channel");
    if (channel.service === "instagram" && !input.imageUrl) throw new Error("Instagram posts need a public image URL");
    if (input.imageUrl && new URL(input.imageUrl).protocol !== "https:") throw new Error("Image URL must use HTTPS");
    if (input.mode === "customScheduled" && (!input.dueAt || Date.parse(input.dueAt) <= Date.now() + 60_000)) throw new Error("Choose a future publishing time");
    const db = await createClient();
    const { data: claimed, error: claimError } = await db.rpc("claim_buffer_post", { p_id: input.idempotencyKey, p_channel_id: input.channelId });
    if (claimError) throw claimError;
    const claim = claimed?.[0];
    if (!claim?.claimed) return NextResponse.json({ error: claim?.state === "succeeded" ? "This post was already submitted" : "This submission is already being processed. Check Buffer before trying again.", postId: claim?.buffer_post_id }, { status: 409 });
    const fields = [
      `text: ${JSON.stringify(input.text)}`,
      `channelId: ${JSON.stringify(input.channelId)}`,
      "schedulingType: automatic",
      `mode: ${input.mode}`,
      `assets: ${input.imageUrl ? `[{ image: { url: ${JSON.stringify(input.imageUrl)} } }]` : "[]"}`,
    ];
    if (input.mode === "customScheduled") fields.push(`dueAt: ${JSON.stringify(new Date(input.dueAt!).toISOString())}`);
    if (channel.service === "instagram") fields.push("metadata: { instagram: { type: post, shouldShareToFeed: true } }");
    try {
      const result = await bufferQuery<{ createPost: { post?: { id: string; status: string; dueAt: string | null }; message?: string } }>(config.key, `mutation { createPost(input: { ${fields.join(" ")} }) { ... on PostActionSuccess { post { id status dueAt } } ... on MutationError { message } } }`);
      if (!result.createPost.post) {
        const message = result.createPost.message || "Buffer rejected the post";
        await db.rpc("finish_buffer_post", { p_id: input.idempotencyKey, p_state: "failed", p_buffer_post_id: null, p_error: message });
        return NextResponse.json({ error: message }, { status: 400 });
      }
      await db.rpc("finish_buffer_post", { p_id: input.idempotencyKey, p_state: "succeeded", p_buffer_post_id: result.createPost.post.id, p_error: null });
      return NextResponse.json({ post: result.createPost.post });
    } catch (error) {
      await db.rpc("finish_buffer_post", { p_id: input.idempotencyKey, p_state: "unknown", p_buffer_post_id: null, p_error: "Check Buffer for this post before retrying" });
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit post" }, { status: 400 });
  }
}
