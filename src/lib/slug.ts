/** «Cálculo Diferencial» → «calculo-diferencial» (para URLs). */
export function slugify(name: string, fallback: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      // Máximo 40 caracteres sin cortar una palabra a la mitad
      .replace(/^.+$/, (all) => {
        if (all.length <= 40) return all;
        const cut = all.slice(0, 41).lastIndexOf("-");
        return cut > 0 ? all.slice(0, cut) : all.slice(0, 40);
      }) || fallback
  );
}

/** Primer slug libre: «base», «base-2», «base-3»… */
export function firstFree(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
