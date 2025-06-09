// frontend/src/context/ChatActionContext.tsx
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { User } from '../components/chat/types'; // User type from chat components

// Define the shape of the context
interface ChatActionContextType {
  openChatWithUser: (user: User) => void;
  closeChatModal: () => void;
  isChatModalOpen: boolean;
  targetUser: User | null;
}

// Create the context with default stub values
const ChatActionContext = createContext<ChatActionContextType>({
  openChatWithUser: () => { console.warn("ChatActionContext: openChatWithUser called on default context value."); },
  closeChatModal: () => { console.warn("ChatActionContext: closeChatModal called on default context value."); },
  isChatModalOpen: false,
  targetUser: null,
});

export const useChatActions = () => {
  const context = useContext(ChatActionContext);
  // The context is now initialized with default values, so a check for `undefined`
  // is less critical unless we want to enforce that the Provider has been used.
  // For robustness, especially if the default stubs weren't comprehensive,
  // keeping a check or relying on TypeScript to guide usage is good.
  // If context === undefined, it means useContext is used outside a Provider,
  // which shouldn't happen if the default value is correctly typed and provided.
  // However, the default stubs are primarily for type-safety and basic fallback.
  // A more explicit check can be: if (context === ChatActionContext._currentValue) to see if it's the default.
  if (context.openChatWithUser === ChatActionContext.defaultValue?.openChatWithUser) {
     // This check is a bit fragile as it relies on comparing function references.
     // A more robust way might be to include a specific flag in the default context value, e.g. isDefault: true
     // Or simply ensure components handle the stubbed functions gracefully if they are ever invoked.
     // For this refactor, we assume the Provider will always be used, and stubs are for type safety and avoiding undefined errors.
     console.warn("useChatActions used outside of a ChatActionContextProvider or before it's initialized properly. Using default stubs.");
  }
  return context;
};

interface ChatActionContextProviderProps {
  children: ReactNode;
}

export const ChatActionContextProvider: React.FC<ChatActionContextProviderProps> = ({ children }) => {
  const [isChatModalOpen, setIsChatModalOpen] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  const openChatWithUser = useCallback((user: User) => {
    setTargetUser(user);
    setIsChatModalOpen(true);
    console.log(`Chat modal opened for user: ${user.username} (ID: ${user.id})`);
    // In a real app, you might also want to trigger side effects here,
    // like fetching chat history for this user, etc.
  }, []); // No dependencies, as it only uses setters

  const closeChatModal = useCallback(() => {
    setIsChatModalOpen(false);
    setTargetUser(null);
    console.log("Chat modal closed.");
  }, []); // No dependencies

  const contextValue = {
    openChatWithUser,
    closeChatModal,
    isChatModalOpen,
    targetUser,
  };

  return (
    <ChatActionContext.Provider value={contextValue}>
      {children}
    </ChatActionContext.Provider>
  );
};

// Default export can remain if other parts of the application expect it.
// However, typically, you might not need to export the context itself if you export the provider and the hook.
export default ChatActionContext;
