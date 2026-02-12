import { create } from "zustand";

export interface ChatHistoryItem {
  id: string;
  title: string;
  updatedAt: Date;
}

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  chatHistory: ChatHistoryItem[];
  setChatHistory: (history: ChatHistoryItem[]) => void;
  addChat: (chat: ChatHistoryItem) => void;
  removeChat: (chatId: string) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  chatHistory: [],
  setChatHistory: (history) => set({ chatHistory: history }),
  addChat: (chat) =>
    set((state) => ({ chatHistory: [chat, ...state.chatHistory] })),
  removeChat: (chatId) =>
    set((state) => ({
      chatHistory: state.chatHistory.filter((chat) => chat.id !== chatId),
    })),
}));
