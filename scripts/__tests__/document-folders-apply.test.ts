import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDocumentFoldersSql, verifyDocumentFoldersState } from "../document-folders/apply";

const { query, connect, end } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({ Client: class {
  query = query;
  connect = connect;
  end = end;
} }));

const url = "postgresql://teste.example.test/banco";
const foreignKeys = [
  { conname: "document_folders_tenant_id_tenants_id_fk", table_name: "document_folders", confdeltype: "c" },
  { conname: "documents_folder_id_document_folders_id_fk", table_name: "documents", confdeltype: "n" },
  { conname: "document_upload_intents_folder_id_document_folders_id_fk", table_name: "document_upload_intents", confdeltype: "n" },
];
const indexes = ["document_folders_tenant_id_lower_name_idx", "documents_tenant_folder_idx", "document_categories_tenant_id_lower_name_idx"];

beforeEach(() => { vi.resetAllMocks(); });

function state(present: boolean, columns: string[], keys = foreignKeys, indexNames = indexes) {
  query.mockResolvedValueOnce({ rows: [{ present }] })
    .mockResolvedValueOnce({ rows: columns.map((table_name) => ({ table_name })) })
    .mockResolvedValueOnce({ rows: keys })
    .mockResolvedValueOnce({ rows: indexNames.map((indexname) => ({ indexname })) });
}

describe("PBANCO-01: conferência de todos os itens do schema", () => {
  it("estado completo não apresenta problemas", async () => {
    state(true, ["documents", "document_upload_intents"]);
    expect(await verifyDocumentFoldersState(url)).toEqual([]);
    expect(end).toHaveBeenCalledOnce();
  });

  it("lista uma mensagem por tabela, coluna, FK e índice ausente", async () => {
    state(false, [], [], []);
    expect(await verifyDocumentFoldersState(url)).toEqual([
      "tabela document_folders ausente",
      "coluna documents.folder_id ausente",
      "coluna document_upload_intents.folder_id ausente",
      ...foreignKeys.map((fk) => `FK ${fk.conname} ausente`),
      ...indexes.map((name) => `índice ${name} ausente`),
    ]);
  });

  it.each(foreignKeys)("recusa regra de exclusão incorreta em $conname", async (fk) => {
    state(true, ["documents", "document_upload_intents"], foreignKeys.map((key) => key === fk ? { ...key, confdeltype: "a" } : key));
    expect(await verifyDocumentFoldersState(url)).toEqual([`FK ${fk.conname} com confdeltype diferente de ${fk.confdeltype}`]);
  });

  it("aplica o arquivo transacional e encerra o cliente mesmo se o SQL falha", async () => {
    query.mockRejectedValueOnce(new Error("SQL recusado"));
    await expect(applyDocumentFoldersSql(url)).rejects.toThrow("SQL recusado");
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("begin;");
    expect(sql).toContain('create table if not exists "document_folders"');
    expect(sql).toContain("commit;");
    expect(end).toHaveBeenCalledOnce();
  });
});
