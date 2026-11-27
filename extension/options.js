const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const say = (html) => ($("msg").innerHTML = html);

chrome.storage.local.get(["server"]).then(({ server }) => {
  if (server) say(`Conectada a <b>${new URL(server).host}</b>.`);
});

$("connect").onclick = () => {
  const raw = $("code").value.trim();
  const m = raw.match(/^(https?:\/\/[^\s|]+?)\/?\s*\|\s*(nbr_[\w-]{20,80})$/);
  if (!m) return say('<span class="err">Ese código no es válido. Cópialo otra vez desde Ajustes de Nober.</span>');
  let origin;
  try {
    origin = new URL(m[1]).origin;
  } catch {
    return say('<span class="err">La dirección del código no es válida.</span>');
  }
  // El permiso se pide dentro del clic (Chrome lo exige)
  chrome.permissions.request({ origins: [origin + "/*"] }, async (granted) => {
    if (!granted) return say('<span class="err">Sin ese permiso la extensión no puede hablar con tu Nober.</span>');
    await chrome.storage.local.set({ server: origin, token: m[2] });
    await chrome.storage.session.remove("meCache");
    say("Comprobando…");
    chrome.runtime.sendMessage({ type: "me", force: true }, (r) => {
      if (!r?.ok) return say(`<span class="err">${esc(r?.error ?? "Sin respuesta.")}</span>`);
      $("code").value = "";
      say(`<span class="ok">Listo ✓</span> Conectada a <b>${new URL(origin).host}</b>${r.data.name ? ` como ${esc(r.data.name)}` : ""}. Ya puedes subrayar en cualquier página.`);
    });
  });
};

$("disconnect").onclick = async () => {
  const { server } = await chrome.storage.local.get("server");
  await chrome.storage.local.remove(["server", "token", "lastTarget", "lastSync"]);
  await chrome.storage.session.remove("meCache");
  if (server) chrome.permissions.remove({ origins: [server + "/*"] });
  say("Desconectada.");
};
