import { ChatMessage } from '../types.js';

/** Combines user instructions, durable contact facts, and recent conversation history. */
export function buildPrompt(
  systemPrompt: string,
  memories: string[],
  history: ChatMessage[],
): ChatMessage[] {
  const memoryBlock = memories.length
    ? `Known facts about this contact:\n- ${memories.join('\n- ')}`
    : 'No durable facts are known about this contact yet.';
  return [{ role: 'system', content: `${systemPrompt}\n\n${memoryBlock}` }, ...history];
}

