import { describe, expect, it } from "vitest";
import {
  extractDocument,
  MAX_DOCX_ENTRIES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  MAX_EXTRACTED_TEXT_BYTES,
  MAX_PDF_IMAGE_PIXELS,
  MAX_PDF_PAGES,
} from "../extraction";

const encoder = new TextEncoder();
const plain = (text: string, mimeType = "text/plain") => extractDocument({ mimeType, bytes: encoder.encode(text) });
const pdf = (pages = 1, text = "PDF válido", images: Array<{ width: number; height: number }> = []) => ({
  pdf: { open: async () => ({ numPages: pages }), text: async () => ({ totalPages: pages, text }), images: async () => images },
});

function zip(entries: number, size = 1) {
  const chunks: number[] = [];
  for (let index = 0; index < entries; index += 1) {
    const header = new Uint8Array(30);
    new DataView(header.buffer).setUint32(0, 0x04034b50, true);
    new DataView(header.buffer).setUint32(18, 1, true);
    new DataView(header.buffer).setUint32(22, size, true);
    new DataView(header.buffer).setUint16(26, 1, true);
    chunks.push(...header, 97, 0);
  }
  return new Uint8Array(chunks);
}

describe("native document extraction (lote-12 T11)", () => {
  it.each([["text/plain"], ["text/markdown"], ["text/csv"]] as const)("extracts normalized %s", async (mimeType) => {
    await expect(plain(" \uFEFFregra\r\nvalor ", mimeType)).resolves.toMatchObject({ ok: true, text: "regra\nvalor" });
  });
  it("rejects empty native text", async () => expect(plain(" \t ")).resolves.toEqual({ ok: false, code: "nenhum_texto_extraivel" }));
  it("extracts native PDF text", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf())).resolves.toMatchObject({ ok: true, text: "PDF válido" }));
  it("rejects image-only PDF", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf(1, " "))).resolves.toEqual({ ok: false, code: "nenhum_texto_extraivel" }));
  it("rejects PDF at page limit plus one", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf(MAX_PDF_PAGES + 1))).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("accepts PDF at page limit", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf(MAX_PDF_PAGES))).resolves.toMatchObject({ ok: true }));
  it("rejects image above 16 MP", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf(1, "x", [{ width: MAX_PDF_IMAGE_PIXELS + 1, height: 1 }]))).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("accepts image at 16 MP", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, pdf(1, "x", [{ width: MAX_PDF_IMAGE_PIXELS, height: 1 }]))).resolves.toMatchObject({ ok: true }));
  it("classifies extractor timeout as transient", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, { pdf: { ...pdf().pdf, open: async () => new Promise(() => undefined) }, timeoutMs: 0 })).resolves.toEqual({ ok: false, code: "extracao_transitoria" }));
  it("classifies malformed PDF as permanent", async () => expect(extractDocument({ mimeType: "application/pdf", bytes: new Uint8Array() }, { pdf: { ...pdf().pdf, open: async () => { throw new Error("bad"); } } })).resolves.toEqual({ ok: false, code: "extracao_invalida" }));
  it("rejects DOCX without local ZIP entries", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: new Uint8Array([1]) })).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("rejects DOCX entry count above limit", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(MAX_DOCX_ENTRIES + 1) })).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("rejects DOCX uncompressed bytes above limit", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(1, MAX_DOCX_UNCOMPRESSED_BYTES + 1) })).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("extracts DOCX raw text after ZIP validation", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(1) }, { docx: { extract: async () => ({ value: "Documento Word" }) } })).resolves.toMatchObject({ ok: true, text: "Documento Word" }));
  it("rejects DOCX empty raw text", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(1) }, { docx: { extract: async () => ({ value: " " }) } })).resolves.toEqual({ ok: false, code: "nenhum_texto_extraivel" }));
  it("rejects output above 20 MiB", async () => expect(plain("a".repeat(MAX_EXTRACTED_TEXT_BYTES + 1))).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("accepts output at 20 MiB", async () => expect(plain("a".repeat(MAX_EXTRACTED_TEXT_BYTES))).resolves.toMatchObject({ ok: true, extractedBytes: MAX_EXTRACTED_TEXT_BYTES }));
  it("rejects an unsupported MIME type", async () => expect(extractDocument({ mimeType: "application/octet-stream", bytes: encoder.encode("x") })).resolves.toEqual({ ok: false, code: "extracao_invalida" }));
});
