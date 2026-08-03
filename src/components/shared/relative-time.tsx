"use client";

import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { formatRelativeTimePtBR } from "@/src/lib/relative-time";

const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
});

interface RelativeTimeProps {
  /** ISO string — nunca `Date` cru na fronteira RSC → client (AD-007). */
  value: string;
  type?: "supporting" | "body" | "label";
}

/**
 * Tempo relativo em pt-BR, com a data completa no hover.
 *
 * Substitui `<Timestamp format="relative">` da Astryx nas duas telas que
 * usam formato relativo: a lib tem essas strings cravadas em inglês e sem
 * ponto de extensão. Os formatos absolutos continuam com `Timestamp`, que
 * usa `Intl` e respeita o locale do browser.
 */
export function RelativeTime({ value, type = "supporting" }: RelativeTimeProps) {
  const instant = new Date(value);
  const isReadable = Number.isFinite(instant.getTime());

  return (
    <Tooltip
      content={isReadable ? ABSOLUTE_FORMATTER.format(instant) : "Data indisponível"}
    >
      <Text type={type} color="secondary">
        {formatRelativeTimePtBR(instant, new Date())}
      </Text>
    </Tooltip>
  );
}
