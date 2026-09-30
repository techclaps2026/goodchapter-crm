import { refreshSession } from "@/lib/supabase/proxy";
export const proxy = refreshSession;
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|woff2)$).*)",
  ],
};
