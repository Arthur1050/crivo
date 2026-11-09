/*
 * Pré-carga do `vitrine:e2e` (R15 do L16c; AD-048): imita, numa instância extra
 * do `next start`, o que um provedor serverless injeta pelo símbolo
 * `@next/cache-handlers` (lido em `next/dist/server/use-cache/handlers.js`):
 *
 *  - `DefaultCache`, o handler do `use cache`, com memória que não sobrevive
 *    entre invocações: nunca devolve entrada (é o que a Vercel faz na prática);
 *  - `RemoteCache`, o handler do `use cache: remote`, um armazenamento
 *    compartilhado que respeita `expire` e as tags (`revalidateTag`).
 *
 * Cada operação sai no stdout com o prefixo `[plataforma]`, para a asserção
 * saber qual handler a vitrine usou. Só é carregado pela asserção R15 do e2e
 * (`NODE_OPTIONS=--require`); não importa nada da vitrine (AD-044).
 */
"use strict";

const registrar = (message) => process.stdout.write(`[plataforma] ${message}\n`);
const agora = () => Date.now();

/** Expiração por tag, como o manifesto de tags do Next (`expired`, `stale`). */
const tags = new Map();
const entradas = new Map();

const tagExpirada = (lista, criadaEm) =>
  lista.some((tag) => {
    const expirada = tags.get(tag)?.expired;
    return typeof expirada === "number" && expirada <= agora() && expirada > criadaEm;
  });
const tagVelha = (lista, criadaEm) => lista.some((tag) => (tags.get(tag)?.stale ?? 0) > criadaEm);

function fluxo(pedacos) {
  return new ReadableStream({
    start(controle) {
      for (const pedaco of pedacos) controle.enqueue(pedaco);
      controle.close();
    },
  });
}

async function consumir(value) {
  const leitor = value.getReader();
  const pedacos = [];
  for (let parte; !(parte = await leitor.read()).done; ) pedacos.push(parte.value);
  return pedacos;
}

const efemero = {
  async get() {
    registrar("default.get MISS");
    return undefined;
  },
  async set(_key, pendente) {
    const entry = await pendente;
    await consumir(entry.value);
    registrar("default.set descartado");
  },
  async refreshTags() {},
  async getExpiration() {
    return 0;
  },
  async updateTags() {},
};

const remoto = {
  async get(key) {
    const salva = entradas.get(key);
    const entry = salva?.entry;
    if (!entry || agora() > entry.timestamp + entry.expire * 1000 || tagExpirada(entry.tags, entry.timestamp)) {
      registrar("remote.get MISS");
      return undefined;
    }
    registrar("remote.get HIT");
    const revalidate = tagVelha(entry.tags, entry.timestamp) ? -1 : entry.revalidate;
    return { ...entry, revalidate, value: fluxo(salva.pedacos) };
  },
  async set(key, pendente) {
    const entry = await pendente;
    const [devolvido, copia] = entry.value.tee();
    entry.value = devolvido;
    const pedacos = await consumir(copia);
    const metadados = { ...entry };
    delete metadados.value;
    entradas.set(key, { entry: metadados, pedacos });
    registrar(`remote.set tags=${entry.tags.join(",")} revalidate=${entry.revalidate} expire=${entry.expire}`);
  },
  async refreshTags() {},
  async getExpiration(lista) {
    return Math.max(0, ...lista.map((tag) => tags.get(tag)?.expired ?? 0));
  },
  async updateTags(lista, duracoes) {
    const instante = agora();
    for (const tag of lista) {
      const atual = tags.get(tag) ?? {};
      tags.set(
        tag,
        duracoes
          ? { ...atual, stale: instante, ...(duracoes.expire !== undefined ? { expired: instante + duracoes.expire * 1000 } : {}) }
          : { ...atual, expired: instante }
      );
    }
    registrar(`remote.updateTags ${lista.join(",")}`);
  },
};

globalThis[Symbol.for("@next/cache-handlers")] = { DefaultCache: efemero, RemoteCache: remoto };
registrar("handlers injetados: DefaultCache efêmero, RemoteCache compartilhado");
