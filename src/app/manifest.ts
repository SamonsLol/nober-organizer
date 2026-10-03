import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

/** Manifiesto de la PWA: instalable en móvil y escritorio. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Nober",
    description: "Tu organizador académico: materias, tareas, calendario, notas y apuntes.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0f0e15",
    theme_color: "#0f0e15",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nueva tarea", url: "/tasks?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calendario", url: "/calendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Calificaciones", url: "/grades", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
