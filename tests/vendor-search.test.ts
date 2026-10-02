import { describe, expect, it } from "vitest";
import { matchesVendor } from "../lib/vendor-search";
import type { Vendor } from "../lib/types";

const vendor: Vendor = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Example Maker",
  category: "Diaries & stationery",
  subcategories: "Hoodies, varsity jackets, T-shirts, sweatshirts",
  contact_name: "",
  email: "",
  phone: "",
  city: "Delhi NCR",
  notes: "",
  archived: false,
  catalog_path: "",
  catalog_name: "",
};

describe("vendor product search", () => {
  it("matches singular and plural category words", () => {
    expect(matchesVendor(vendor, "diary")).toBe(true);
    expect(matchesVendor(vendor, "diaries")).toBe(true);
  });
  it("finds product subcategories", () => {
    expect(matchesVendor(vendor, "hoodie")).toBe(true);
    expect(matchesVendor(vendor, "t-shirt")).toBe(true);
    expect(matchesVendor(vendor, "varsity")).toBe(true);
    expect(matchesVendor(vendor, "candles")).toBe(false);
  });
});
