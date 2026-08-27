import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { nextCookies } from "better-auth/next-js";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { sendResetPasswordEmail } from "./email";

/** URL da tela de redefinição. `BETTER_AUTH_URL` é a base canônica do produto,
 * a mesma que o convite usa em `src/server/actions/users.ts`. */
function resetPasswordUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/recuperar-senha?token=${token}`;
}

/**
 * Instância única do better-auth do produto (design.md — Configuração de
 * autenticação; AD-021). Todo consumidor (rotas, server actions, DAL) importa
 * `auth` deste módulo — nunca constrói uma segunda instância.
 *
 * Reusa a pool `pg` de `src/db/index.ts`: nenhuma conexão nova é aberta, e a
 * suíte de testes herda automaticamente o isolamento em `TEST_DATABASE_URL`.
 *
 * `advanced.database.generateId: "uuid"` é o coração desta task (tasks.md —
 * T2): as PKs do projeto são todas `uuid` com `defaultRandom()` (AD-002 depende
 * de `tenants.id` ser uma identidade só), e o padrão do better-auth é um id
 * alfanumérico de 32 caracteres, que não caberia numa coluna `uuid`. O modo
 * "uuid" faz o id ser `crypto.randomUUID()` — v4, exatamente o formato que
 * `gen_random_uuid()` produz.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Os nomes de tabela do projeto são plurais; os modelos do better-auth são
  // singulares. O mapeamento é explícito por modelo (mesma mecânica que o
  // plugin `organization` vai usar para apontar `organization` → `tenants`).
  user: { modelName: "users" },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  // `BETTER_AUTH_URL` e `BETTER_AUTH_SECRET` são lidas do ambiente pela
  // própria biblioteca (ver `.env.example`). Sem o secret, o better-auth cai
  // num valor de desenvolvimento e LANÇA em produção — é ele que assina o
  // cookie de sessão.
  emailAndPassword: {
    enabled: true,
    // AUTH-02 AC1: o link vale 1 hora. O default da biblioteca já é 3600s,
    // mas a AC diz "1 hora" — declarar deixa o requisito no código, em vez de
    // depender de um default que uma atualização pode mudar sem aviso.
    resetPasswordTokenExpiresIn: 3600,
    // AUTH-02 AC3: redefinir a senha encerra as DEMAIS sessões do usuário.
    // Quem trocou a senha porque suspeita de acesso indevido precisa que o
    // acesso indevido caia junto; sem isso a sessão do invasor sobreviveria à
    // troca.
    revokeSessionsOnPasswordReset: true,
    /**
     * AUTH-02 AC1. O link aponta para a NOSSA tela (`/recuperar-senha?token=`),
     * não para o callback interno do better-auth: o endpoint nativo
     * `/reset-password/:token` só existe para redirecionar de volta a uma
     * `callbackURL`, e apontar direto elimina esse salto (e o origin check que
     * ele carrega). O token vem pronto no argumento.
     *
     * Falha de envio NÃO derruba a requisição: `sendResetPasswordEmail` nunca
     * lança (é o contrato do adaptador da T19), e a resposta ao usuário é a
     * mesma dos demais casos — quem pediu não descobre nada sobre a conta pela
     * diferença de comportamento (AC2).
     */
    sendResetPassword: async ({ user, token }) => {
      await sendResetPasswordEmail({
        to: user.email,
        name: user.name || user.email,
        url: resetPasswordUrl(token),
      });
    },
  },
  rateLimit: {
    // O padrão da biblioteca é ligar o rate limit só em produção. AUTH-01 AC4
    // é requisito de comportamento, não de ambiente: fica ligado sempre, e é
    // por isso que existe teste para ele.
    enabled: true,
    customRules: {
      // AUTH-01 AC4: acima de 10 tentativas falhas em 1 minuto, novas
      // tentativas são recusadas (HTTP 429).
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [
    organization({
      schema: {
        // O coração da AD-021: a imobiliária continua sendo UMA identidade.
        // O modelo `organization` do plugin é a tabela `tenants` que já
        // existe — não uma tabela paralela que precisaria ser mantida em
        // sincronia com ela.
        organization: {
          modelName: "tenants",
          additionalFields: {
            // `tenants` não é uma tabela do plugin com colunas de domínio
            // penduradas: é a tabela de domínio, e ela tem duas colunas
            // NOT NULL que o plugin precisa conhecer para conseguir escrever
            // nela. Sem declará-las aqui, qualquer `createOrganization`
            // falharia com violação de NOT NULL em `agent_name` /
            // `supported_modality`. Declarar é dizer a verdade sobre a tabela
            // mapeada; a alternativa seria dar default a coluna de domínio,
            // que é enfraquecer o schema para acomodar a biblioteca.
            agentName: { type: "string", required: true },
            supportedModality: { type: "string", required: true },
          },
        },
        member: {
          modelName: "tenant_members",
          additionalFields: {
            // Janela de trabalho do corretor (AGENDA-01). Mora no VÍNCULO,
            // não no usuário: a mesma pessoa pode atender de manhã numa
            // imobiliária e à tarde na outra. Mesmo formato de
            // `tenants.meetingDays`/`meetingHoursStart` — dias ISO 1
            // (segunda) a 7 (domingo), horas "HH:MM" em America/Sao_Paulo.
            workDays: { type: "number[]", required: false },
            workHoursStart: { type: "string", required: false },
            workHoursEnd: { type: "string", required: false },
            // Desativação (USER-02): o vínculo nunca é apagado — perde acesso
            // e sai das listas de atribuição, mas segue nomeado no histórico
            // dos leads que atendeu. `null` = vínculo ativo.
            deactivatedAt: { type: "date", required: false },
          },
        },
        invitation: { modelName: "tenant_invitations" },
      },
    }),
    // Precisa ser o ÚLTIMO plugin da lista: é ele que aplica os cookies que a
    // biblioteca emite quando um endpoint é chamado de dentro de uma server
    // action do Next.
    nextCookies(),
  ],
});
