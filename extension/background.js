// Nober · service worker: habla con el servidor de Nober (con la clave personal) y guarda la configuración.

const HOUR = 3600_000;

const norm = (raw) => {
  try {
    const u = new URL(raw);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
};

async function api(path, { method = "GET", body } = {}) {
  const { server, token } = await chrome.storage.local.get(["server", "token"]);
  if (!server || !token) throw new Error("Conecta la extensión con Nober: clic en el ícono → Opciones.");
  let res;
  try {
    res = await fetch(server + path, {
      method,
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No se pudo conectar con Nober (" + new URL(server).host + ").");
  }
  const j = await res.json().catch(() => null);
  if (!j || !j.ok) throw new Error((j && j.error) || "Nober respondió " + res.status + ".");
  return j.data;
}

async function me(force) {
  const { meCache } = await chrome.storage.session.get("meCache");
  if (!force && meCache && Date.now() - meCache.at < 5 * 60_000) return meCache.data;
  const data = await api("/api/ext/me");
  await chrome.storage.session.set({ meCache: { at: Date.now(), data } });
  return data;
}

async function handle(msg) {
  switch (msg.type) {
    case "me":
      return { ...(await me(msg.force)), ...(await chrome.storage.local.get(["lastTarget", "server"])) };
    case "api": {
      // Solo las rutas de la extensión
      if (!/^\/api\/ext\/[a-z]+(\?|$)/.test(msg.path)) throw new Error("Ruta no permitida.");
      const data = await api(msg.path, { method: msg.method || "GET", body: msg.body });
      const marks = msg.path === "/api/ext/clips" || (msg.path === "/api/ext/integrate" && msg.body?.step === "apply" && msg.body?.kind === "selection");
      const target = msg.body?.dest?.target || msg.body?.target;
      if (marks || target) {
        const { urls = {} } = await chrome.storage.local.get("urls");
        if (marks) urls[norm(msg.body.url)] = Date.now();
        const keep = Object.entries(urls).sort((a, b) => b[1] - a[1]).slice(0, 2000);
        await chrome.storage.local.set({ urls: Object.fromEntries(keep), ...(target ? { lastTarget: target } : {}) });
      }
      return data;
    }
    case "list": {
      const { urls = {}, token } = await chrome.storage.local.get(["urls", "token"]);
      if (!token || !urls[norm(msg.url)]) return { highlights: [] };
      return api("/api/ext/highlights?url=" + encodeURIComponent(norm(msg.url)));
    }
    case "shouldSync": {
      const { token, lastSync } = await chrome.storage.local.get(["token", "lastSync"]);
      return Boolean(token) && (!lastSync || Date.now() - lastSync.at > 4 * HOUR);
    }
    case "sync": {
      try {
        const data = await api("/api/coursera/sync", { method: "POST", body: msg.payload });
        await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: true, data } });
        return data;
      } catch (e) {
        await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, error: e.message } });
        throw e;
      }
    }
    default:
      throw new Error("Mensaje desconocido.");
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  handle(msg).then(
    (data) => send({ ok: true, data }),
    (e) => send({ ok: false, error: e.message || String(e) }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(async (d) => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: "nober-save", title: "Nober: agregar a mis apuntes", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "nober-page", title: "Nober: extraer apuntes de esta página", contexts: ["page"] });
  if (d.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "nober-save") chrome.tabs.sendMessage(tab.id, { type: "open-panel" }).catch(() => {});
  if (info.menuItemId === "nober-page") chrome.tabs.sendMessage(tab.id, { type: "open-panel", page: true }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === "save-selection" && tab?.id) chrome.tabs.sendMessage(tab.id, { type: "open-panel", auto: true }).catch(() => {});
});
