// Lightweight PDF report generator using jsPDF + autoTable.
// Each report shares a common header (title, date, footer with page number).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfReportOptions = {
  title: string;
  subtitle?: string;
  filename: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
  orientation?: "portrait" | "landscape";
};

export function downloadPdfReport(opts: PdfReportOptions) {
  const doc = new jsPDF({
    orientation: opts.orientation ?? "portrait",
    unit: "pt",
    format: "letter",
  });

  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Family Care of the Fox Cities — Medics WI Inventory", 40, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(opts.title, 40, 58);
  if (opts.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(opts.subtitle, 40, 72);
    doc.setTextColor(0);
  }

  doc.setFontSize(9);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.text(`Generated ${today}`, pageWidth - 40, 40, { align: "right" });

  autoTable(doc, {
    startY: 90,
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((v) => (v == null ? "" : String(v)))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageNum = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Page ${pageNum} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 20,
        { align: "center" },
      );
      doc.text(
        "Confidential — internal use only. Verify before distributing.",
        40,
        doc.internal.pageSize.getHeight() - 20,
      );
      doc.setTextColor(0);
    },
  });

  doc.save(opts.filename);
}
