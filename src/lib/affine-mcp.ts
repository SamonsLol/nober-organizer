import "server-only";
import { AFFINE_ORIGIN } from "@/lib/affine";

/**
 * Cliente mínimo del MCP nativo de AFFiNE (0.27+): POST {origin}/api/workspaces/{id}/mcp, Bearer aff_mcp_v1…,
 * HTTP «streamable» sin estado (JSON-RPC 2.0; la respuesta puede venir como JSON o como evento SSE).
 * No depende de los nombres exactos de los argumentos: lee el esquema de cada herramienta.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
}

export class AffineMcpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const PROTOCOL = "2025-06-18";
let seq = 0;

async function rpc(conn: { workspace: string; token: string }, method: string, params: unknown, sessionId?: string) {
  const res = await fetch(`${AFFINE_ORIGIN}/api/workspaces/${encodeURIComponent(conn.workspace)}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${conn.token}`,
      "MCP-Protocol-Version": PROTOCOL,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => {
    throw new AffineMcpError(`No se pudo conectar con AFFiNE (${(e as Error).message}).`);
  });

  if (res.status === 401 || res.status === 403) throw new AffineMcpError("AFFiNE rechazó el token: revisa que sea del espacio correcto y no haya vencido.", res.status);
  if (res.status === 404) throw new AffineMcpError("Ese espacio de AFFiNE no existe o no tiene el servidor MCP activado.", 404);
  if (!res.ok) throw new AffineMcpError(`AFFiNE respondió ${res.status}.`, res.status);

  const text = await res.text();
  // SSE: tomar el último bloque «data:» con un JSON-RPC; JSON: tal cual
  const payloads = (res.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    : [text];
  for (const raw of payloads.reverse()) {
    let msg: { result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(raw);
    } catch {
      continue;
    }
    if (msg.error) throw new AffineMcpError(`AFFiNE: ${msg.error.message ?? "error desconocido"}.`);
    if ("result" in msg) return { result: msg.result, sessionId: res.headers.get("mcp-session-id") ?? sessionId };
  }
  throw new AffineMcpError("Respuesta de AFFiNE no reconocida.");
}

/** Abre una sesión (initialize) y ejecuta una petición. Los servidores sin estado ignoran la sesión. */
async function request(conn: { workspace: string; token: string }, method: string, params: unknown) {
  const init = await rpc(conn, "initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "nober-organizer", version: "1.0.0" },
  });
  return (await rpc(conn, method, params, init.sessionId ?? undefined)).result;
}

export async function listTools(conn: { workspace: string; token: string }): Promise<McpTool[]> {
  const result = (await request(conn, "tools/list", {})) as { tools?: McpTool[] };
  return result.tools ?? [];
}

const pick = (props: Record<string, unknown>, names: string[]) => names.find((n) => n in props);

/** Crea un documento con título y Markdown. Devuelve su id (para el enlace /workspace/<ws>/<id>). */
export async function createDocument(conn: { workspace: string; token: string }, doc: { title: string; markdown: string }) {
  const tools = await listTools(conn);
  const tool = tools.find((t) => t.name === "create_document") ?? tools.find((t) => /create.*doc/i.test(t.name));
  if (!tool) throw new AffineMcpError("Tu AFFiNE todavía no permite crear documentos por MCP (falta «create_document» o el token es de solo lectura).");

  const props = tool.inputSchema?.properties ?? {};
  const titleKey = pick(props, ["title", "name", "docTitle"]) ?? "title";
  const contentKey = pick(props, ["content", "markdown", "body", "text"]) ?? "content";
  const args: Record<string, unknown> = { [titleKey]: doc.title, [contentKey]: doc.markdown };

  const result = (await request(conn, "tools/call", { name: tool.name, arguments: args })) as {
    isError?: boolean;
    content?: { type: string; text?: string }[];
    structuredContent?: Record<string, unknown>;
  };

  const text = (result.content ?? []).map((c) => c.text ?? "").join("\n");
  if (result.isError) throw new AffineMcpError(`AFFiNE no pudo crear el documento: ${text || "sin detalle"}.`);
  const id = extractDocId(result.structuredContent, text);
  if (!id) throw new AffineMcpError("AFFiNE creó el documento pero no devolvió su id.");
  return id;
}

/** El id puede venir en structuredContent, como JSON en el texto o dentro de un enlace. */
export function extractDocId(structured: Record<string, unknown> | undefined, text: string): string | null {
  const fromObj = (o: Record<string, unknown> | undefined): string | null => {
    for (const k of ["docId", "documentId", "id", "doc_id"]) if (typeof o?.[k] === "string") return o[k] as string;
    const doc = o?.doc ?? o?.document;
    return doc && typeof doc === "object" ? fromObj(doc as Record<string, unknown>) : null;
  };
  const direct = fromObj(structured);
  if (direct) return direct;
  try {
    const parsed = fromObj(JSON.parse(text));
    if (parsed) return parsed;
  } catch {}
  return (
    text.match(/\/workspace\/[^/\s]+\/([A-Za-z0-9_-]{6,})/)?.[1] ??
    text.match(/(?:doc(?:ument)?[_ ]?id|\bid)["'\s:=]+["']?([A-Za-z0-9_-]{6,})/i)?.[1] ??
    null
  );
}
