import { proto } from '@whiskeysockets/baileys';

/** Extracts visible text from supported inbound WhatsApp message envelopes. */
export function extractMessageText(message: proto.IWebMessageInfo): string | null {
  const content = message.message;
  const text =
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    null;
  const normalized = text?.trim();
  return normalized ? normalized : null;
}

/** Converts an individual WhatsApp JID into an E.164-like number without a plus sign. */
export function phoneFromJid(jid: string): string | null {
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  const local = jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '');
  return local && local.length >= 7 ? local : null;
}

