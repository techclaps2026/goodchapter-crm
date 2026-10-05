import { jsPDF } from "jspdf";

const margin = 17;
const right = 193;

export async function drawDocumentHeader(
  pdf: jsPDF,
  companyName: string,
  label: string,
  reference: string,
  logoDataUrl?: string,
) {
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(24, 23, 21);
  try {
    let logo: string | HTMLImageElement | undefined = logoDataUrl;
    if (!logo) {
      const image = new Image();
      image.src = "/logo-dark-pdf.png";
      await image.decode();
      logo = image;
    }
    pdf.addImage(logo, "PNG", margin, 16, 70, 17.4);
  } catch {
    pdf.setFont("times", "bold");
    pdf.setFontSize(17);
    pdf.text(pdf.splitTextToSize(companyName, 85), margin, 25);
    pdf.setFont("helvetica", "normal");
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(label, right, 21, { align: "right" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(reference, right, 29, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setDrawColor(24, 23, 21);
  pdf.setLineWidth(0.45);
  pdf.line(margin, 41, right, 41);
}

export function drawDocumentFooter(pdf: jsPDF, companyName: string, reference: string) {
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 103, 94);
    pdf.text(`${companyName} | ${reference}`, margin, 285);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, right, 285, { align: "right" });
  }
}
