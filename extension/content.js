// Nober · lo que lees, a tus apuntes. Al seleccionar texto aparece «✎ Nober»; el panel deja:
//  - «Agregar con IA»: la IA propone qué agregar y en qué sección del apunte; revisas, editas y aplicas.
//  - «Bandeja»: el fragmento queda pendiente en Nober para agregarlo después (a mano o con IA) desde el editor de apuntes.
// Sin selección (atajo, menú contextual o el popup) se usa el texto de toda la página.
// Lo guardado se marca en la página con la CSS Custom Highlight API.
(() => {
  if (window.__noberContent) return;
  window.__noberContent = true;

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "Sin respuesta de la extensión." }));
      } catch {
        resolve({ ok: false, error: "La extensión se actualizó: recarga la página." });
      }
    });
  const api = (path, method, body) => send({ type: "api", path, method, body });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /* ───────────── Interfaz (shadow DOM, a salvo del CSS de la página) ───────────── */

  const host = document.createElement("div");
  host.id = "nober-ext-host";
  host.style.cssText = "all:initial;position:absolute;top:0;left:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .bubble { position: absolute; display: none; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: 999px;
      background: #a78bfa; color: #1d1b26; font: 600 12.5px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
    .bubble:hover { background: #b9a2fc; }
    .panel { position: absolute; display: none; width: 380px; max-height: min(640px, calc(100vh - 24px)); overflow: auto; padding: 14px; border-radius: 18px;
      background: #1d1b26; color: #f4f2fb; font-size: 13px; line-height: 1.45; box-shadow: 0 16px 40px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.08); }
    .title { font-weight: 600; font-size: 13.5px; margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .x { border: 0; background: none; color: #a9a5bd; font-size: 18px; cursor: pointer; line-height: 1; }
    .quote { max-height: 88px; overflow: auto; margin: 0 0 6px; padding: 8px 10px; border-left: 3px solid #a78bfa; background: rgba(255,255,255,.04);
      border-radius: 0 10px 10px 0; color: #d9d5ea; font-size: 12.5px; white-space: pre-wrap; }
    label { display: block; color: #a9a5bd; font-size: 11.5px; margin: 9px 0 4px; }
    select, textarea, input[type=text] { width: 100%; border: 1px solid rgba(255,255,255,.1); background: #26232f; color: #f4f2fb; border-radius: 10px;
      padding: 7px 9px; font-size: 12.5px; }
    select + select { margin-top: 6px; }
    textarea { resize: vertical; min-height: 44px; }
    .dest { padding: 7px 9px; border-radius: 10px; background: rgba(167,139,250,.12); color: #d9cffd; font-size: 12px; }
    .check { display: flex; gap: 8px; align-items: center; margin-top: 10px; color: #d9d5ea; font-size: 12.5px; cursor: pointer; }
    .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .btn { height: 32px; padding: 0 14px; border-radius: 999px; border: 0; font-size: 12.5px; cursor: pointer; background: rgba(255,255,255,.08); color: #f4f2fb; }
    .btn.primary { background: #a78bfa; color: #1d1b26; font-weight: 600; }
    .btn:disabled { opacity: .6; cursor: default; }
    .err { color: #ff9b9b; font-size: 12px; margin-top: 8px; }
    .muted { color: #a9a5bd; font-size: 12px; }
    .edit { margin-top: 10px; padding: 9px 10px; border-radius: 12px; background: rgba(255,255,255,.04); }
    .edit-h { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12.5px; color: #e6defe; }
    .edit-h input { accent-color: #a78bfa; }
    .tag { font-weight: 500; font-size: 10.5px; padding: 1px 6px; border-radius: 999px; background: rgba(167,139,250,.2); color: #d9cffd; }
    .edit textarea { margin-top: 6px; min-height: 90px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    .toast { position: fixed; right: 16px; bottom: 16px; max-width: 360px; padding: 11px 15px; border-radius: 16px; background: #1d1b26; color: #f4f2fb;
      font-size: 13px; line-height: 1.45; box-shadow: 0 10px 30px rgba(0,0,0,.35); display: none; }
    .toast b { color: #c9b8ff; font-weight: 600; }
  </style>
  <button class="bubble" title="Nober (Alt+Shift+S)">✎ Nober</button>
  <div class="panel" role="dialog" aria-label="Nober"></div>
  <div class="toast"></div>`;
  const $ = (s) => root.querySelector(s);
  const bubble = $(".bubble");
  const panel = $(".panel");
  const toastEl = $(".toast");
  let toastTimer;

  function toast(html, ms = 7000) {
    toastEl.innerHTML = html;
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => (toastEl.style.display = "none"), ms);
  }
  globalThis.noberToast = toast;

  const mount = () => {
    if (!host.isConnected) document.documentElement.appendChild(host);
  };

  /* ───────────── Selección ───────────── */

  // Lo que se está trabajando: { kind: "selection" | "page", text, range? }
  let work = null;

  function currentSelection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (text.length < 3) return null;
    const node = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (node?.closest?.("input, textarea, [contenteditable=''], [contenteditable='true']")) return null;
    return { kind: "selection", range: sel.getRangeAt(0).cloneRange(), text };
  }

  /** Texto principal de la página (artículo, lectura o transcripción si los hay). */
  function pageText() {
    const el =
      document.querySelector("article, main, [role=main], .rc-ItemPage, .rc-CML") ||
      document.body;
    return (el.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 60000);
  }

  function place(el, rect) {
    mount();
    el.style.display = el === bubble ? "flex" : "block";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    let left = rect ? rect.right + scrollX - w : scrollX + vw - w - 16;
    left = Math.max(scrollX + 8, Math.min(left, scrollX + vw - w - 8));
    let top = rect ? rect.bottom + scrollY + 8 : scrollY + 16;
    if (rect && rect.bottom + h + 16 > innerHeight) top = rect.top + scrollY - h - 8;
    el.style.left = left + "px";
    el.style.top = Math.max(scrollY + 8, top) + "px";
  }

  const hideBubble = () => (bubble.style.display = "none");
  const hidePanel = () => {
    panel.style.display = "none";
    work = null;
  };

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      if (panel.style.display === "block") return;
      const s = currentSelection();
      if (!s) return hideBubble();
      work = s;
      const rects = s.range.getClientRects();
      place(bubble, rects[rects.length - 1] || s.range.getBoundingClientRect());
    }, 10);
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.composedPath().includes(host)) hideBubble();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideBubble();
      hidePanel();
    }
  });
  bubble.addEventListener("mousedown", (e) => e.preventDefault());
  bubble.addEventListener("click", () => openPanel({}));

  /* ───────────── Panel: formulario ───────────── */

  let me = null; // { targets, ai, vault, lastTarget }
  let ctx = null; // { coursera }

  async function openPanel({ page, auto }) {
    const sel = page ? null : (work?.kind === "selection" ? work : null) || currentSelection();
    if (!sel && !page && !auto) return toast("Selecciona primero el texto que quieres agregar.");
    if (sel) work = sel;
    else {
      const text = pageText();
      if (text.length < 20) return toast("Nober · no encontré texto en esta página.");
      work = { kind: "page", text };
    }
    hideBubble();
    panel.innerHTML = `<p class="title">${work.kind === "page" ? "Apuntes de esta página" : "Agregar a mis apuntes"} <button class="x" aria-label="Cerrar">×</button></p><p class="muted">Cargando…</p>`;
    $(".x").onclick = hidePanel;
    place(panel, work.range?.getBoundingClientRect());

    const [r1, r2] = await Promise.all([send({ type: "me" }), api("/api/ext/context", "POST", { url: location.href })]);
    if (!r1.ok) return showError(r1.error);
    me = r1.data;
    ctx = r2.ok ? r2.data : { coursera: null };
    renderForm();
  }

  function showError(msg) {
    panel.innerHTML = `<p class="title">Nober <button class="x" aria-label="Cerrar">×</button></p><p class="err">${esc(msg)}</p>`;
    $(".x").onclick = hidePanel;
  }

  function renderForm(prev = {}) {
    const c = ctx.coursera;
    const isSel = work.kind === "selection";
    const auto = Boolean(c?.notePath);
    panel.innerHTML = `
      <p class="title">${isSel ? "Agregar a mis apuntes" : "Apuntes de esta página"} <button class="x" aria-label="Cerrar">×</button></p>
      ${isSel ? `<div class="quote"></div>` : `<div class="dest">Se usará el texto de toda la página (${Math.round(work.text.length / 1000)} mil caracteres).</div>`}
      <label>Apunte</label>
      <div class="dest-wrap"></div>
      <label>¿Qué agregar? (opcional)</label>
      <input type="text" class="instr" placeholder="Ej.: solo definiciones y ejemplos · resume en 5 puntos">
      ${me.ai ? `<label class="check"><input type="checkbox" class="cards"> Crear también tarjetas de repaso</label>` : ""}
      <div class="err"></div>
      <div class="row">
        ${isSel ? `<button class="btn inbox" title="Guardarlo en Nober para agregarlo después">Guardar en bandeja</button>` : ""}
        <button class="btn primary go"${me.ai && me.vault ? "" : " disabled"}>Agregar con IA</button>
      </div>
      ${me.ai && me.vault ? "" : `<p class="muted">${me.vault ? "La IA no está configurada en tu Nober." : "Tu cuenta no tiene bóveda de Obsidian en este Nober."} Puedes usar la bandeja.</p>`}`;
    $(".x").onclick = hidePanel;
    if (isSel) $(".quote").textContent = work.text.length > 600 ? work.text.slice(0, 600) + "…" : work.text;
    if (prev.instr) $(".instr").value = prev.instr;
    if (prev.cards && $(".cards")) $(".cards").checked = true;

    const wrap = $(".dest-wrap");
    if (auto) {
      wrap.innerHTML = `<div class="dest">${esc(c.where)}${c.lesson ? ` · ${esc(c.lesson)}` : ""}<br><span class="muted">El apunte del módulo que estás viendo.</span></div>
        <button class="btn other" style="margin-top:6px;height:26px;font-size:11.5px">Elegir otro apunte</button>`;
      $(".other").onclick = () => {
        ctx = { coursera: { ...c, notePath: null } };
        renderForm({ instr: $(".instr").value, cards: $(".cards")?.checked });
      };
    } else if (!me.targets.length) {
      wrap.innerHTML = `<div class="dest">Crea primero un proyecto o una materia en Nober.</div>`;
      $(".go").disabled = true;
    } else {
      const opts = me.targets.map((t) => `<option value="${t.kind}:${esc(t.id)}">${t.kind === "course" ? "Materia" : "Proyecto"} · ${esc(t.name)}</option>`).join("");
      wrap.innerHTML = `<select class="target">${opts}</select><select class="note"><option value="">Cargando notas…</option></select>`;
      const pre = c?.projectId ? { kind: "project", id: c.projectId } : me.lastTarget;
      if (pre && me.targets.some((t) => t.kind === pre.kind && t.id === pre.id)) $(".target").value = `${pre.kind}:${pre.id}`;
      $(".target").onchange = loadNotes;
      loadNotes();
    }
    $(".go").onclick = preview;
    if ($(".inbox")) $(".inbox").onclick = saveToInbox;
    $(".instr").onkeydown = (e) => e.key === "Enter" && !$(".go").disabled && preview();
  }

  const targetOf = () => {
    const v = $(".target")?.value;
    return v ? { kind: v.split(":")[0], id: v.slice(v.indexOf(":") + 1) } : undefined;
  };

  async function loadNotes() {
    const t = targetOf();
    const sel = $(".note");
    if (!t || !sel) return;
    sel.innerHTML = `<option value="">Cargando notas…</option>`;
    const r = await api(`/api/ext/notes?kind=${t.kind}&id=${encodeURIComponent(t.id)}`);
    const title = document.title.replace(/\s*[|·-]\s*Coursera\s*$/i, "").trim().slice(0, 60) || "Apuntes de la web";
    const notes = r.ok ? r.data.notes : [];
    sel.innerHTML =
      `<option value="__new">+ Nota nueva: «${esc(title)}»</option>` +
      notes.map((n) => `<option value="${esc(n.path)}">${esc(n.title)}</option>`).join("");
    if (notes.length) sel.value = notes[0].path;
    if (!r.ok) $(".err").textContent = r.error;
  }

  function destOf() {
    if (ctx.coursera?.notePath && !$(".target")) return { auto: true };
    const t = targetOf();
    const n = $(".note")?.value;
    if (!t) return null;
    return !n || n === "__new" ? { target: t, newNote: true } : { notePath: n };
  }

  async function saveToInbox() {
    const b = $(".inbox");
    b.disabled = true;
    b.textContent = "Guardando…";
    const r = await api("/api/ext/clips", "POST", { text: work.text, url: location.href, title: document.title, target: targetOf() });
    if (!r.ok) {
      b.disabled = false;
      b.textContent = "Guardar en bandeja";
      return ($(".err").textContent = r.error);
    }
    const range = work.range;
    hidePanel();
    getSelection()?.removeAllRanges();
    if (range) paint([range]);
    toast(`Nober · guardado en la bandeja${r.data.where !== "la bandeja" ? ` (<b>${esc(r.data.where)}</b>)` : ""}. Agrégalo cuando quieras desde el editor de apuntes.`);
  }

  /* ───────────── Panel: propuesta de la IA ───────────── */

  let lastReq = null;

  async function preview() {
    const dest = destOf();
    if (!dest) return ($(".err").textContent = "Elige el apunte.");
    const instr = $(".instr").value.trim();
    const cards = Boolean($(".cards")?.checked);
    const go = $(".go");
    go.disabled = true;
    go.textContent = work.kind === "page" ? "Leyendo la página…" : "Pensando…";
    $(".err").textContent = "";
    lastReq = { kind: work.kind, text: work.text, instruction: instr || undefined, url: location.href, title: document.title, dest, cards };
    const r = await api("/api/ext/integrate", "POST", { ...lastReq, step: "preview" });
    if (!r.ok) {
      go.disabled = false;
      go.textContent = "Agregar con IA";
      return ($(".err").textContent = r.error);
    }
    renderPreview(r.data, { instr, cards });
  }

  function renderPreview(p, prev) {
    panel.innerHTML = `
      <p class="title">Propuesta para ${esc(p.where)} <button class="x" aria-label="Cerrar">×</button></p>
      <p class="muted">${esc(p.summary)}</p>
      <div class="edits"></div>
      <div class="err"></div>
      <div class="row"><button class="btn back">Atrás</button>${p.edits.length ? `<button class="btn primary apply">Agregar al apunte</button>` : ""}</div>`;
    $(".x").onclick = hidePanel;
    $(".back").onclick = () => renderForm(prev);
    const box = $(".edits");
    p.edits.forEach((e, i) => {
      const d = document.createElement("div");
      d.className = "edit";
      d.innerHTML = `<div class="edit-h"><input type="checkbox" checked data-i="${i}"> <span></span>${e.isNew ? ` <span class="tag">nueva</span>` : ""}</div><textarea data-i="${i}"></textarea>`;
      d.querySelector("span").textContent = e.heading.replace(/^#+\s*/, "");
      d.querySelector("textarea").value = e.markdown;
      box.appendChild(d);
    });
    if (!p.edits.length) return;
    $(".apply").onclick = async () => {
      const edits = p.edits
        .map((e, i) => ({ ...e, markdown: root.querySelector(`textarea[data-i="${i}"]`).value, on: root.querySelector(`input[data-i="${i}"]`).checked }))
        .filter((e) => e.on && e.markdown.trim())
        .map(({ on, ...e }) => e);
      if (!edits.length) return ($(".err").textContent = "Marca al menos una sección.");
      const b = $(".apply");
      b.disabled = true;
      b.textContent = "Agregando…";
      const r = await api("/api/ext/integrate", "POST", { ...lastReq, step: "apply", edits });
      if (!r.ok) {
        b.disabled = false;
        b.textContent = "Agregar al apunte";
        return ($(".err").textContent = r.error);
      }
      const range = work?.range;
      hidePanel();
      getSelection()?.removeAllRanges();
      if (range) paint([range]);
      const d = r.data;
      toast(
        `Nober · agregado a <b>${esc(d.where)}</b> (${d.sections} ${d.sections === 1 ? "sección" : "secciones"})` +
          (d.cards ? `<br>${d.cards} ${d.cards === 1 ? "tarjeta" : "tarjetas"} de repaso` : "") +
          (d.cardsError ? `<br>Tarjetas: ${esc(d.cardsError)}` : ""),
      );
    };
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "open-panel") openPanel({ page: msg.page, auto: msg.auto });
  });

  /* ───────────── Marcar lo ya guardado ───────────── */

  const supported = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
  const marks = supported ? new Highlight() : null;
  if (supported) CSS.highlights.set("nober", marks);

  function paint(ranges) {
    if (supported) for (const r of ranges) marks.add(r);
  }

  /** Busca el texto en la página sin tener en cuenta espacios ni saltos de línea (la selección los cambia). */
  function findRanges(texts) {
    const nodes = [];
    let hay = "";
    const map = []; // por carácter de `hay`: índice del nodo y posición dentro
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest("script, style, noscript, textarea, #nober-ext-host") ? 1 : 2),
    });
    while (walker.nextNode()) {
      const n = walker.currentNode;
      nodes.push(n);
      const d = n.data;
      for (let i = 0; i < d.length; i++) {
        if (/\s/.test(d[i])) continue;
        hay += d[i];
        map.push(nodes.length - 1, i);
      }
      if (hay.length > 3_000_000) break;
    }
    const out = [];
    for (const t of texts) {
      const needle = t.replace(/\s+/g, "");
      if (!needle) continue;
      const at = hay.indexOf(needle);
      if (at < 0) continue;
      const end = at + needle.length - 1;
      const r = document.createRange();
      r.setStart(nodes[map[at * 2]], map[at * 2 + 1]);
      r.setEnd(nodes[map[end * 2]], map[end * 2 + 1] + 1);
      out.push({ text: t, range: r });
    }
    return out;
  }

  let pending = [];
  async function loadMarks() {
    if (!supported) return;
    marks.clear();
    const r = await send({ type: "list", url: location.href });
    pending = r.ok ? r.data.highlights.map((h) => h.text) : [];
    retry(0);
  }
  // Páginas que cargan el contenido después (Coursera, blogs con JS): se reintenta unas veces
  function retry(n) {
    if (!pending.length) return;
    const found = findRanges(pending);
    paint(found.map((f) => f.range));
    pending = pending.filter((t) => !found.some((f) => f.text === t));
    if (pending.length && n < 4) setTimeout(() => retry(n + 1), 1500 * (n + 1));
  }

  loadMarks();
  // Navegación sin recargar (aplicaciones de una sola página)
  let href = location.href;
  setInterval(() => {
    if (location.href === href) return;
    href = location.href;
    hideBubble();
    hidePanel();
    setTimeout(loadMarks, 1200);
  }, 1000);
})();
