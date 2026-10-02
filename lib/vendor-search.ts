import type { Vendor } from "./types";

function searchableWords(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => {
      const singular =
        word.length > 3 && word.endsWith("ies")
          ? word.slice(0, -3) + "y"
          : word.length > 3 && word.endsWith("s")
            ? word.slice(0, -1)
            : word;
      return singular.length > 3 && singular.endsWith("ie")
        ? singular.slice(0, -2) + "i"
        : singular.length > 3 && singular.endsWith("y")
          ? singular.slice(0, -1) + "i"
          : singular;
    });
}

export function matchesVendor(vendor: Vendor, query: string) {
  const terms = searchableWords(query);
  if (!terms.length) return true;
  const fields = [
    vendor.name,
    vendor.category,
    vendor.subcategories,
    vendor.city,
    vendor.notes,
  ].flatMap(searchableWords);
  return terms.every((term) => fields.some((word) => word.includes(term)));
}
