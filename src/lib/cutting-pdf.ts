import type { CuttingResult } from "@/lib/cutting";
import { groupConsecutiveIdenticalBars } from "@/lib/cutting";

/** Экспорт карты раскроя в PDF (клиентский вызов). */
export async function downloadCuttingPdf(
  result: CuttingResult,
  title = "SmartCut — карта раскроя"
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 9;

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const lines = [
    `Заготовок (шт.): ${result.bars.length}`,
    `Полезная длина: ${Math.round(result.totalUsefulMm).toLocaleString("ru-RU")} мм из ${Math.round(result.totalStockMm).toLocaleString("ru-RU")} мм`,
    `Условные отходы: ~${result.wastePercent}%`,
    `Пропил: ${result.kerfMm} мм · резов между деталями: ${result.totalCuts}`,
    `Несколько длин заготовок: ${result.multiStock ? "да" : "нет"}`,
  ];
  for (const line of lines) {
    doc.text(line, margin, y);
    y += 5;
  }
  y += 4;

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text("Схема раскроя", margin, y);
  y += 7;

  const groups = groupConsecutiveIdenticalBars(result.bars);
  const barW = pageW - 2 * margin;
  const h = 7;

  for (const g of groups) {
    if (y > pageH - margin - 28) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(9);
    doc.text(
      `${g.count}× · заготовка ${g.bar.stockLengthMm} мм · остаток ${g.bar.wasteMm.toFixed(0)} мм`,
      margin,
      y
    );
    y += 5;

    const L = g.bar.stockLengthMm;
    doc.setDrawColor(190);
    doc.rect(margin, y, barW, h);
    let offsetMm = 0;
    for (let i = 0; i < g.bar.pieces.length; i++) {
      const p = g.bar.pieces[i];
      const segW = (p.lengthMm / L) * barW;
      const x = margin + (offsetMm / L) * barW;
      doc.setFillColor(235, 235, 235);
      doc.rect(x, y, segW, h, "FD");
      doc.setFontSize(7);
      doc.setTextColor(30, 30, 30);
      doc.text(`${p.lengthMm} мм`, x + segW / 2, y + h / 2 + 1.2, {
        align: "center",
      });
      offsetMm += p.lengthMm;
      if (i < g.bar.pieces.length - 1) offsetMm += result.kerfMm;
    }
    doc.setTextColor(0);
    y += h + 3;

    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(
      g.bar.pieces.map((p) => `${p.label} (${p.lengthMm} мм)`).join(" → "),
      margin,
      y
    );
    y += 8;
  }

  if (y > pageH - margin - 50) {
    doc.addPage();
    y = margin;
  } else {
    y += 6;
  }

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text("Сводка", margin, y);
  y += 7;

  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const colNo = margin;
  const colLen = margin + 10;
  const colWaste = margin + 40;
  const colDetX = margin + 62;
  const detailMaxW = pageW - margin - colDetX;
  doc.text("№", colNo, y);
  doc.text("Длина, мм", colLen, y);
  doc.text("Остаток, мм", colWaste, y);
  doc.text("Детали по порядку", colDetX, y);
  y += 4;
  doc.setDrawColor(210);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  doc.setTextColor(30, 30, 30);
  for (let i = 0; i < result.bars.length; i++) {
    const bar = result.bars[i];
    const detailStr = bar.pieces.map((p) => p.label).join(" → ");
    const detailLines = doc.splitTextToSize(detailStr, detailMaxW);
    const lineCount = Array.isArray(detailLines)
      ? detailLines.length
      : 1;
    const rowH = Math.max(5, lineCount * 3.8);
    if (y + rowH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    const yRow = y + 4;
    doc.text(String(i + 1), colNo, yRow);
    doc.text(String(bar.stockLengthMm), colLen, yRow);
    doc.text(bar.wasteMm.toFixed(0), colWaste, yRow);
    doc.text(detailLines, colDetX, yRow);
    y += rowH + 1.5;
  }

  doc.save(`smartcut-${new Date().toISOString().slice(0, 10)}.pdf`);
}
