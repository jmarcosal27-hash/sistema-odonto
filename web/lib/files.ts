"use client";

import { FILE_MIMES, type PatientFile } from "./types";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // igual ao limite do bucket
export const MAX_DEMO_FILE_BYTES = 1024 * 1024; // demonstração: tudo cabe no localStorage (~5 MB)
export const EXT: Record<PatientFile["mime"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };

export function checkFile(f: File, maxBytes: number): PatientFile["mime"] {
  const mime = FILE_MIMES.find((m) => m === f.type);
  if (!mime) throw new Error("Tipo de arquivo não aceito. Envie PNG, JPG, WebP ou PDF.");
  if (f.size < 1) throw new Error("O arquivo está vazio.");
  if (f.size > maxBytes) throw new Error(`Arquivo grande demais (limite ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  return mime;
}

export const readAsDataUrl = (f: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => fail(new Error("Não foi possível ler o arquivo."));
  r.readAsDataURL(f);
});

export const fileSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Reduz o logo para no máximo 320 px de lado e devolve PNG como data URL (cabe no limite do banco). */
export async function logoFromFile(f: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (f.size > 5 * 1024 * 1024) throw new Error("Imagem grande demais (limite 5 MB).");
  const bmp = await createImageBitmap(f).catch(() => { throw new Error("Não foi possível abrir a imagem."); });
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL("image/png");
  if (url.length > 290000) throw new Error("A imagem ficou pesada demais; use um logo mais simples.");
  return url;
}
