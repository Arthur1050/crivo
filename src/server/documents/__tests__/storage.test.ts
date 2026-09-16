import { describe, expect, it } from "vitest";
import {
  DocumentStorageError,
  createDocumentStorageKey,
  sanitizeDownloadFilename,
  toDocumentStorageError,
} from "../storage";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const INTENT_ID = "22222222-2222-4222-8222-222222222222";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";

describe("document storage contract", () => {
  it("creates a versioned opaque key from server-issued UUIDs", () => {
    expect(createDocumentStorageKey(TENANT_ID, INTENT_ID, OBJECT_ID)).toBe(
      `documents/v1/${TENANT_ID}/${INTENT_ID}/${OBJECT_ID}`
    );
  });

  it("normalizes UUID casing without adding a filename to the key", () => {
    const key = createDocumentStorageKey(
      TENANT_ID.toUpperCase(),
      INTENT_ID.toUpperCase(),
      OBJECT_ID.toUpperCase()
    );

    expect(key).toBe(key.toLowerCase());
    expect(key).not.toContain("contrato-final.pdf");
  });

  it("rejects a client-controlled pathname in place of a UUID", () => {
    expect(() => createDocumentStorageKey("../../tenant", INTENT_ID, OBJECT_ID)).toThrow(
      "tenantId must be a UUID."
    );
  });

  it("keeps a normal download filename intact", () => {
    expect(sanitizeDownloadFilename("Contrato final (v2).pdf")).toBe(
      "Contrato final (v2).pdf"
    );
  });

  it("strips path components and header control characters from a download filename", () => {
    const filename = sanitizeDownloadFilename(
      "../segredo/contrato.pdf\r\nX-Injected: yes"
    );

    expect(filename).toContain("contrato.pdf");
    expect(filename).not.toMatch(/[\r\n\\/]/);
    expect(filename).not.toContain(":");
  });

  it("uses a safe fallback when a filename has no usable characters", () => {
    expect(sanitizeDownloadFilename("...\u0000")).toBe("documento");
    expect(sanitizeDownloadFilename(undefined)).toBe("documento");
  });

  it("bounds download filenames independently of storage keys", () => {
    expect(sanitizeDownloadFilename(`relatorio-${"a".repeat(200)}.pdf`)).toHaveLength(
      160
    );
  });

  it("classifies missing storage objects without exposing provider details", () => {
    const translated = toDocumentStorageError({
      status: 404,
      message: "https://private.example/object?token=secret",
    });

    expect(translated.kind).toBe("absent");
    expect(translated.code).toBe("STORAGE_OBJECT_ABSENT");
    expect(translated.message).not.toContain("secret");
  });

  it("classifies retryable provider failures", () => {
    const translated = toDocumentStorageError({ code: "ECONNRESET" });

    expect(translated.kind).toBe("transient");
    expect(translated.code).toBe("STORAGE_TRANSIENT_FAILURE");
  });

  it("classifies unknown provider failures as permanent and sanitizes their message", () => {
    const translated = toDocumentStorageError(
      new Error("credentials=do-not-leak")
    );

    expect(translated.kind).toBe("permanent");
    expect(translated.code).toBe("STORAGE_PERMANENT_FAILURE");
    expect(translated.message).not.toContain("credentials");
  });

  it("preserves a previously translated domain failure", () => {
    const original = new DocumentStorageError("transient");

    expect(toDocumentStorageError(original)).toBe(original);
  });
});
