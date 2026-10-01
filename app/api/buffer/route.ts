import { NextResponse } from "next/server";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { bufferChannels, bufferPosts, bufferTags, savedBufferConfig } from "@/lib/buffer";

export async function GET() {
  try {
    const user = await session();
    if (!canManageUsers(user.role)) return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    if (demoEnabled()) return NextResponse.json({ connected: false, channels: [], posts: [], tags: [] });
    const config = await savedBufferConfig();
    if (!config) return NextResponse.json({ connected: false, channels: [], posts: [], tags: [] });
    const channels = await bufferChannels(config.key, config.organizationId);
    const [posts, tags] = await Promise.all([
      bufferPosts(config.key, config.organizationId),
      bufferTags(config.key, config.organizationId).catch(() => []),
    ]);
    const allowed = new Set(channels.map((channel) => channel.id));
    return NextResponse.json({ connected: true, organization: config.organizationName, channels, tags, posts: posts.filter((post) => allowed.has(post.channelId)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load social posts" }, { status: 400 });
  }
}
