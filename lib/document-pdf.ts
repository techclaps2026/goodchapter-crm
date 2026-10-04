import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CommercialDocument } from "./types";
import { dateLabel } from "./domain";
import { invoiceUpiUri } from "./payment-qr";
import QRCode from "qrcode";
import { quoteImageUrl } from "./quote-images";
const value = (n: number) =>
  "INR " +
  Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function buildSelectionPdf(d: CommercialDocument, shareToken?: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 17;
  const contentWidth = 176;
  const bottom = 279;
  let y = 52;
  const lines = (text: string, width: number) =>
    pdf.splitTextToSize(text, width) as string[];
  const newPage = () => {
    pdf.addPage();
    y = 16;
  };
  const ensureSpace = (height: number) => {
    if (y + height > bottom) newPage();
  };
  const writeLines = (text: string, x: number, top: number, width: number, step = 4.5) => {
    const wrapped = lines(text, width);
    pdf.text(wrapped, x, top);
    return top + wrapped.length * step;
  };
  pdf.setFont("helvetica");
  pdf.setTextColor(24, 23, 21);
  try {
    const logo = new Image();
    logo.src = "/logo-dark.svg";
    await logo.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 935;
    canvas.height = 232;
    canvas.getContext("2d")!.drawImage(logo, 0, 0, canvas.width, canvas.height);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, 16, 70, 17.4);
  } catch {
    pdf.setFontSize(16);
    pdf.text(d.business.company_name, margin, 26);
  }
  pdf.setFontSize(9);
  pdf.text("SELECTION PROPOSAL", 193, 21, { align: "right" });
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(d.ref, 193, 29, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setDrawColor(24, 23, 21);
  pdf.setLineWidth(0.45);
  pdf.line(margin, 41, 193, 41);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  y = writeLines(d.title, margin, y, contentWidth, 7) + 8;
  pdf.setFontSize(8);
  pdf.setTextColor(105, 98, 90);
  pdf.text("PREPARED FOR", margin, y);
  pdf.text("DETAILS", 108, y);
  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(24, 23, 21);
  const clientName = d.customer.organisation || d.customer.name;
  const clientNameEnd = writeLines(clientName, margin, y, 79, 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(105, 98, 90);
  const clientDetails = [
    d.customer.organisation ? d.customer.name : "",
    d.customer.billing_address,
    d.customer.email,
    d.customer.gstin ? `GSTIN: ${d.customer.gstin}` : "",
  ].filter(Boolean).join("\n");
  const leftEnd = clientDetails ? writeLines(clientDetails, margin, clientNameEnd + 1, 79) : clientNameEnd;
  const rightEnd = writeLines(
    `Valid until: ${dateLabel(d.valid_until)}\n${d.client_choice_enabled ? "Pricing will follow your selections" : "Concepts for discussion; pricing to follow"}`,
    108, y, 85,
  );
  y = Math.max(leftEnd, rightEnd) + 8;
  pdf.setDrawColor(222, 216, 204);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, 193, y);
  y += 11;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(105, 98, 90);
  pdf.text("EXPLORE YOUR OPTIONS", margin, y);
  y += 7;
  pdf.setTextColor(24, 23, 21);
  pdf.setFontSize(14);
  pdf.text(d.client_choice_enabled ? "Choose the details that make it yours" : "Explore the possibilities", margin, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(105, 98, 90);
  y = writeLines(d.client_choice_enabled
    ? "Choose one item from each group. We'll prepare a priced quotation after reviewing your selections."
    : "These ideas are for inspiration and discussion. Tell us what you like, and we'll prepare a priced quotation around your brief.", margin, y, contentWidth) + 7;

  const loadPhoto = async (path: string) => {
    if (!path) return null;
    try {
      const response = await fetch(quoteImageUrl(path, shareToken));
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob());
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (context) context.fillStyle = "#ffffff";
        context?.fillRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { data: canvas.toDataURL("image/jpeg", 0.8), width: canvas.width, height: canvas.height };
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return null;
    }
  };
  const gap = 4;
  const groupHeading = (group: { title: string; note?: string }, continued = false) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(24, 23, 21);
    pdf.text(continued ? `${group.title} (continued)` : group.title, margin, y);
    y += 5;
    pdf.setDrawColor(222, 216, 204);
    pdf.line(margin, y, 193, y);
    y += 4;
    if (group.note && !continued) {
      pdf.setFontSize(8);
      pdf.setTextColor(105, 98, 90);
      const noteLines = lines(group.note, contentWidth);
      pdf.text(noteLines, margin, y);
      y += noteLines.length * 4.2 + 3;
    }
  };
  const optionGroups = d.quote_options ?? [];
  for (const [groupIndex, group] of optionGroups.entries()) {
    // Keep the same three-slot rhythm as the preview, even when a group has two options.
    // A single option uses the full row as a feature card.
    const columns = group.options.length === 1 ? 1 : 3;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    const mediaHeight = (cardWidth - 5) / (columns === 1 ? 4.5 : 1.65);
    const copyTop = 2.5 + mediaHeight + 6;
    const layoutOption = (option: (typeof group.options)[number]) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      const title = lines(option.title, cardWidth - 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      const details = option.details ? lines(option.details, cardWidth - 6) : [];
      const selected = d.quote_selections?.[group.id] === option.id;
      return { option, title, details, selected,
        height: copyTop + title.length * 4 + details.length * 3.8 + (selected ? 6 : 0) + 4 };
    };
    const firstRowHeight = Math.max(...group.options.slice(0, columns).map((option) => layoutOption(option).height));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const noteHeight = group.note ? lines(group.note, contentWidth).length * 4.2 + 3 : 0;
    if (groupIndex === optionGroups.length - 1 && d.terms) {
      const rowHeights = Array.from({ length: Math.ceil(group.options.length / columns) }, (_, row) =>
        Math.max(...group.options.slice(row * columns, (row + 1) * columns).map((option) => layoutOption(option).height)));
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const termsHeight = 15 + lines(d.terms, contentWidth).length * 4.5;
      const groupHeight = 11 + noteHeight + rowHeights.reduce((sum, height) => sum + height + 2, 0);
      if (y + groupHeight + termsHeight > bottom && 16 + groupHeight + termsHeight <= bottom)
        newPage();
    }
    if (y + 9 + noteHeight + firstRowHeight > bottom) newPage();
    groupHeading(group);
    for (let index = 0; index < group.options.length; index += columns) {
      const row = group.options.slice(index, index + columns);
      const layouts = row.map(layoutOption);
      const rowHeight = Math.max(...layouts.map((layout) => layout.height));
      if (y + rowHeight > bottom) {
        newPage();
        groupHeading(group, true);
      }
      const photos = await Promise.all(layouts.map(({ option }) => loadPhoto(option.image_path)));
      for (const [column, layout] of layouts.entries()) {
        const x = margin + column * (cardWidth + gap);
        pdf.setDrawColor(layout.selected ? 118 : 222, layout.selected ? 78 : 216, layout.selected ? 52 : 204);
        pdf.rect(x, y, cardWidth, rowHeight);
        pdf.setFillColor(250, 248, 244);
        pdf.rect(x + 2.5, y + 2.5, cardWidth - 5, mediaHeight, "F");
        const photo = photos[column];
        if (photo) {
          const scale = Math.min((cardWidth - 8) / photo.width, (mediaHeight - 3) / photo.height);
          const imageWidth = photo.width * scale;
          const imageHeight = photo.height * scale;
          pdf.addImage(photo.data, "JPEG", x + (cardWidth - imageWidth) / 2,
            y + 2.5 + (mediaHeight - imageHeight) / 2, imageWidth, imageHeight);
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(118, 110, 100);
          pdf.text("Product photo pending", x + cardWidth / 2, y + 2.5 + mediaHeight / 2, { align: "center" });
        }
        pdf.setTextColor(24, 23, 21);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text(layout.title, x + 3, y + copyTop);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(105, 98, 90);
        if (layout.details.length)
          pdf.text(layout.details, x + 3, y + copyTop + 1 + layout.title.length * 4);
        if (layout.selected) {
          pdf.setFont("helvetica", "bold");
          pdf.text("Client selected", x + 3, y + rowHeight - 4);
        }
      }
      y += rowHeight + 2;
    }
    y += 2;
  }
  if (d.terms) {
    const termLines = lines(d.terms, contentWidth);
    ensureSpace(15 + termLines.length * 4.5);
    pdf.setDrawColor(222, 216, 204);
    pdf.line(margin, y, 193, y);
    y += 9;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(105, 98, 90);
    pdf.text("TERMS", margin, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const line of termLines) {
      ensureSpace(5);
      pdf.text(line, margin, y);
      y += 4.5;
    }
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 103, 94);
    pdf.text(`${d.business.company_name} | ${d.ref}`, margin, 285);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 193, 285, { align: "right" });
  }
  return pdf;
}

export async function buildDocumentPdf(d: CommercialDocument, shareToken?: string) {
  const selection = d.kind === "quote" && d.pricing_mode === "selection";
  if (selection) return buildSelectionPdf(d, shareToken);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = 210;
  const margin = 17;
  pdf.setFont("helvetica");
  pdf.setTextColor(20, 19, 17);
  try {
    const img = new Image();
    img.src = "/logo-dark.svg";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 935;
    c.height = 232;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    pdf.addImage(c.toDataURL("image/png"), "PNG", margin, 16, 70, 17.4);
  } catch {
    pdf.setFontSize(18);
    pdf.text(d.business.company_name, margin, 25);
  }
  pdf.setFontSize(10);
  pdf.text(selection ? "SELECTION PROPOSAL" : d.kind === "quote" ? "QUOTATION" : "INVOICE", width - margin, 21, {
    align: "right",
  });
  pdf.setFontSize(12);
  pdf.text(d.ref, width - margin, 29, { align: "right" });
  pdf.setDrawColor(40, 38, 34);
  pdf.line(margin, 40, width - margin, 40);
  let y = 48;
  pdf.setFontSize(9);
  const textBlock = (
    text: string,
    x: number,
    start: number,
    maxWidth: number,
  ) => {
    const lines = pdf.splitTextToSize(text, maxWidth);
    pdf.text(lines, x, start);
    return start + lines.length * Math.max(4.3, pdf.getFontSize() * 0.45);
  };
  const right = textBlock(
    [
      d.business.company_name,
      d.business.address,
      d.business.email,
      d.business.phone,
      d.business.gstin ? "GSTIN: " + d.business.gstin : "",
    ]
      .filter(Boolean)
      .join("\n"),
    115,
    y,
    78,
  );
  pdf.setFont("helvetica", "bold");
  pdf.text("PREPARED FOR", margin, y);
  pdf.setFont("helvetica", "normal");
  const left = textBlock(
    [
      d.customer.organisation,
      d.customer.name,
      d.customer.billing_address,
      d.customer.email,
      d.customer.gstin ? "GSTIN: " + d.customer.gstin : "",
    ]
      .filter(Boolean)
      .join("\n"),
    margin,
    y + 7,
    90,
  );
  y = Math.max(left, right) + 9;
  pdf.setFontSize(15);
  y = textBlock(d.title, margin, y, 176) + 3;
  pdf.setFontSize(9);
  pdf.text(
    d.kind === "quote"
      ? `Valid until: ${dateLabel(d.valid_until)}`
      : `Issued: ${dateLabel(d.issued_on)}    Due: ${dateLabel(d.due_on)}`,
    margin,
    y,
  );
  y += 7;
  if (!selection) {
  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin, top: 20, bottom: 20 },
    head: [["Description / HSN", "Qty", "Unit (INR)",
      ...(d.show_discount ? ["Disc."] : []), "Tax", "Total (INR)" ]],
    body: d.items.map((i) => [
      [i.description, i.details, i.hsn ? "HSN/SAC: " + i.hsn : "",
        i.moq ? "MOQ: " + i.moq + " units" : "", i.notes ? "Note: " + i.notes : ""]
        .filter(Boolean)
        .join("\n"),
      i.quantity,
      Number(i.unit_price).toFixed(2),
      ...(d.show_discount ? [`${i.discount_pct}%`] : []),
      `${i.tax_rate}%`,
      Number(i.total).toFixed(2),
    ]),
    styles: {
      fontSize: 8.5,
      cellPadding: 3.5,
      overflow: "linebreak",
      lineColor: [222, 216, 204],
      lineWidth: 0.1,
      textColor: [30, 28, 25],
    },
    headStyles: {
      fillColor: [12, 11, 10],
      textColor: [255, 255, 255],
      fontStyle: "normal",
    },
    columnStyles: {
      0: { cellWidth: d.show_discount ? 72 : 82 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      ...(d.show_discount ? { 5: { halign: "right" as const } } : {}),
    },
    rowPageBreak: "avoid",
  });
  const pos = pdf as jsPDF & { lastAutoTable: { finalY: number } };
  y = pos.lastAutoTable.finalY + 8;
  const rows = [
    ["Subtotal", value(d.subtotal)],
    ...(d.tax_mode === "CGST/SGST"
      ? [
          ["CGST", value(d.tax_amount / 2)],
          ["SGST", value(d.tax_amount / 2)],
        ]
      : [[d.tax_mode === "IGST" ? "IGST" : "Tax", value(d.tax_amount)]]),
    ["TOTAL", value(d.total)],
  ];
  if (y + rows.length * 7 > 270) {
    pdf.addPage();
    y = 25;
  }
  pdf.setFontSize(10);
  for (const [label, n] of rows) {
    pdf.text(label, 120, y);
    pdf.text(n, 193, y, { align: "right" });
    y += 7;
  }
  } else {
    y += 4;
    pdf.setFontSize(9);
    pdf.text("Choose one item from each group. A priced quotation will follow your selections.", margin, y);
    y += 8;
  }
  const appendBlock = (heading: string, body: string) => {
    if (!body) return;
    const lines = pdf.splitTextToSize(body, 176) as string[];
    if (y + 14 > 270) {
      pdf.addPage();
      y = 25;
    }
    y += 7;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text(heading, margin, y);
    pdf.setFont("helvetica", "normal");
    y += 6;
    for (const line of lines) {
      if (y > 270) {
        pdf.addPage();
        y = 25;
      }
      pdf.text(line, margin, y);
      y += 4.5;
    }
  };
  appendBlock("TERMS", d.terms);
  if (d.kind === "invoice")
    appendBlock("PAYMENT DETAILS", d.business.bank_details);
  const upiUri = invoiceUpiUri(d);
  if (upiUri) {
    if (y + 52 > 270) {
      pdf.addPage();
      y = 25;
    }
    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("PAY BY UPI", margin, y);
    pdf.setFont("helvetica", "normal");
    y += 4;
    const qr = await QRCode.toDataURL(upiUri, { margin: 1, width: 240 });
    pdf.addImage(qr, "PNG", margin, y, 34, 34);
    pdf.text(d.business.upi_id, margin + 40, y + 9);
    pdf.text(
      "Enter the outstanding amount before paying.",
      margin + 40,
      y + 15,
    );
    pdf.text("Confirm payment with The Good Chapter.", margin + 40, y + 21);
    y += 38;
  }
  if (d.kind === "quote" && (d.items.some((item) => item.image_path) || (d.quote_options?.length ?? 0) > 0)) {
    const loadPhoto = async (path: string) => {
      try {
        const response = await fetch(quoteImageUrl(path, shareToken));
        if (!response.ok) return null;
        const url = URL.createObjectURL(await response.blob());
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          const context = canvas.getContext("2d");
          if (context) context.fillStyle = "#ffffff";
          context?.fillRect(0, 0, canvas.width, canvas.height);
          context?.drawImage(image, 0, 0, canvas.width, canvas.height);
          return { data: canvas.toDataURL("image/jpeg", 0.78), width: canvas.width, height: canvas.height };
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch {
        return null;
      }
    };
    const newVisualPage = () => {
      pdf.addPage();
      y = 22;
    };
    const heading = (label: string) => {
      if (y > 244) newVisualPage();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(label, margin, y);
      pdf.setFont("helvetica", "normal");
      y += 8;
    };
    const card = async (title: string, details: string, imagePath: string, price: string) => {
      if (y + 48 > 270) newVisualPage();
      pdf.setDrawColor(222, 216, 204);
      pdf.rect(margin, y, 176, 44);
      if (imagePath) {
        const image = await loadPhoto(imagePath);
        if (image) {
          const scale = Math.min(38 / image.width, 38 / image.height);
          const imageWidth = image.width * scale;
          const imageHeight = image.height * scale;
          pdf.addImage(image.data, "JPEG", margin + 3 + (38 - imageWidth) / 2,
            y + 3 + (38 - imageHeight) / 2, imageWidth, imageHeight);
        }
      }
      const x = margin + 46;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(pdf.splitTextToSize(title, 125).slice(0, 2), x, y + 8);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(details, 125).slice(0, 3), x, y + 19);
      pdf.setFont("helvetica", "bold");
      if (price) pdf.text(price, x, y + 38);
      pdf.setFont("helvetica", "normal");
      y += 48;
    };
    if (!selection) newVisualPage();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(selection ? "Explore your options" : "The proposed collection", margin, y);
    pdf.setFont("helvetica", "normal");
    y += 12;
    if (!selection) heading("ITEMS IN THE QUOTED TOTAL");
    for (const item of selection ? [] : d.items) {
      await card(item.description, [item.details, item.moq ? `MOQ: ${item.moq} units` : "", item.notes ?? ""].filter(Boolean).join(" | "), item.image_path ?? "",
        `${item.quantity} x ${value(item.unit_price)}  |  Line total ${value(item.total)}`);
    }
    for (const group of d.quote_options ?? []) {
      pdf.setFontSize(8);
      const noteLines = group.note ? pdf.splitTextToSize(group.note, 176) as string[] : [];
      if (y + 8 + noteLines.length * 4.2 + 48 > 270) newVisualPage();
      heading(group.title.toUpperCase());
      if (noteLines.length) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(105, 98, 90);
        pdf.text(noteLines, margin, y);
        y += noteLines.length * 4.2 + 3;
        pdf.setTextColor(20, 19, 17);
      }
      for (const option of group.options) {
        await card(option.title, option.details, option.image_path,
          selection ? "" : `${value(option.unit_price)} / unit  |  ${group.quantity} units: ${value(group.quantity * Number(option.unit_price))}`);
      }
    }
    if ((d.quote_options?.length ?? 0) > 0) {
      if (y + 12 > 270) newVisualPage();
      pdf.setFontSize(8);
      pdf.text(selection
        ? "Your selections will be reviewed before a priced quotation is prepared."
        : "Alternative option prices are for comparison. Final choices need a revised quotation.", margin, y + 3);
    }
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setTextColor(110, 103, 94);
    pdf.setFontSize(8);
    pdf.text(`${d.business.company_name} | ${d.ref}`, margin, 285);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 193, 285, {
      align: "right",
    });
  }
  return pdf;
}
export async function downloadDocument(d: CommercialDocument, shareToken?: string) {
  const pdf = await buildDocumentPdf(d, shareToken);
  pdf.save(d.ref + ".pdf");
}
