import { noteName } from "@/lib/notes";

/** Contenido de ejemplo para el modo demostración (sin base de datos ni bóveda). */
export function demoNote(path: string) {
  const title = noteName(path).replace(/^\d{4}-\d{2}-\d{2} /, "");
  return [
    "---",
    "tags:",
    "  - clase",
    "---",
    "",
    `# ${title}`,
    "",
    "> [!info] Modo demostración",
    "> Con una bóveda de Obsidian configurada, aquí verás y editarás el apunte real.",
    "",
    "## Ideas clave",
    "",
    "- La derivada mide la **razón de cambio** instantánea.",
    "- Regla de la cadena: $(f \\circ g)' = f'(g(x))\\,g'(x)$.",
    "- Ver también [[Límites]].",
    "",
    "## Tareas y pendientes",
    "",
    "- [x] Repasar la guía 3",
    "- [ ] Ejercicios 1 a 10 de la página 84",
    "",
    "| Función | Derivada |",
    "| --- | --- |",
    "| `sin x` | `cos x` |",
    "| `e^x` | `e^x` |",
    "",
  ].join("\n");
}
