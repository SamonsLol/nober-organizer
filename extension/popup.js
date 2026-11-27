const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

async function init() {
  const { server, token, lastSync } = await chrome.storage.local.get(["server", "token", "lastSync"]);
  $("opts").onclick = () => chrome.runtime.openOptionsPage();
  if (!server || !token) {
    $("status").innerHTML = '<span class="err">Sin conectar.</span> Abre Opciones y pega el código de Nober.';
    $("open").style.display = "none";
    $("syncBtn").disabled = true;
    $("page").disabled = true;
    return;
  }
  $("open").href = server;
  chrome.runtime.sendMessage({ type: "me" }, (r) => {
    $("status").innerHTML = r?.ok
      ? `<span class="ok">Conectada</span> a ${new URL(server).host}${r.data.name ? ` como ${esc(r.data.name)}` : ""}.${r.data.vault ? "" : " (sin bóveda de Obsidian: solo se guarda en Nober)"}`
      : `<span class="err">${esc(r?.error ?? "Sin respuesta.")}</span>`;
  });
  $("sync").textContent = lastSync
    ? `Última sincronización ${ago(lastSync.at)}${lastSync.ok ? "" : ` (falló: ${esc(lastSync.error)})`}.`
    : "Se sincroniza sola al abrir un curso (cada 4 h como mucho).";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("page").onclick = () => {
    chrome.tabs.sendMessage(tab.id, { type: "open-panel", page: true }, () => {
      if (chrome.runtime.lastError) return ($("status").innerHTML = '<span class="err">Esta página no admite la extensión (o recárgala).</span>');
      window.close();
    });
  };
  const onCoursera = tab?.url && /^https:\/\/www\.coursera\.org\//.test(tab.url);
  if (!onCoursera) $("syncBtn").textContent = "Abrir Coursera";
  $("syncBtn").onclick = async () => {
    if (!onCoursera) return chrome.tabs.create({ url: "https://www.coursera.org/" });
    $("syncBtn").disabled = true;
    $("syncBtn").textContent = "Sincronizando…";
    chrome.tabs.sendMessage(tab.id, { type: "sync-now" }, (r) => {
      $("syncBtn").disabled = false;
      $("syncBtn").textContent = "Sincronizar ahora";
      if (chrome.runtime.lastError) return ($("sync").innerHTML = '<span class="err">Recarga la página de Coursera e inténtalo otra vez.</span>');
      $("sync").innerHTML = r?.ok ? '<span class="ok">Sincronizado ✓</span>' : `<span class="err">${esc(r?.error ?? "Error")}</span>`;
    });
  };
}
init();
