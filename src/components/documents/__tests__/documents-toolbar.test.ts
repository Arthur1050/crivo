import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFiltersHref } from "../documents-page-state";
import { DocumentsToolbar } from "../documents-toolbar";

const navigation = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
// Na ordem dos useState da barra: busca, último `q` visto na URL e último `q` escrito pela digitação.
const state = vi.hoisted(() => ({ seeds: [] as string[], setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/documentos",
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    state.setters.push(setter);
    return [state.seeds.length > 0 ? state.seeds.shift() : initial, setter];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: vi.fn(),
}));
vi.mock("@/src/components/documents/document-sort", async () => import("../document-sort"));
vi.mock("@/src/lib/document-folders", async () => import("../../../lib/document-folders"));

type ControlProps = {
  children?: ReactNode;
  label?: ReactNode;
  "aria-label"?: string;
  onClick?: () => void;
  onChange?: (value: string) => void;
};

// Inspeciona o elemento retornado pela barra e chama seu handler real.
// Não executa os componentes Astryx nem substitui a transformação da URL.
function findControl(tree: ReactNode, label: string): ControlProps {
  const matches: ControlProps[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<ControlProps>(child)) return;
      if ((child.props.label === label || child.props["aria-label"] === label)
        && (child.props.onClick || child.props.onChange)) matches.push(child.props);
      visit(child.props.children);
    });
  }
  visit(tree);
  expect(matches).toHaveLength(1);
  return matches[0];
}

const folder = { id: "00000000-0000-4000-8000-000000000001", name: "Contratos" };
const filters = "q=contrato&categoria=x&modalidade=novo&ordem=nome&visao=lista";

describe("Limpar filtros do menu de Documentos — PABRIR-01 AC4 emendado", () => {
  beforeEach(() => navigation.replace.mockClear());

  it.each([
    { context: "pasta aberta", prefix: `pasta=${folder.id}&`, showFolderFilter: false,
      expected: `/documentos?pasta=${folder.id}&q=contrato&ordem=nome&visao=lista` },
    { context: "raiz sem filtro de pasta", prefix: "", showFolderFilter: true,
      expected: "/documentos?q=contrato&ordem=nome&visao=lista" },
    { context: "raiz em Sem pasta", prefix: "pasta=sem-pasta&", showFolderFilter: true,
      expected: "/documentos?q=contrato&ordem=nome&visao=lista" },
    { context: "filtro de pasta oculto", prefix: "pasta=sem-pasta&", showFolderFilter: false,
      expected: "/documentos?pasta=sem-pasta&q=contrato&ordem=nome&visao=lista" },
  ])("limpa pelo onClick real: $context", ({ prefix, showFolderFilter, expected }) => {
    navigation.query = prefix + filters;
    const control = findControl(DocumentsToolbar({ categories: [], showFolderFilter }), "Limpar filtros");
    expect(control.onClick).toBeTypeOf("function");
    control.onClick!();
    expect(navigation.replace.mock.calls).toEqual([[expected]]);
    expect(navigation.query).toBe(prefix + filters);
  });

  it("limpa na raiz sem deixar um ponto de interrogação vazio", () => {
    navigation.query = "modalidade=novo&categoria=x&pasta=sem-pasta";
    findControl(DocumentsToolbar({ categories: [], showFolderFilter: true }), "Limpar filtros").onClick!();
    expect(navigation.replace.mock.calls).toEqual([["/documentos"]]);
  });

  it.each([
    ["Modalidade", "usado", `pasta=${folder.id}&q=contrato&categoria=x&modalidade=usado&ordem=nome&visao=lista`],
    ["Categoria", "y", `pasta=${folder.id}&q=contrato&categoria=y&modalidade=novo&ordem=nome&visao=lista`],
    ["Ordenar por", "tamanho", `pasta=${folder.id}&q=contrato&categoria=x&modalidade=novo&ordem=tamanho&visao=lista`],
  ])("mantém a pasta ao alterar %s individualmente", (label, value, expected) => {
    navigation.query = `pasta=${folder.id}&${filters}`;
    const control = findControl(DocumentsToolbar({ categories: [] }), label);
    expect(control.onChange).toBeTypeOf("function");
    control.onChange!(value);
    expect(navigation.replace.mock.calls).toEqual([[`/documentos?${expected}`]]);
  });

  it("o link do estado vazio limpa também busca, ordem e visão, mantendo só a pasta", () => {
    navigation.query = `pasta=${folder.id}&${filters}`;
    const href = clearFiltersHref({ kind: "pasta", folder });
    expect(href).toBe(`/documentos?pasta=${folder.id}`);
    expect([...new URL(href, "https://krivo.test").searchParams]).toEqual([["pasta", folder.id]]);
  });
});

describe("submenu Pasta da raiz — PRAIZ-01 AC8 e Edge Case 6", () => {
  beforeEach(() => navigation.replace.mockClear());

  it.each([
    ["sem-pasta", "q=contrato&ordem=nome", "/documentos?q=contrato&ordem=nome&pasta=sem-pasta"],
    ["sem-pasta", "pasta=sem-pasta&q=contrato", "/documentos?pasta=sem-pasta&q=contrato"],
    ["todas", "pasta=sem-pasta&q=contrato", "/documentos?q=contrato"],
  ])("o onChange real com %s sobre %s leva à URL completa", (value, query, expected) => {
    navigation.query = query;
    findControl(DocumentsToolbar({ categories: [], showFolderFilter: true }), "Pasta").onChange!(value);
    expect(navigation.replace.mock.calls).toEqual([[expected]]);
  });
});

describe("campo de busca acompanha a URL", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    state.seeds = [];
    state.setters = [];
  });
  afterEach(() => vi.useRealTimers());

  it("esvazia o campo quando a URL perde a busca sem passar pela digitação", () => {
    navigation.query = `pasta=${folder.id}`;
    state.seeds = ["Memorial", "Memorial", "Memorial"];
    DocumentsToolbar({ categories: [] });
    const [setSearch, setPreviousUrlSearch, setWrittenSearch] = state.setters;
    expect(setSearch.mock.calls).toEqual([[""]]);
    expect(setPreviousUrlSearch.mock.calls).toEqual([[""]]);
    expect(setWrittenSearch.mock.calls).toEqual([[""]]);
  });

  it("mantém o que foi digitado depois quando a URL reflete a própria digitação", () => {
    navigation.query = "q=contr";
    state.seeds = ["contrato", "", "contr"];
    DocumentsToolbar({ categories: [] });
    expect(state.setters[0].mock.calls).toEqual([["contrato"]]);
  });

  it("não mexe no campo enquanto a URL não muda", () => {
    navigation.query = "q=contr";
    state.seeds = ["contrato", "contr", "contrato"];
    DocumentsToolbar({ categories: [] });
    expect(state.setters[0]).not.toHaveBeenCalled();
  });

  it.each([
    ["contrato", "contrato", "/documentos?q=contrato"],
    ["   ", "", "/documentos"],
  ])("a digitação de %j registra o que escreveu na URL", (typed, written, expected) => {
    vi.useFakeTimers();
    navigation.query = "";
    const control = findControl(DocumentsToolbar({ categories: [] }), "Buscar documentos");
    control.onChange!(typed);
    const setWrittenSearch = state.setters[2];
    expect(setWrittenSearch).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(setWrittenSearch.mock.calls).toEqual([[written]]);
    expect(navigation.replace.mock.calls).toEqual([[expected]]);
  });
});
