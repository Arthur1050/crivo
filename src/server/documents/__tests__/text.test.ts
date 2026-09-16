import { describe, expect, it } from "vitest";
import { decodeDocumentText, normalizeDocumentText } from "../text";

const encoder = new TextEncoder();

describe("document text decoding (lote-12 T10)", () => {
  it("decodes UTF-8 strictly", () => {
    expect(decodeDocumentText(encoder.encode("política 123, ok!"))).toEqual({
      ok: true, text: "política 123, ok!", encoding: "utf-8",
    });
  });

  it("removes an UTF-8 BOM", () => {
    expect(decodeDocumentText(new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode("texto")]))).toMatchObject({
      ok: true, text: "texto",
    });
  });

  it("falls back to Windows-1252 after invalid UTF-8", () => {
    expect(decodeDocumentText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toEqual({
      ok: true, text: "café", encoding: "windows-1252",
    });
  });

  it("preserves CSV delimiters and internal line breaks", () => {
    expect(decodeDocumentText(encoder.encode("nome;valor\nAna;10\n"))).toMatchObject({
      ok: true, text: "nome;valor\nAna;10",
    });
  });

  it("preserves Markdown syntax", () => {
    expect(decodeDocumentText(encoder.encode("# título\n\n- regra **forte**"))).toMatchObject({
      ok: true, text: "# título\n\n- regra **forte**",
    });
  });

  it("converts CRLF to LF", () => {
    expect(normalizeDocumentText("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("converts standalone CR to LF", () => {
    expect(normalizeDocumentText("a\rb")).toBe("a\nb");
  });

  it("trims external whitespace only", () => {
    expect(normalizeDocumentText(" \n  a  b  \n ")).toBe("a  b");
  });

  it("does not rewrite internal punctuation, numbers or spaces", () => {
    expect(normalizeDocumentText("A, 1.000,00!  mantém?")).toBe("A, 1.000,00!  mantém?");
  });

  it("rejects a NUL binary payload", () => {
    expect(decodeDocumentText(new Uint8Array([0x61, 0x00, 0x62]))).toEqual({ ok: false, code: "binary_content" });
  });

  it("rejects incompatible C0 controls", () => {
    expect(decodeDocumentText(new Uint8Array([0x61, 0x01, 0x62]))).toEqual({ ok: false, code: "binary_content" });
  });

  it("rejects C1 controls decoded from Windows-1252", () => {
    expect(decodeDocumentText(new Uint8Array([0x61, 0x81, 0x62]))).toEqual({ ok: false, code: "binary_content" });
  });

  it("rejects empty content", () => {
    expect(decodeDocumentText(new Uint8Array())).toEqual({ ok: false, code: "no_extractable_text" });
  });

  it("rejects whitespace-only content", () => {
    expect(decodeDocumentText(encoder.encode(" \t\r\n "))).toEqual({ ok: false, code: "no_extractable_text" });
  });

  it("rejects invisible Unicode formatting content", () => {
    expect(decodeDocumentText(encoder.encode("\u200B\u200E"))).toEqual({ ok: false, code: "no_extractable_text" });
  });
});
