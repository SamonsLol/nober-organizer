/**
 * Diferencias por líneas (LCS) entre dos textos, para mostrar qué cambia antes de aplicar una edición de la IA.
 * Sin dependencias; para textos muy grandes (más de ~3 millones de celdas) devuelve null y la UI muestra el texto nuevo.
 */
export type DiffOp = { type: "same" | "add" | "del"; text: string };

export function lineDiff(a: string, b: string): DiffOp[] | null {
  const x = a.split("\n");
  const y = b.split("\n");
  // Lo igual al principio y al final no entra en la tabla
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const xs = x.slice(start, endX);
  const ys = y.slice(start, endY);
  const n = xs.length;
  const m = ys.length;
  if (n * m > 3_000_000) return null;
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = xs[i] === ys[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const mid: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (xs[i] === ys[j]) {
      mid.push({ type: "same", text: xs[i] });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) mid.push({ type: "del", text: xs[i++] });
    else mid.push({ type: "add", text: ys[j++] });
  }
  while (i < n) mid.push({ type: "del", text: xs[i++] });
  while (j < m) mid.push({ type: "add", text: ys[j++] });
  return [...x.slice(0, start).map((text) => ({ type: "same" as const, text })), ...mid, ...x.slice(endX).map((text) => ({ type: "same" as const, text }))];
}
