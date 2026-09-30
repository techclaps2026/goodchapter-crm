import "server-only";
import type { PGlite } from "@electric-sql/pglite";
// Development preview uses the SAME PostgreSQL migration and RPC as production.
// It never reads a remote project and cannot be enabled in a production build.
export const demoEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.CRM_DEMO_MODE === "true";
const globals = globalThis as unknown as {
  tgcDemo?: Promise<PGlite>;
  tgcFiles?: Map<string, { bytes: Uint8Array; type: string }>;
};
export async function demoDb() {
  if (!demoEnabled()) throw new Error("Local preview is disabled");
  if (!globals.tgcDemo)
    globals.tgcDemo = (async () => {
      const { createDatabase, seedDemo } =
        await import("../scripts/db-harness.mjs");
      const db = await createDatabase();
      await seedDemo(db);
      return db;
    })().catch((error) => {
      globals.tgcDemo = undefined;
      throw error;
    });
  return globals.tgcDemo;
}
export function demoFiles() {
  return (globals.tgcFiles ??= new Map());
}
