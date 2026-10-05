import type { ReactNode } from "react";
import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import type { ChatSender } from "../../lib/chat-thread";
import type { MessagePricingView } from "../../server/data/whatsapp";

interface MessagePricingProps {
  sender: ChatSender;
  pricing?: MessagePricingView | null;
  timestamp?: ReactNode;
}

/** Apresenta a classificação persistida; não calcula tarifa ou franquia. */
export function MessagePricing({ sender, pricing, timestamp }: MessagePricingProps) {
  if (sender === "lead") return null;

  return (
    <ChatMessageMetadata
      timestamp={timestamp}
      footer={
        <Text type="supporting" color="secondary" textWrap="wrap">
          {pricing?.label ?? "Classificação indisponível"}
        </Text>
      }
    />
  );
}
