import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { bufferChannels, bufferQuery, bufferTags, savedBufferConfig } from "@/lib/buffer";

const schema = z.object({
  idempotencyKey: z.uuid(),
  channelId: z.string().min(1).max(255),
  text: z.string().trim().max(5000),
  mediaUrl: z.url().optional().or(z.literal("")),
  mediaKind: z.enum(["image", "video"]).optional(),
  postType: z.enum(["post", "reel", "story"]).default("post"),
  firstComment: z.string().trim().max(2200).optional(),
  notification: z.boolean().default(false),
  saveToDraft: z.boolean().default(false),
  shareToFeed: z.boolean().default(true),
  tagIds: z.array(z.string().min(1).max(255)).max(20).default([]),
  reminder: z.object({ music: z.string().trim().max(200).optional(), products: z.string().trim().max(500).optional(), text: z.string().trim().max(1000).optional(), topics: z.string().trim().max(500).optional() }).optional(),
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
    if (!input.text && !input.mediaUrl) throw new Error("Add a caption or media");
    if (channel.service === "instagram" && !input.mediaUrl) throw new Error("Instagram posts need an image or video");
    if (input.mediaUrl && new URL(input.mediaUrl).protocol !== "https:") throw new Error("Media URL must use HTTPS");
    if (input.mediaUrl && !input.mediaKind) throw new Error("Choose the media type");
    if (channel.service === "instagram" && input.postType === "post" && input.mediaKind !== "image") throw new Error("Instagram feed posts need an image. Choose Reel for a video");
    if (channel.service === "instagram" && input.postType === "reel" && input.mediaKind !== "video") throw new Error("Instagram Reels need a video");
    if (channel.service !== "instagram" && input.postType !== "post") throw new Error("This post type is only available for Instagram");
    if (input.saveToDraft && input.mode === "shareNow") throw new Error("A draft cannot be published now");
    if (input.notification && input.firstComment) throw new Error("First comments require automatic publishing");
    if (input.mode === "customScheduled" && !input.saveToDraft && (!input.dueAt || Date.parse(input.dueAt) <= Date.now() + 60_000)) throw new Error("Choose a future publishing time");
    if (input.reminder && !input.notification) throw new Error("Music and product notes require reminder publishing");
    if (input.tagIds.length) {
      const tags = await bufferTags(config.key, config.organizationId);
      const allowedTags = new Set(tags.map((tag) => tag.id));
      if (input.tagIds.some((id) => !allowedTags.has(id))) throw new Error("Choose tags from this Buffer organization");
    }
    const db = await createClient();
    const { data: claimed, error: claimError } = await db.rpc("claim_buffer_post", { p_id: input.idempotencyKey, p_channel_id: input.channelId });
    if (claimError) throw claimError;
    const claim = claimed?.[0];
    if (!claim?.claimed) return NextResponse.json({ error: claim?.state === "succeeded" ? "This post was already submitted" : "This submission is already being processed. Check Buffer before trying again.", postId: claim?.buffer_post_id }, { status: 409 });
    const fields = [
      `text: ${JSON.stringify(input.text)}`,
      `channelId: ${JSON.stringify(input.channelId)}`,
      `schedulingType: ${input.notification ? "notification" : "automatic"}`,
      `mode: ${input.mode}`,
      `assets: ${input.mediaUrl ? `[{ ${input.mediaKind}: { url: ${JSON.stringify(input.mediaUrl)} } }]` : "[]"}`,
    ];
    if (input.saveToDraft) fields.push("saveToDraft: true");
    if (input.tagIds.length) fields.push(`tagIds: ${JSON.stringify(input.tagIds)}`);
    if (input.mode === "customScheduled" && !input.saveToDraft) fields.push(`dueAt: ${JSON.stringify(new Date(input.dueAt!).toISOString())}`);
    if (channel.service === "instagram") {
      const metadata = [`type: ${input.postType}`, `shouldShareToFeed: ${input.shareToFeed}`];
      if (input.firstComment && input.postType !== "story") metadata.push(`firstComment: ${JSON.stringify(input.firstComment)}`);
      if (input.reminder) {
        const stickers = Object.entries(input.reminder).filter(([, value]) => value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
        if (stickers.length) metadata.push(`stickerFields: { ${stickers.join(" ")} }`);
      }
      fields.push(`metadata: { instagram: { ${metadata.join(" ")} } }`);
    } else if (input.firstComment) fields.push(`metadata: { linkedin: { firstComment: ${JSON.stringify(input.firstComment)} } }`);
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
