/** T58 fixture preview. Run: npx tsx scripts/preview-message-pricing.tsx [port]
 * Browser: http://127.0.0.1:4178/?state=paid-service (or any state below).
 * No application routes, credentials, database, or real conversation data.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@astryxdesign/core/AppShell";
import { ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { MessagePricing } from "../src/components/chats/message-pricing";
import type { MessagePricingView } from "../src/server/data/whatsapp";

const require = createRequire(import.meta.url);
const css = new Map([
  ["/reset.css", readFileSync(require.resolve("@astryxdesign/core/reset.css"))],
  ["/astryx.css", readFileSync(require.resolve("@astryxdesign/core/astryx.css"))],
  ["/theme.css", readFileSync(require.resolve("@astryxdesign/theme-neutral/theme.css"))],
]);
const labels: Record<MessagePricingView["state"], string> = {
  "paid-service": "Tarifável — confirmado pela Meta",
  "free-service": "Gratuita — franquia de serviço",
  "free-entry-point": "Gratuita — janela de entrada gratuita",
  pending: "Cobrança pendente de confirmação",
  unavailable: "Classificação indisponível",
  "not-delivered": "Não entregue",
};
const port = Number(process.argv[2] ?? 4178);

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const stylesheet = css.get(url.pathname);
  if (stylesheet) {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end(stylesheet);
    return;
  }
  const requested = url.searchParams.get("state") ?? "paid-service";
  const inbound = requested === "inbound";
  const state = Object.hasOwn(labels, requested) ? requested as MessagePricingView["state"] : "unavailable";
  const pricing: MessagePricingView = { messageId: "fixture-message", state, label: labels[state] };
  // Frame: single stream, full viewport width (320px mobile / 1000px desktop).
  // Bubbles and complete metadata wrap with the stream; no panels or cards.
  const markup = renderToStaticMarkup(
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`T58 fixture — ${requested}`}</title>
        <link rel="stylesheet" href="/reset.css" />
        <link rel="stylesheet" href="/astryx.css" />
        <link rel="stylesheet" href="/theme.css" />
      </head>
      <body>
        <Theme theme={neutralTheme} mode="light">
          <AppShell contentPadding={4} height="fill" variant="surface">
            <Text type="supporting">Preview de fixture T58: {requested}</Text>
            <ChatMessageList density="compact">
              <ChatMessage sender={inbound ? "assistant" : "user"}>
                <ChatMessageBubble
                  variant={inbound ? "ghost" : "filled"}
                  metadata={<MessagePricing sender={inbound ? "lead" : "agente"} pricing={pricing} />}
                >
                  Mensagem de teste da apresentação.
                </ChatMessageBubble>
              </ChatMessage>
            </ChatMessageList>
          </AppShell>
        </Theme>
      </body>
    </html>
  );
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html>${markup}`);
}).listen(port, "127.0.0.1", () => {
  console.log(`T58 fixture preview: http://127.0.0.1:${port}/?state=paid-service`);
});
