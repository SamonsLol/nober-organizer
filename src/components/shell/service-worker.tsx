"use client";

import { useEffect } from "react";

/** Registra el service worker de la PWA (solo en producción: en desarrollo estorba la recarga en caliente). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
