import { zipSync } from "fflate";
import type { Line, OrderSizeEntry } from "./types";

/** The size form stores item names, so derive distinct, stable names from order lines. */
export function orderSizeChoices(items: Line[]) {
  const used = new Set<string>();
  return items.map((item, index) => {
    const description = item.description.trim() || `Item ${index + 1}`;
    let label = description.slice(0, 80).trim();
    if (used.has(label.toLocaleLowerCase())) {
      let duplicateNumber = index + 1;
      do {
        const suffix = ` (item ${duplicateNumber++})`;
        label = `${description.slice(0, 80 - suffix.length).trim()}${suffix}`;
      } while (used.has(label.toLocaleLowerCase()));
    }
    used.add(label.toLocaleLowerCase());
    return { label, description, quantity: item.quantity, details: item.details };
  });
}

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** One vendor-ready Excel sheet; every cell is text so phone numbers keep leading zeroes. */
export function orderSizesWorkbook(entries: OrderSizeEntry[]): Uint8Array {
  const rows = [
    ["Item", "Name", "Phone No", "Name to print", "Size"],
    ...entries.map((entry) => [
      entry.item,
      entry.name,
      entry.phone,
      entry.print_name,
      entry.size,
    ]),
  ];
  const rowXml = rows
    .map(
      (row, index) =>
        `<row r="${index + 1}">${row
          .map(
            (value, column) =>
              `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"${index ? "" : ' s="1"'}><is><t xml:space="preserve">${xml(value)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");
  const encode = (value: string) => new TextEncoder().encode(value);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Order sizes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    ),
    "xl/worksheets/sheet1.xml": encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="26" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="26" customWidth="1"/><col min="5" max="5" width="14" customWidth="1"/></cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:E${rows.length}"/></worksheet>`,
    ),
  };
  return zipSync(files, { level: 6 });
}
