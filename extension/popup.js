// Nober · ventana de la extensión: apunte rápido (escribes una idea y la IA la desarrolla en tu apunte), extraer de la
// página y sincronizar Coursera. El borrador del apunte se guarda mientras escribes (la ventana se cierra al perder el foco).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || "Sin respuesta." })));
const api = (path, method, body) => send({ type: "api", path, method, body });
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};
const show = (id) => {
  for (const v of ["home", "destView", "prevView", "doneView"]) $(v).classList.toggle("hidden", v !== id);
};

let me = null;
let tab = null;
let ctx = null; // contexto de Coursera de la pestaña
let req = null; // última petición de integración
let proposal = null;

const tabUrl = () => (tab?.url && /^https?:/.test(tab.url) ? tab.url : "");
const tabTitle = () => (tabUrl() ? tab.title || "" : "");

async function init() {
  const { server, token, lastSync } = await chrome.storage.local.get(["server", "token", "lastSync"]);
  const { draft } = await chrome.storage.session.get("draft").catch(() => ({}));
  if (draft) $("note").value = draft;
  $("note").oninput = () => chrome.storage.session.set({ draft: $("note").value });
  $("opts").onclick = () => chrome.runtime.openOptionsPage();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!server || !token) {
    $("status").innerHTML = '<span class="err">Sin conectar.</span> Abre Opciones y pega el código de Nober.';
    $("open").style.display = "none";
    for (const b of ["syncBtn", "page", "noteGo", "noteInbox"]) $(b).disabled = true;
    return;
  }
  $("open").href = server;
  const r = await send({ type: "me" });
  if (r.ok) {
    me = r.data;
    $("status").innerHTML = `<span class="ok">Conectada</span> a ${esc(new URL(server).host)}${me.name ? ` como ${esc(me.name)}` : ""}.`;
    if (!me.ai || !me.vault) {
      $("noteGo").disabled = true;
      $("noteErr").textContent = me.vault ? "La IA no está configurada en tu Nober: usa la bandeja." : "Tu cuenta no tiene bóveda de Obsidian: usa la bandeja.";
    }
  } else $("status").innerHTML = `<span class="err">${esc(r.error)}</span>`;

  $("sync").textContent = lastSync
    ? `Última sincronización ${ago(lastSync.at)}${lastSync.ok ? "" : ` (falló: ${lastSync.error})`}.`
    : "Se sincroniza sola al abrir un curso (cada 4 h como mucho).";
  const onCoursera = /^https:\/\/www\.coursera\.org\//.test(tab?.url || "");
  if (!onCoursera) $("syncBtn").textContent = "Abrir Coursera";
  $("syncBtn").onclick = () => {
    if (!onCoursera) return chrome.tabs.create({ url: "https://www.coursera.org/" });
    $("syncBtn").disabled = true;
    $("syncBtn").textContent = "Sincronizando…";
    chrome.tabs.sendMessage(tab.id, { type: "sync-now" }, (res) => {
      $("syncBtn").disabled = false;
      $("syncBtn").textContent = "Sincronizar ahora";
      if (chrome.runtime.lastError) return ($("sync").innerHTML = '<span class="err">Recarga la página de Coursera e inténtalo otra vez.</span>');
      $("sync").innerHTML = res?.ok ? '<span class="ok">Sincronizado ✓</span>' : `<span class="err">${esc(res?.error ?? "Error")}</span>`;
    });
  };
  $("page").onclick = () =>
    chrome.tabs.sendMessage(tab.id, { type: "open-panel", page: true }, () => {
      if (chrome.runtime.lastError) return ($("status").innerHTML = '<span class="err">En esta página no se puede (o recárgala). Usa el apunte rápido.</span>');
      window.close();
    });

  $("noteInbox").onclick = toInbox;
  $("noteGo").onclick = openDest;
  $("destBack").onclick = () => show("home");
  $("destGo").onclick = preview;
  $("prevBack").onclick = () => show("destView");
  $("apply").onclick = apply;
  $("again").onclick = () => show("home");
}

const noteText = () => $("note").value.trim();

async function toInbox() {
  if (noteText().length < 2) return ($("noteErr").textContent = "Escribe tu apunte.");
  $("noteInbox").disabled = true;
  const r = await api("/api/ext/clips", "POST", { kind: "note", text: noteText(), url: tabUrl(), title: tabTitle(), target: me?.lastTarget });
  $("noteInbox").disabled = false;
  if (!r.ok) return ($("noteErr").textContent = r.error);
  done(`Guardado en la bandeja${r.data.where !== "la bandeja" ? ` (<b>${esc(r.data.where)}</b>)` : ""}. Agrégalo cuando quieras desde el editor de apuntes.`);
}

/* ───────────── Destino ───────────── */

async function openDest() {
  if (noteText().length < 3) return ($("noteErr").textContent = "Escribe tu apunte.");
  $("noteErr").textContent = "";
  $("destErr").textContent = "";
  $("cardsWrap").style.display = me?.ai ? "flex" : "none";
  show("destView");
  const wrap = $("destWrap");
  wrap.innerHTML = '<p class="muted">Cargando…</p>';
  const c = tabUrl() ? await api("/api/ext/context", "POST", { url: tabUrl() }) : { ok: true, data: { coursera: null } };
  ctx = c.ok ? c.data.coursera : null;
  renderDest();
}

function renderDest() {
  const wrap = $("destWrap");
  if (ctx?.notePath) {
    wrap.innerHTML = `<div class="dest">${esc(ctx.where)}${ctx.lesson ? ` · ${esc(ctx.lesson)}` : ""}<br><span class="muted">El apunte del módulo que estás viendo.</span></div>
      <button id="other" style="margin-top:6px;height:26px;font-size:11.5px">Elegir otro apunte</button>`;
    $("other").onclick = () => {
      ctx = { ...ctx, notePath: null };
      renderDest();
    };
    return;
  }
  if (!me.targets.length) {
    wrap.innerHTML = '<div class="dest">Crea primero un proyecto o una materia en Nober.</div>';
    $("destGo").disabled = true;
    return;
  }
  wrap.innerHTML =
    `<select id="target">${me.targets.map((t) => `<option value="${t.kind}:${esc(t.id)}">${t.kind === "course" ? "Materia" : "Proyecto"} · ${esc(t.name)}</option>`).join("")}</select>` +
    `<select id="noteSel"><option>Cargando notas…</option></select>`;
  const pre = ctx?.projectId ? { kind: "project", id: ctx.projectId } : me.lastTarget;
  if (pre && me.targets.some((t) => t.kind === pre.kind && t.id === pre.id)) $("target").value = `${pre.kind}:${pre.id}`;
  $("target").onchange = loadNotes;
  loadNotes();
}

const targetOf = () => {
  const v = $("target")?.value;
  return v ? { kind: v.split(":")[0], id: v.slice(v.indexOf(":") + 1) } : undefined;
};

async function loadNotes() {
  const t = targetOf();
  if (!t) return;
  const sel = $("noteSel");
  sel.innerHTML = "<option>Cargando notas…</option>";
  const r = await api(`/api/ext/notes?kind=${t.kind}&id=${encodeURIComponent(t.id)}`);
  const notes = r.ok ? r.data.notes : [];
  const name = tabTitle().replace(/\s*[|·-]\s*Coursera\s*$/i, "").trim().slice(0, 50) || "Ideas";
  sel.innerHTML = `<option value="__new">+ Nota nueva: «${esc(name)}»</option>` + notes.map((n) => `<option value="${esc(n.path)}">${esc(n.title)}</option>`).join("");
  if (notes.length) sel.value = notes[0].path;
  if (!r.ok) $("destErr").textContent = r.error;
}

function destOf() {
  if (ctx?.notePath && !$("target")) return { auto: true };
  const t = targetOf();
  if (!t) return null;
  const n = $("noteSel")?.value;
  return !n || n === "__new" ? { target: t, newNote: true } : { notePath: n };
}

/* ───────────── Propuesta y aplicar ───────────── */

async function preview() {
  const dest = destOf();
  if (!dest) return ($("destErr").textContent = "Elige el apunte.");
  const b = $("destGo");
  b.disabled = true;
  b.textContent = "Pensando…";
  $("destErr").textContent = "";
  req = { kind: "note", text: noteText(), instruction: $("instr").value.trim() || undefined, url: tabUrl(), title: tabTitle(), dest, cards: $("cards").checked };
  const r = await api("/api/ext/integrate", "POST", { ...req, step: "preview" });
  b.disabled = false;
  b.textContent = "Ver propuesta";
  if (!r.ok) return ($("destErr").textContent = r.error);
  proposal = r.data;
  $("prevTitle").textContent = `Propuesta para ${proposal.where}`;
  $("prevSummary").textContent = proposal.summary;
  $("prevErr").textContent = "";
  const box = $("edits");
  box.innerHTML = "";
  proposal.edits.forEach((e, i) => {
    const d = document.createElement("div");
    d.className = "edit";
    d.innerHTML = `<div class="edit-h"><input type="checkbox" checked data-i="${i}"> <span></span>${e.isNew ? ' <span class="tag">nueva</span>' : ""}</div><textarea data-i="${i}"></textarea>`;
    d.querySelector("span").textContent = e.heading.replace(/^#+\s*/, "");
    d.querySelector("textarea").value = e.markdown;
    box.appendChild(d);
  });
  $("apply").classList.toggle("hidden", !proposal.edits.length);
  show("prevView");
}

async function apply() {
  const edits = proposal.edits
    .map((e, i) => ({ ...e, markdown: document.querySelector(`textarea[data-i="${i}"]`).value, on: document.querySelector(`input[data-i="${i}"]`).checked }))
    .filter((e) => e.on && e.markdown.trim())
    .map(({ on, ...e }) => e);
  if (!edits.length) return ($("prevErr").textContent = "Marca al menos una sección.");
  const b = $("apply");
  b.disabled = true;
  b.textContent = "Agregando…";
  const r = await api("/api/ext/integrate", "POST", { ...req, step: "apply", edits });
  b.disabled = false;
  b.textContent = "Agregar al apunte";
  if (!r.ok) return ($("prevErr").textContent = r.error);
  const d = r.data;
  done(
    `<span class="ok">Listo ✓</span> Agregado a <b>${esc(d.where)}</b> (${d.sections} ${d.sections === 1 ? "sección" : "secciones"}).` +
      (d.cards ? `<br>${d.cards} ${d.cards === 1 ? "tarjeta" : "tarjetas"} de repaso.` : "") +
      (d.cardsError ? `<br>Tarjetas: ${esc(d.cardsError)}` : ""),
  );
}

function done(html) {
  $("note").value = "";
  $("instr").value = "";
  chrome.storage.session.remove("draft");
  $("doneMsg").innerHTML = html;
  show("doneView");
}

init();
