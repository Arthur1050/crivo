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
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || eocd + 22 > bytes.byteLength) return false;
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (!entries || entries > MAX_DOCX_ENTRIES || offset + directorySize > eocd) return false;
  let uncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) return false;
    uncompressed += view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
    if (uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) return false;
  }
  return offset === view.getUint32(eocd + 16, true) + directorySize;
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
