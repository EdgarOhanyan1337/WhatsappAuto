import { proto, WASocket } from '@whiskeysockets/baileys';
import { AIRouter } from '../ai/AIRouter.js';
import { MemoryService } from '../memory/MemoryService.js';
import { buildPrompt } from '../memory/buildPrompt.js';
import { AssistantRepository } from '../repositories/AssistantRepository.js';
import { extractMessageText, phoneFromJid } from './messageContent.js';
import { getEffectiveMode, isWithinWorkingHours } from './eligibility.js';

/** Persists an inbound WhatsApp message and turns it into an auto reply or approval draft. */
export async function handleIncomingMessage(input: {
  userId: string;
  socket: WASocket;
  message: proto.IWebMessageInfo;
  repository: AssistantRepository;
  router: AIRouter;
  memoryService: MemoryService;
}): Promise<void> {
  const messageKey = input.message.key;
  if (!messageKey) return;
  const remoteJid = messageKey.remoteJid;
  const text = extractMessageText(input.message);
  const phone = remoteJid ? phoneFromJid(remoteJid) : null;
  if (!remoteJid || !phone || !text || messageKey.fromMe) return;

  const contact = await input.repository.findOrCreateContact(input.userId, phone);
  const conversation = await input.repository.findOrCreateConversation(input.userId, contact.id);
  await input.repository.insertMessage({
    conversationId: conversation.id,
    role: 'user',
    content: text,
    status: 'sent',
  });
  await input.repository.recordInboundActivity(conversation);

  const settings = await input.repository.getBotSettings(input.userId);
  const mode = getEffectiveMode(contact.bot_mode, settings.default_mode);
  const canReply =
    settings.bot_enabled &&
    !contact.is_blacklisted &&
    mode !== 'off' &&
    isWithinWorkingHours(settings.working_hours_start, settings.working_hours_end);
  if (!canReply) return;

  const [history, memories] = await Promise.all([
    input.repository.getConversationHistory(conversation.id),
    input.repository.getMemories(contact.id),
  ]);
  const reply = await input.router.generateReply(buildPrompt(settings.system_prompt, memories, history));

  if (mode === 'manual') {
    await input.repository.insertMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: reply.text,
      provider: reply.provider,
      status: 'draft',
    });
  } else {
    if (settings.reply_delay_seconds > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, settings.reply_delay_seconds * 1000);
      });
    }
    await input.socket.sendMessage(remoteJid, { text: reply.text });
    await input.repository.insertMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: reply.text,
      provider: reply.provider,
      status: 'sent',
    });
  }

  await input.memoryService.extractIfDue(contact.id, conversation.id);
}
