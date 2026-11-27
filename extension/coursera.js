// Nober · sincronización con Coursera. Corre en coursera.org con tu sesión: lee tus cursos y tu avance con las mismas
// direcciones que usa la web de Coursera y se lo pasa a Nober. Tu sesión de Coursera nunca sale del navegador.
// Se sincroniza sola al abrir un curso (como mucho cada 4 horas) y cuando pulsas «Sincronizar» en la extensión.
(() => {
  if (window.__noberCoursera) return;
  window.__noberCoursera = true;

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "Sin respuesta." }));
      } catch {
        resolve({ ok: false, error: "La extensión se actualizó: recarga la página." });
      }
    });
  const toast = (html, ms) => globalThis.noberToast?.(html, ms);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function grab(url) {
    try {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      const body = (await r.text()).slice(0, 300000);
      // Rutas inexistentes responden una página HTML con 200: no cuentan
      return { url, status: r.ok && /^\s*[[{]/.test(body) ? r.status : r.ok ? 404 : r.status, body };
    } catch (e) {
      return { url, status: 0, body: String(e) };
    }
  }

  async function collect() {
    const page = location.pathname.match(/^\/learn\/([a-z0-9-]+)/i);
    const memberships = await grab(
      "/api/memberships.v1?q=me&showHidden=true&filter=current,preEnrolled&includes=courseId,courses.v1&fields=courseId,role,courses.v1(name,slug)",
    );
    if (memberships.status === 401 || memberships.status === 403) throw new Error("Inicia sesión en Coursera y vuelve a intentarlo.");
    const courses = [];
    let uid = null;
    try {
      const j = JSON.parse(memberships.body);
      for (const e of j.elements || []) {
        uid = uid || e.userId || String(e.id || "").split("~")[0] || null;
        if (e.courseId && !/NOT_ENROLLED|BROWSER/i.test(e.role || "")) courses.push(e.courseId);
      }
    } catch {}
    const progress = [];
    if (uid) {
      for (const cid of courses.slice(0, 15)) {
        const r = await grab("/api/onDemandCoursesProgress.v1/" + uid + "~" + cid);
        if (r.status === 200) progress.push({ ...r, courseId: cid });
        const h = await grab("/api/onDemandHomeProgress.v1/" + uid + "~" + cid + "/?fields=modulesCompleted%2CmodulesPassed");
        if (h.status === 200) progress.push({ ...h, courseId: cid });
      }
    }
    return { page: page ? { slug: page[1].toLowerCase() } : null, memberships, progress };
  }

  let running = false;
  async function sync(manual) {
    if (running) return { ok: false, error: "Ya se está sincronizando." };
    running = true;
    try {
      if (manual) toast("Nober · leyendo tus cursos de Coursera…", 0);
      const payload = await collect();
      const r = await send({ type: "sync", payload });
      if (!r.ok) throw new Error(r.error);
      const d = r.data;
      const parts = [];
      if (d.detected.length)
        parts.push(d.detected.length === 1 ? `curso nuevo: <b>${esc(d.detected[0].name)}</b>. Te llegará un aviso para organizarlo` : `${d.detected.length} cursos nuevos para organizar`);
      if (d.modulesDone) parts.push(d.modulesDone + (d.modulesDone === 1 ? " módulo terminado" : " módulos terminados"));
      if (manual || parts.length) toast("Nober · " + (parts.length ? parts.join(" · ") + "." : "todo al día ✓"), 8000);
      return { ok: true, data: d };
    } catch (e) {
      if (manual) toast("Nober · " + esc(e.message), 8000);
      return { ok: false, error: e.message };
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type !== "sync-now") return;
    sync(true).then(reply);
    return true;
  });

  // Automática: al abrir un curso, si pasaron más de 4 horas
  async function auto() {
    if (!/^\/learn\//.test(location.pathname)) return;
    const r = await send({ type: "shouldSync" });
    if (r.ok && r.data) sync(false);
  }
  setTimeout(auto, 4000);
  let path = location.pathname;
  setInterval(() => {
    if (location.pathname === path) return;
    path = location.pathname;
    setTimeout(auto, 3000);
  }, 2000);
})();
