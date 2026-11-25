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

export interface VaultAttachment {
  /** Ruta en la bóveda. */
  path: string;
  /** Lo que va dentro de `![[…]]`. */
  target: string;
  image: boolean;
}

/** Sube un adjunto a la bóveda de Obsidian, a la carpeta de adjuntos de la nota `note`. */
export async function uploadToVault(file: File, note: string): Promise<{ ok: true; data: VaultAttachment } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("file", file);
  body.append("note", note);
  try {
    const res = await fetch("/api/vault/attachments", { method: "POST", body });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `No se pudo adjuntar «${file.name}».` };
    return { ok: true, data: json.data as VaultAttachment };
  } catch {
    return { ok: false, error: "Sin conexión: no se pudo adjuntar el archivo." };
  }
}
