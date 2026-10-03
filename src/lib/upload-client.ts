import type { ResourceKind } from "@/lib/types";

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  kind: ResourceKind;
  size: string;
  url: string;
}

/** Sube un archivo a POST /api/files. Los errores llegan como texto listo para mostrar. */
export async function uploadFile(file: File): Promise<{ ok: true; data: UploadedFile } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/files", { method: "POST", body });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `No se pudo subir «${file.name}».` };
    return { ok: true, data: json.data as UploadedFile };
  } catch {
    return { ok: false, error: "Sin conexión: no se pudo subir el archivo." };
  }
}
