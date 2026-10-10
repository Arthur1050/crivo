import { NaoEncontradoNeutro } from "../src/loja/nao-encontrado";

// Rota sem correspondência (404 de verdade). Neutra de propósito: ver `NaoEncontradoNeutro`.
export default function NotFound() {
  return <NaoEncontradoNeutro />;
}
