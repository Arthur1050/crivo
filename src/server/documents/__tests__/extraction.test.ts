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
  const central: number[] = [];
  for (let index = 0; index < entries; index += 1) {
    const localOffset = chunks.length;
    const header = new Uint8Array(30);
    new DataView(header.buffer).setUint32(0, 0x04034b50, true);
    new DataView(header.buffer).setUint32(18, 1, true);
    new DataView(header.buffer).setUint32(22, size, true);
    new DataView(header.buffer).setUint16(26, 1, true);
    chunks.push(...header, 97, 0);
    const directory = new Uint8Array(46);
    const view = new DataView(directory.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(20, 1, true);
    view.setUint32(24, size, true);
    view.setUint16(28, 1, true);
    view.setUint32(42, localOffset, true);
    central.push(...directory, 97);
  }
  const directoryOffset = chunks.length;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries, true);
  eocdView.setUint16(10, entries, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, directoryOffset, true);
  return new Uint8Array([...chunks, ...central, ...eocd]);
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
  it("uses central-directory sizes when a DOCX local header uses a data descriptor", async () => {
    const bytes = zip(1, MAX_DOCX_UNCOMPRESSED_BYTES + 1);
    const view = new DataView(bytes.buffer);
    view.setUint16(6, 0x0008, true);
    view.setUint32(18, 0, true);
    view.setUint32(22, 0, true);
    await expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes })).resolves.toEqual({ ok: false, code: "limite_estrutural" });
  });
  it("extracts DOCX raw text after ZIP validation", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(1) }, { docx: { extract: async () => ({ value: "Documento Word" }) } })).resolves.toMatchObject({ ok: true, text: "Documento Word" }));
  it("rejects DOCX empty raw text", async () => expect(extractDocument({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: zip(1) }, { docx: { extract: async () => ({ value: " " }) } })).resolves.toEqual({ ok: false, code: "nenhum_texto_extraivel" }));
  it("rejects output above 20 MiB", async () => expect(plain("a".repeat(MAX_EXTRACTED_TEXT_BYTES + 1))).resolves.toEqual({ ok: false, code: "limite_estrutural" }));
  it("accepts output at 20 MiB", async () => expect(plain("a".repeat(MAX_EXTRACTED_TEXT_BYTES))).resolves.toMatchObject({ ok: true, extractedBytes: MAX_EXTRACTED_TEXT_BYTES }));
  it("rejects an unsupported MIME type", async () => expect(extractDocument({ mimeType: "application/octet-stream", bytes: encoder.encode("x") })).resolves.toEqual({ ok: false, code: "extracao_invalida" }));
});
