import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { orderSizesWorkbook } from "../lib/order-sizes";

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
