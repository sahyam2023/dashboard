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
  const scrollHeightBeforeUpdate = useRef(0);
  
  // This ref tracks if the user has manually scrolled up.
  const userHasScrolledUpRef = useRef(false);
  
  // This ref helps determine if a truly new message has been added.
  const lastMessageIdRef = useRef<number | null>(null);

  // This effect handles preserving scroll position when loading OLDER messages.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isLoadingOlder) {
      scrollHeightBeforeUpdate.current = container.scrollHeight;
    }
  }, [isLoadingOlder]);

  // This is the main effect for handling all scrolling logic.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // First, handle restoring scroll position after loading older messages.
    if (!isLoadingOlder && scrollHeightBeforeUpdate.current > 0) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - scrollHeightBeforeUpdate.current;
      scrollHeightBeforeUpdate.current = 0;
      return;
    }
    
    // *** THE CORE FIX: Smarter Scroll Logic Starts Here ***

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    // Determine if we should scroll. Default to scrolling if the user is at the bottom.
    // This also handles the initial load.
    let shouldScroll = !userHasScrolledUpRef.current;

    // **Crucial override:** If the last message is from the current user,
    // we MUST scroll down, regardless of where they were scrolled.
    if (lastMessage && lastMessage.sender_id === currentUserId) {
        const isNewMessageFromSelf = lastMessage.id !== lastMessageIdRef.current;
        if (isNewMessageFromSelf) {
            shouldScroll = true;
        }
    }
    
    if (shouldScroll) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Update the ref to the latest message ID after processing.
    if(lastMessage) {
        lastMessageIdRef.current = lastMessage.id;
    }
    
  }, [messages, isLoadingOlder, currentUserId]); // We need messages and currentUserId

  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const scrollThreshold = 150; // A good buffer to be considered "at the bottom"

    // Load older messages when scrolled to the top
    if (scrollTop === 0 && hasMoreOlderMessages && !isLoadingOlder && onLoadOlderMessages) {
      onLoadOlderMessages();
    }

    // Update our scroll-lock ref. If the user scrolls up, lock auto-scrolling.
    // If they scroll back down, unlock it.
    if (scrollHeight - scrollTop - clientHeight > scrollThreshold) {
      userHasScrolledUpRef.current = true;
    } else {
      userHasScrolledUpRef.current = false;
    }
  };

  return (
    <ul
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto bg-gray-50 dark:bg-gray-700"
    >
      {isLoadingOlder && (
        <div className="text-center py-2 text-gray-500 dark:text-gray-400">Loading older messages...</div>
      )}
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
      
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}

      {!hasMoreOlderMessages && messages.length === 0 && !isLoadingOlder && (
        <div className="flex-1 flex flex-col items-center justify-center h-full text-center">
            <p className="text-gray-500 dark:text-gray-400">
                This is the beginning of your conversation.
            </p>
        </div>
      )}

      <div ref={messagesEndRef} />
    </ul>
  );
};

export default MessageList;