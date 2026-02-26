import { Hash, MessageSquare, Phone, Send } from "lucide-react";
import type { SessionChannelType } from "./types";

export const CHANNEL_TYPE_ICONS: Record<SessionChannelType, typeof Phone> = {
  whatsapp: Phone,
  telegram: Send,
  slack: Hash,
  discord: MessageSquare,
};
