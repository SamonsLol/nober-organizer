"use client";

import { useSyncExternalStore } from "react";

/** Tema claro/oscuro: vive en `data-theme` del <html> y en localStorage ("aos-theme"). */
export type Theme = "dark" | "light";

const EVT = "aos:theme";

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("aos-theme", t);
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};

/** Tema actual, sincronizado entre todos los componentes que lo usan. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}
