import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { orderSizeChoices, orderSizesWorkbook } from "../lib/order-sizes";

describe("order size choices", () => {
  it("uses actual order lines and disambiguates duplicate descriptions", () => {
    const lines = [
      { description: "Hoodie", quantity: 10, details: "Navy" },
      { description: "Hoodie", quantity: 20, details: "Black" },
      { description: "T-shirt", quantity: 30, details: "" },
      { description: "Hoodie (item 4)", quantity: 4, details: "" },
      { description: "Hoodie", quantity: 5, details: "" },
    ];
    const choices = orderSizeChoices(lines as Parameters<typeof orderSizeChoices>[0]);
    expect(choices.map((choice) => choice.label)).toEqual([
      "Hoodie", "Hoodie (item 2)", "T-shirt", "Hoodie (item 4)",
      "Hoodie (item 5)",
    ]);
    expect(choices[1]).toMatchObject({ quantity: 20, details: "Black" });
  });
});

describe("order size vendor export", () => {
  it("creates an Excel sheet with text cells and escaped client input", () => {
    const files = unzipSync(
      orderSizesWorkbook([
        {
          id: "1",
          item: "Hoodie",
          name: "A & B",
          phone: "001234",
          print_name: "=Risk",
          size: "XL",
        },
      ]),
    );
    const sheet = new TextDecoder().decode(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain(
      '<c r="C2" t="inlineStr"><is><t xml:space="preserve">001234</t>',
    );
    expect(sheet).toContain("A &amp; B");
    expect(sheet).toContain("=Risk</t>");
    expect(sheet).toContain('<autoFilter ref="A1:E2"/>');
  });
});
