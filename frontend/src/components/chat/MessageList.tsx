// frontend/src/components/chat/MessageList.tsx

import React, { useEffect, useLayoutEffect, useRef, UIEvent } from 'react';
import { Message } from './types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserId: number | null;
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
  
  // Ref to store the scrollHeight before older messages are prepended
  const scrollHeightBeforeUpdate = useRef(0);
  
  // **THE FIX - PART 1: A ref to track if the user has manually scrolled up.**
  // We initialize it to false, assuming we start at the bottom.
  const userHasScrolledUpRef = useRef(false);

  // This layout effect is for maintaining scroll position when loading OLDER messages.
  // It captures the scroll height *before* the new (older) messages are rendered.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isLoadingOlder) {
      scrollHeightBeforeUpdate.current = container.scrollHeight;
    }
  }, [isLoadingOlder]);

  // This is our main scrolling logic effect.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Case 1: Finished loading OLDER messages.
    // Restore the scroll position so it doesn't jump to the top.
    if (!isLoadingOlder && scrollHeightBeforeUpdate.current > 0) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - scrollHeightBeforeUpdate.current;
      scrollHeightBeforeUpdate.current = 0; // Reset for the next load
      return; // We've handled the scroll, so we're done.
    }

    // Case 2: A new message arrived or the chat was opened for the first time.
    // We only scroll down if the user has NOT manually scrolled up.
    if (!userHasScrolledUpRef.current) {
      // Use 'auto' behavior for initial load for instant scroll, and 'smooth' for new messages.
      // Since we can't easily distinguish, 'smooth' is a good compromise. 'auto' also works well.
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    
  }, [messages, isLoadingOlder]); // Depend on messages and isLoadingOlder

  // **THE FIX - PART 2: Update the ref based on user's scroll actions.**
  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const scrollThreshold = 100; // How many pixels from the bottom to be considered "at the bottom"

    // Check if user is at the top to load older messages
    if (scrollTop === 0 && hasMoreOlderMessages && !isLoadingOlder && onLoadOlderMessages) {
      onLoadOlderMessages();
    }

    // Determine if the user has scrolled up.
    // If their scroll position is further from the bottom than our threshold,
    // we set the ref to true.
    if (scrollHeight - scrollTop - clientHeight > scrollThreshold) {
      userHasScrolledUpRef.current = true;
    } else {
      // If they scroll back down to the bottom, we set it back to false,
      // which re-enables auto-scrolling for new messages.
      userHasScrolledUpRef.current = false;
    }
  };

  return (
    <ul
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto bg-gray-50 dark:bg-gray-700"
      aria-live="polite" // Good for accessibility
    >
      {/* Loading indicator for older messages */}
      {isLoadingOlder && (
        <div className="text-center py-2 text-gray-500 dark:text-gray-400">Loading older messages...</div>
      )}

      {/* Button to load older messages */}
      {hasMoreOlderMessages && !isLoadingOlder && (
         <div className="text-center py-2">
            <button
              onClick={onLoadOlderMessages}
              disabled={isLoadingOlder}
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium py-1.5 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Load Older Messages
            </button>
        </div>
      )}
      
      {/* Render all messages */}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}

      {/* Message shown at the very beginning of a conversation */}
      {!hasMoreOlderMessages && messages.length === 0 && !isLoadingOlder && (
        <div className="flex-1 flex flex-col items-center justify-center h-full text-center">
            <p className="text-gray-500 dark:text-gray-400">
                This is the beginning of your conversation.
            </p>
        </div>
      )}

      {/* Invisible div at the end to scroll to */}
      <div ref={messagesEndRef} />
    </ul>
  );
};

export default MessageList;