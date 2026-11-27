/** Permiso mínimo para enviar: solo calendarios creados por la app (no toca los demás). */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/** Leer (sin modificar) los demás calendarios, para mostrarlos en la app. */
export const GOOGLE_READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const has = (scope: string | null | undefined, wanted: string) => Boolean(scope?.split(/[\s,]+/).includes(wanted));
export const hasReadScope = (scope?: string | null) => has(scope, GOOGLE_READ_SCOPE);
