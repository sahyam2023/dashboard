// frontend/src/components/chat/MessageList.tsx
import React, { useEffect, useRef, UIEvent } from 'react'; // Added UIEvent
import { Message } from './types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserId: number | null; // Ensure this is passed down correctly
  onLoadOlderMessages?: () => void;
  hasMoreOlderMessages?: boolean;
  isLoadingOlder?: boolean;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  onLoadOlderMessages,
  hasMoreOlderMessages,
  isLoadingOlder
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLUListElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    // Scroll to bottom when messages change, but only if user is near the bottom.
    // This prevents auto-scroll if user has scrolled up to read history.
    const container = messagesContainerRef.current;
    if (container) {
      const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 150; // 150px threshold
      if (isScrolledToBottom || messages.length <= 20) { // Auto-scroll if few messages or already at bottom
         scrollToBottom("auto"); // Use "auto" for initial load or when user is at bottom
      }
    }
  }, [messages]);

  // Handle scrolling for loading older messages (basic example)
  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollTop } = event.currentTarget;
    if (scrollTop === 0 && hasMoreOlderMessages && onLoadOlderMessages && !isLoadingOlder) {
      onLoadOlderMessages();
    }
  };

  return (
    <ul
      ref={messagesContainerRef}
      onScroll={handleScroll}
      // flex-1 makes it take available vertical space in ChatWindow's flex-col layout
      // bg-gray-50 dark:bg-gray-850 provides a slightly different background for the message area
      className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto bg-gray-50 dark:bg-gray-850"
    >
      {isLoadingOlder && (
        <div className="text-center py-2 text-gray-500 dark:text-gray-400">Loading older messages...</div>
      )}
      {hasMoreOlderMessages && !isLoadingOlder && onLoadOlderMessages && (
         <div className="text-center py-2">
            <button
              onClick={onLoadOlderMessages}
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium py-1.5 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
            >
              Load Older Messages
            </button>
        </div>
      )}
      {messages.map((msg) => (
        // Ensure currentUserId is correctly passed down
        <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}
      <div ref={messagesEndRef} />
    </ul>
  );
};

export default MessageList;
