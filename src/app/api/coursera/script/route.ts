export const dynamic = "force-static";

/**
 * Script que carga el marcador «Nober» dentro de coursera.org (con la sesión de la persona, en su navegador).
 * Vive en el servidor para poder ajustarlo sin reinstalar el marcador. Lee `window.__nober = { t, u }`.
 */
const SCRIPT = String.raw`(async () => {
  const cfg = window.__nober || {};
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:12px 16px;border-radius:16px;background:#1d1b26;color:#f4f2fb;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)";
  const say = (t, hide) => { box.textContent = "Nober · " + t; if (!box.isConnected) document.body.appendChild(box); if (hide) setTimeout(() => box.remove(), 9000); };
  if (!/(^|\.)coursera\.org$/.test(location.hostname)) return alert("Abre coursera.org y vuelve a pulsar el marcador «Nober».");
  if (!cfg.t || !cfg.u) return say("al marcador le falta la clave. Cópialo otra vez desde Ajustes.", true);
  say("leyendo tus cursos…");
  const grab = async (url) => {
    try {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      const body = (await r.text()).slice(0, 300000);
      // Rutas inexistentes responden una página HTML con 200: no cuentan
      return { url, status: r.ok && /^\s*[[{]/.test(body) ? r.status : r.ok ? 404 : r.status, body };
    } catch (e) { return { url, status: 0, body: String(e) }; }
  };
  const page = location.pathname.match(/^\/learn\/([a-z0-9-]+)/i);
  const memberships = await grab("/api/memberships.v1?q=me&showHidden=true&filter=current,preEnrolled&includes=courseId,courses.v1&fields=courseId,role,courses.v1(name,slug)");
  let courses = [], uid = null;
  try {
    const j = JSON.parse(memberships.body);
    for (const e of j.elements || []) {
      uid = uid || e.userId || String(e.id || "").split("~")[0] || null;
      if (e.courseId && !/NOT_ENROLLED|BROWSER/i.test(e.role || "")) courses.push(e.courseId);
    }
  } catch (e) {}
  if (memberships.status === 401 || memberships.status === 403) return say("inicia sesión en Coursera y vuelve a intentarlo.", true);
  say("leyendo tu avance (" + courses.length + " cursos)…");
  const progress = [];
  // Avance: el mismo que usa la página del curso (porcentaje general, por módulo y por ítem)
  if (uid) {
    for (const cid of courses.slice(0, 15)) {
      const r = await grab("/api/onDemandCoursesProgress.v1/" + uid + "~" + cid);
      if (r.status === 200) progress.push({ ...r, courseId: cid });
      const h = await grab("/api/onDemandHomeProgress.v1/" + uid + "~" + cid + "/?fields=modulesCompleted%2CmodulesPassed");
      if (h.status === 200) progress.push({ ...h, courseId: cid });
    }
  }
  say("enviando a Nober…");
  try {
    const res = await fetch(cfg.u + "/api/coursera/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.t },
      body: JSON.stringify({ page: page ? { slug: page[1].toLowerCase() } : null, memberships, progress }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) return say((j && j.error) || "no se pudo sincronizar (" + res.status + ").", true);
    const d = j.data;
    const parts = [];
    if (d.detected.length) parts.push(d.detected.length === 1 ? "curso nuevo: «" + d.detected[0].name + "». Te llegará un aviso para organizarlo" : d.detected.length + " cursos nuevos para organizar");
    if (d.modulesDone) parts.push(d.modulesDone + (d.modulesDone === 1 ? " módulo terminado" : " módulos terminados"));
    if (d.sessionsDone) parts.push(d.sessionsDone + (d.sessionsDone === 1 ? " sesión de estudio hecha" : " sesiones de estudio hechas"));
    else if (d.stepsDone) parts.push(d.stepsDone + (d.stepsDone === 1 ? " paso marcado" : " pasos marcados"));
    say(parts.length ? parts.join(" · ") + "." : "todo al día ✓", true);
  } catch (e) { say("no se pudo conectar con Nober.", true); }
})();`;

export function GET() {
  return new Response(SCRIPT, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
