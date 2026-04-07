/** Склонение «метр» для целого n (1 метр, 2–4 метра, 5+ метров, 11–14 метров). */
export function metersNounRu(n: number): string {
  const k = Math.abs(Math.floor(n)) % 100;
  const k10 = k % 10;
  if (k >= 11 && k <= 14) return "метров";
  if (k10 === 1) return "метр";
  if (k10 >= 2 && k10 <= 4) return "метра";
  return "метров";
}

function isWholeMetersMm(mm: number): boolean {
  return mm > 0 && mm % 1000 === 0;
}

function mmToWholeMeters(mm: number): number {
  return Math.round(mm / 1000);
}

/**
 * Подпись для бейджа: «Заготовка — 6 метров», «Заготовка — 6, 5, 4 метра» и т.п.
 * Дробные мм — через «мм», целые тысячи мм — через метры со склонением.
 */
export function formatStockLengthsBadgeRu(lengthsMm: readonly number[]): string {
  const unique = [...new Set(lengthsMm.map((m) => Math.round(m)))].sort((a, b) => b - a);
  if (unique.length === 0) return "Заготовка";

  if (unique.length === 1) {
    const mm = unique[0];
    if (isWholeMetersMm(mm)) {
      const n = mmToWholeMeters(mm);
      return `Заготовка — ${n} ${metersNounRu(n)}`;
    }
    return `Заготовка — ${mm.toLocaleString("ru-RU")} мм`;
  }

  const allWholeM = unique.every(isWholeMetersMm);
  if (allWholeM) {
    const nums = unique.map(mmToWholeMeters);
    const lastNum = nums[nums.length - 1]!;
    return `Заготовка — ${nums.join(", ")} ${metersNounRu(lastNum)}`;
  }

  const parts = unique.map((mm) =>
    isWholeMetersMm(mm)
      ? String(mmToWholeMeters(mm))
      : `${mm.toLocaleString("ru-RU")} мм`
  );
  return `Заготовка — ${parts.join(", ")}`;
}
