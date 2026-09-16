const BINARY_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const VISIBLE_CHARACTER = /[^\s\p{Cc}\p{Cf}]/u;

export type DecodedDocumentText =
  | { ok: true; text: string; encoding: "utf-8" | "windows-1252" }
  | { ok: false; code: "binary_content" | "no_extractable_text" };

/**
 * Preserves document content while making the three text formats deterministic:
 * BOM removal, newline normalization and external whitespace only.
 */
export function normalizeDocumentText(value: string) {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
}

function containsBinaryControls(bytes: Uint8Array) {
  return bytes.some(
    (byte) =>
      byte === 0 ||
      (byte >= 1 && byte <= 8) ||
      byte === 11 ||
      byte === 12 ||
      (byte >= 14 && byte <= 31)
  );
}

/** Decodes UTF-8 strictly, with the format's explicit Windows-1252 fallback. */
export function decodeDocumentText(bytes: Uint8Array): DecodedDocumentText {
  if (containsBinaryControls(bytes)) return { ok: false, code: "binary_content" };

  let text: string;
  let encoding: "utf-8" | "windows-1252" = "utf-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    encoding = "windows-1252";
    text = new TextDecoder("windows-1252", { fatal: true }).decode(bytes);
  }

  const normalized = normalizeDocumentText(text);
  if (BINARY_CONTROL.test(normalized)) return { ok: false, code: "binary_content" };
  if (!VISIBLE_CHARACTER.test(normalized)) {
    return { ok: false, code: "no_extractable_text" };
  }
  return { ok: true, text: normalized, encoding };
}
