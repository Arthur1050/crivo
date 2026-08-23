"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { signOut } from "@/src/lib/auth-client";

interface SignOutButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
}

/**
 * Sair (spec.md — AUTH-01 AC5): invalida a sessão no servidor e volta ao
 * login. `router.refresh()` antes do `push` descarta a árvore renderizada com
 * a sessão antiga — sem isso o shell pode ser reaproveitado já sem sessão.
 */
export function SignOutButton({
  label = "Sair",
  variant = "secondary",
}: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <Button
      label={label}
      variant={variant}
      icon={<LogOutIcon size={16} />}
      clickAction={handleSignOut}
    />
  );
}
