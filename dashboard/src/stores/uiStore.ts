import { create } from 'zustand';
import type { Page } from '../types';

interface UiState {
  page: Page;
  selectedConversationId: string | null;
  setPage: (page: Page) => void;
  selectConversation: (conversationId: string) => void;
}

/** Keeps lightweight navigation state outside the server cache. */
export const useUiStore = create<UiState>((set) => ({
  page: 'overview',
  selectedConversationId: null,
  setPage: (page) => set({ page }),
  selectConversation: (selectedConversationId) => set({ page: 'conversations', selectedConversationId }),
}));
