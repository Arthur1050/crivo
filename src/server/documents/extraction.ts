import { Buffer } from "node:buffer";
import mammoth from "mammoth";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import { decodeDocumentText, normalizeDocumentText } from "./text";

export const MAX_EXTRACTED_TEXT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 500;
export const MAX_PDF_IMAGE_PIXELS = 16 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 2_000;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const EXTRACTION_TIMEOUT_MS = 45_000;

export type ExtractionResult =
  | { ok: true; text: string; extractedBytes: number }
  | { ok: false; code: "nenhum_texto_extraivel" | "limite_estrutural" | "extracao_transitoria" | "extracao_invalida" };

export interface ExtractDocumentInput {
  mimeType: string;
  bytes: Uint8Array;
}

type PdfDocument = { numPages: number; destroy?: () => Promise<void> | void };
type PdfDependencies = {
  open: (bytes: Uint8Array) => Promise<PdfDocument>;
  text: (document: PdfDocument) => Promise<{ totalPages: number; text: string }>;
  images: (document: PdfDocument, page: number) => Promise<Array<{ width: number; height: number }>>;
};
type DocxDependencies = { extract: (buffer: Buffer) => Promise<{ value: string }> };

export interface ExtractionDependencies {
  pdf?: PdfDependencies;
  docx?: DocxDependencies;
  timeoutMs?: number;
}

const defaultPdf: PdfDependencies = {
  open: async (bytes) => getDocumentProxy(bytes),
  text: async (document) => extractText(document as Awaited<ReturnType<typeof getDocumentProxy>>, { mergePages: true }),
  images: async (document, page) => extractImages(document as Awaited<ReturnType<typeof getDocumentProxy>>, page),
};

const defaultDocx: DocxDependencies = { extract: (buffer) => mammoth.extractRawText({ buffer }) };

function zipLimits(bytes: Uint8Array) {
  let offset = 0;
  let entries = 0;
  let uncompressed = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    entries += 1;
    uncompressed += view.getUint32(offset + 22, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    offset += 30 + nameLength + extraLength + compressed;
    if (entries > MAX_DOCX_ENTRIES || uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) return false;
  }
  return entries > 0 && offset <= bytes.byteLength;
}

function resultFromText(value: string): ExtractionResult {
  const normalized = normalizeDocumentText(value);
  const decoded = decodeDocumentText(new TextEncoder().encode(normalized));
  if (!decoded.ok) return { ok: false, code: "nenhum_texto_extraivel" };
  const extractedBytes = Buffer.byteLength(decoded.text, "utf8");
  if (extractedBytes > MAX_EXTRACTED_TEXT_BYTES) return { ok: false, code: "limite_estrutural" };
  return { ok: true, text: decoded.text, extractedBytes };
}

function failureFor(error: unknown): Extract<ExtractionResult, { ok: false }> {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN"
    ? { ok: false, code: "extracao_transitoria" }
    : { ok: false, code: "extracao_invalida" };
}

async function within<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Extracts native text only. It never renders, executes, or OCRs document content. */
export async function extractDocument(
  input: ExtractDocumentInput,
  dependencies: ExtractionDependencies = {}
): Promise<ExtractionResult> {
  const timeoutMs = dependencies.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  try {
    if (["text/plain", "text/markdown", "text/csv"].includes(input.mimeType)) {
      const decoded = decodeDocumentText(input.bytes);
      return decoded.ok
        ? resultFromText(decoded.text)
        : { ok: false, code: "nenhum_texto_extraivel" };
    }
    if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      if (!zipLimits(input.bytes)) return { ok: false, code: "limite_estrutural" };
      const raw = await within((dependencies.docx ?? defaultDocx).extract(Buffer.from(input.bytes)), timeoutMs);
      return resultFromText(raw.value);
    }
    if (input.mimeType !== "application/pdf") return { ok: false, code: "extracao_invalida" };

    const pdf = await within((dependencies.pdf ?? defaultPdf).open(input.bytes), timeoutMs);
    try {
      if (pdf.numPages > MAX_PDF_PAGES) return { ok: false, code: "limite_estrutural" };
      const reader = dependencies.pdf ?? defaultPdf;
      for (let page = 1; page <= pdf.numPages; page += 1) {
        const images = await within(reader.images(pdf, page), timeoutMs);
        if (images.some((image) => image.width * image.height > MAX_PDF_IMAGE_PIXELS)) {
          return { ok: false, code: "limite_estrutural" };
        }
      }
      return resultFromText((await within(reader.text(pdf), timeoutMs)).text);
    } finally {
      await pdf.destroy?.();
    }
  } catch (error) {
    return failureFor(error);
  }
}
