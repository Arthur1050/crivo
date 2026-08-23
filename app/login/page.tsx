import type { Metadata } from "next";
import { LoginForm } from "@/src/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar — Crivo",
};

/**
 * Porta de entrada do CRM (spec.md — AUTH-01). Fica FORA do grupo `(crm)` de
 * propósito: sem sessão não há imobiliária ativa, e o shell do CRM inteiro
 * depende dela. É também uma das rotas públicas que o `proxy.ts` deixa passar.
 */
export default function LoginPage() {
  return <LoginForm />;
}
