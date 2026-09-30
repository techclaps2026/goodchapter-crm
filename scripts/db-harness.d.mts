import type { PGlite, Transaction } from "@electric-sql/pglite";
export const OWNER: string;
export const STAFF: string;
export function createDatabase(): Promise<PGlite>;
export function asUser<T>(
  db: PGlite,
  user: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T>;
export function mutate(
  db: PGlite,
  action: string,
  p: unknown,
  key?: string,
  user?: string,
): Promise<{ id: string }>;
export function seedDemo(db: PGlite): Promise<void>;
