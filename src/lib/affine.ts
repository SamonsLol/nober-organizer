/**
 * Integración con AFFiNE, aislada en un solo módulo (la API de AFFiNE cambia entre versiones).
 * Fase 2: enlaces profundos + vista embebida. Fase 4: creación de apuntes por servidor (MCP).
 */

// Configuración por entorno (NEXT_PUBLIC_*: se fija al compilar, también en la imagen Docker).
// Para que la sesión funcione dentro del iframe, AFFiNE autoalojado debe vivir en el mismo dominio que la app
// (p. ej. notas.midominio.com ↔ organizador.midominio.com). Sin configurar se usa la nube oficial de AFFiNE.
export const AFFINE_ORIGIN = (process.env.NEXT_PUBLIC_AFFINE_ORIGIN || "https://app.affine.pro").replace(/\/+$/, "");
export const AFFINE_WORKSPACE = process.env.NEXT_PUBLIC_AFFINE_WORKSPACE || "";
export const AFFINE_HOST = new URL(AFFINE_ORIGIN).host;

/** Raíz del espacio de trabajo (sin espacio configurado, la raíz del servidor). */
export const AFFINE_BASE = AFFINE_WORKSPACE ? `${AFFINE_ORIGIN}/workspace/${AFFINE_WORKSPACE}` : AFFINE_ORIGIN;

/** Vista de todos los documentos del espacio. */
export const AFFINE_HOME = AFFINE_WORKSPACE ? `${AFFINE_BASE}/all` : AFFINE_ORIGIN;

export const affineDocUrl = (docId: string) => `${AFFINE_BASE}/${docId}`;

export const isAffineUrl = (url?: string) => Boolean(url?.startsWith(AFFINE_ORIGIN));
