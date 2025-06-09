// frontend/src/context/ChatActionContext.tsx
import React, { createContext, useContext } from 'react';
import { User } from '../components/chat/types'; // Using the User type from chat components

interface ChatActionContextType {
  openChatWithUser: (user: User) => void;
}

const ChatActionContext = createContext<ChatActionContextType | undefined>(undefined);

export const useChatActions = () => {
  const context = useContext(ChatActionContext);
  if (context === undefined) {
    // This error means a component is trying to use the context
    // without being wrapped in its Provider.
    // This can happen if ChatMain (or wherever the Provider is) isn't mounted
    // or if the component using the hook isn't a descendant of the Provider.
    console.error("useChatActions must be used within a ChatActionContextProvider. Ensure ChatMain is mounted or Provider is higher up.");
    // Fallback or throw error, depending on desired strictness.
    // For now, providing a no-op function to prevent immediate crashes,
    // but this indicates a setup problem that needs to be addressed.
    return { openChatWithUser: (user: User) => {
      console.warn("ChatActionContext: openChatWithUser called but context is not available. User:", user);
      alert("Chat functionality is currently unavailable. Context not found.");
    }};
  }
  return context;
};

export default ChatActionContext;
