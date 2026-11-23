"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * Markdown de Obsidian en modo lectura: propiedades, [[enlaces]], incrustaciones, avisos (callouts),
 * tareas que se marcan con un clic y fórmulas ($…$). No se interpreta HTML crudo (seguro por defecto).
 */

const CALLOUT: Record<string, string> = {
  note: "📝", info: "ℹ️", tip: "💡", hint: "💡", important: "❗", success: "✅", check: "✅", done: "✅",
  question: "❓", help: "❓", faq: "❓", warning: "⚠️", caution: "⚠️", attention: "⚠️", failure: "❌", fail: "❌",
  missing: "❌", danger: "⛔", error: "⛔", bug: "🐞", example: "🧪", quote: "💬", cite: "💬", abstract: "📋",
  summary: "📋", tldr: "📋", todo: "☑️",
};

export interface Frontmatter { tags: string[]; props: [string, string][] }

/** Separa las propiedades (YAML sencillo) del cuerpo. `offset`: líneas que ocupaban. */
export function splitFrontmatter(src: string): { fm: Frontmatter | null; body: string; offset: number } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return { fm: null, body: src, offset: 0 };
  const fm: Frontmatter = { tags: [], props: [] };
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && key) {
      const v = item[1].replace(/^["']|["']$/g, "").trim();
      if (!v) continue;
      if (key === "tags" || key === "tag") fm.tags.push(v.replace(/^#/, ""));
      else fm.props.push([key, v]);
      continue;
    }
    const kv = line.match(/^([^:\s][^:]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].trim();
    const v = kv[2].replace(/^["']|["']$/g, "").trim();
    if (!v) continue;
    if (key === "tags" || key === "tag") fm.tags.push(...v.replace(/^\[|\]$/g, "").split(/[,\s]+/).filter(Boolean).map((t) => t.replace(/^#/, "")));
    else if (key !== "nober" && key !== "cssclasses" && key !== "aliases") fm.props.push([key, v]);
  }
  return { fm, body: src.slice(m[0].length), offset: m[0].split(/\n/).length - 1 };
}

const encodeTarget = (t: string) => encodeURIComponent(t).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);

/** Convierte la sintaxis propia de Obsidian a Markdown estándar, línea por línea (no cambia el número de líneas). */
function obsidianToMarkdown(body: string) {
  let fence = false;
  return body
    .replace(/%%[\s\S]*?%%/g, (m) => "\n".repeat(m.split("\n").length - 1)) // comentarios
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      return line
        .replace(/^(\s*(?:>\s*)+)\[!(\w+)\][+-]?\s*(.*)$/, (_, q: string, type: string, title: string) => {
          const t = type.toLowerCase();
          // Dos espacios al final: salto de línea, el texto del aviso va debajo del título
          return `${q}**${CALLOUT[t] ?? "📌"} ${title || t[0].toUpperCase() + t.slice(1)}**  `;
        })
        // Tarea vacía («- [ ] »): Obsidian la pinta como casilla; GFM solo si tiene texto
        .replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\])\s*$/, "$1 ​")
        .replace(/!\[\[([^\]]+)\]\]/g, (_, t: string) => {
          const name = t.split("|")[0];
          return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name) ? `*🖼️ ${name}*` : `[↪ ${name}](wikilink:${encodeTarget(name)})`;
        })
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, alias?: string) => `[${(alias ?? t.split("#")[0]).replace(/[[\]]/g, "")}](wikilink:${encodeTarget(t)})`);
    })
    .join("\n");
}

const urlTransform = (url: string) => (url.startsWith("wikilink:") || url.startsWith("obsidian:") ? url : defaultUrlTransform(url));

/** Cambia la casilla de la tarea que empieza en la línea `line` (0 = primera línea del archivo). */
export function toggleTaskAt(src: string, line: number) {
  const lines = src.split("\n");
  const l = lines[line];
  if (l === undefined) return src;
  const next = l.replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/, (_, a: string, mark: string, b: string) => `${a}${mark === " " ? "x" : " "}${b}`);
  if (next === l) return src;
  lines[line] = next;
  return lines.join("\n");
}

const TaskLine = createContext<number | null>(null);

export function Markdown({ source, onToggleTask, onWikilink, className }: {
  source: string;
  /** Línea (0 = primera del archivo) de la tarea que se marcó. Sin esto, las casillas son de solo lectura. */
  onToggleTask?: (line: number) => void;
  onWikilink?: (target: string) => void;
  className?: string;
}) {
  const { fm, body, offset } = useMemo(() => splitFrontmatter(source), [source]);
  const md = useMemo(() => obsidianToMarkdown(body), [body]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href = "", children }) => {
        if (href.startsWith("wikilink:")) {
          const target = decodeURIComponent(href.slice(9));
          return (
            <a
              href="#"
              className="md-wikilink"
              onClick={(e) => {
                e.preventDefault();
                onWikilink?.(target);
              }}
            >
              {children}
            </a>
          );
        }
        return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      },
      li: ({ node, className: cls, children }) => {
        const line = node?.position?.start.line;
        const isTask = typeof cls === "string" && cls.includes("task-list-item");
        return (
          <li className={cls}>
            {isTask && line ? <TaskLine.Provider value={line - 1 + offset}>{children}</TaskLine.Provider> : children}
          </li>
        );
      },
      input: (props) => (props.type === "checkbox" ? <TaskBox checked={Boolean(props.checked)} onToggle={onToggleTask} /> : <input {...props} />),
      img: ({ src, alt }) => (typeof src === "string" && /^https?:/.test(src) ? <img src={src} alt={alt ?? ""} loading="lazy" /> : <em>🖼️ {alt || String(src ?? "")}</em>),
    }),
    [offset, onToggleTask, onWikilink],
  );

  return (
    <div className={className}>
      {fm && (fm.tags.length || fm.props.length) ? <Properties fm={fm} /> : null}
      <div className="md-body">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} urlTransform={urlTransform} components={components}>
          {md}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function TaskBox({ checked, onToggle }: { checked: boolean; onToggle?: (line: number) => void }) {
  const line = useContext(TaskLine);
  const enabled = Boolean(onToggle) && line !== null;
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!enabled}
      onChange={() => enabled && onToggle!(line!)}
      aria-label={checked ? "Marcar como pendiente" : "Marcar como hecha"}
      className="md-task"
    />
  );
}

function Properties({ fm }: { fm: Frontmatter }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-ink/10 pb-3 text-[11.5px]">
      {fm.props.slice(0, 6).map(([k, v]) => (
        <span key={k} className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-ink/70">
          <span className="text-ink/45">{k}</span> {v}
        </span>
      ))}
      {fm.tags.map((t) => (
        <span key={t} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-ink/75">#{t}</span>
      ))}
    </div>
  );
}

export function MarkdownEmpty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-[13px] text-ink/50">{children}</p>;
}
