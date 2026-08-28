import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { nextCookies } from "better-auth/next-js";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { sendResetPasswordEmail } from "./email";
import { isLoginBlocked, recordFailedLogin } from "./login-attempts";

/** Rota de login com e-mail e senha — a única que o limite por e-mail observa. */
const SIGN_IN_EMAIL_PATH = "/sign-in/email";

/**
 * O e-mail da tentativa, quando o corpo da requisição tem um. Corpo malformado
 * devolve `null` e o limite se cala: quem valida o formato é o endpoint, e
 * inventar uma chave a partir de lixo poluiria o contador de outra pessoa.
 */
function attemptedEmail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" && email.length > 0 ? email : null;
}

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
      // Enxurrada vinda de UMA origem: acima de 10 tentativas do mesmo IP em 1
      // minuto, a rota é recusada (HTTP 429). Não é a AC4 — este limite é
      // chaveado por IP + rota, e a AC pede a garantia por e-mail. Quem
      // entrega a AC4 são os `hooks` abaixo; este continua aqui porque cobre a
      // outra classe de ataque, que o limite por e-mail não vê.
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  /**
   * AUTH-01 AC4, chaveada pelo E-MAIL: acima de 10 tentativas falhas para o
   * mesmo e-mail em 1 minuto, novas tentativas daquele e-mail são recusadas
   * (HTTP 429) até o fim da janela — não importa de qual IP venham.
   *
   * Os dois ganchos observam SÓ tentativas que chegaram como requisição HTTP
   * (`ctx.request`), a mesma fronteira do rate limit nativo da biblioteca, que
   * só existe no caminho da requisição. É uma decisão, não um detalhe: todo
   * login de cliente (tela ou bot) passa por `POST /api/auth/sign-in/email`,
   * enquanto uma chamada direta a `auth.api.signInEmail` é código de servidor
   * confiável — `aceitarConvite` (`src/server/actions/invitations.ts`) cria a
   * sessão do convidado logo depois de ele definir a própria senha. Contar
   * aquela chamada deixaria um atacante trancar a aceitação de convite de
   * qualquer e-mail que ele conheça.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_EMAIL_PATH || !ctx.request) return;
      const email = attemptedEmail(ctx.body);
      if (!email || !(await isLoginBlocked(email))) return;
      // Mesma resposta do limite nativo (429 + texto genérico): a tela mostra
      // "muitas tentativas" para os dois casos, e quem tenta não descobre por
      // qual dos limites passou.
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many requests. Please try again later.",
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_EMAIL_PATH || !ctx.request) return;
      // `returned` é o `APIError` que o endpoint lançou quando a credencial não
      // passou. Login bem-sucedido devolve a sessão e não conta.
      if (!isAPIError(ctx.context.returned)) return;
      const email = attemptedEmail(ctx.body);
      if (!email) return;
      await recordFailedLogin(email);
    }),
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
