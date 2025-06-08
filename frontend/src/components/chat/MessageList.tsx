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
  
  // Ref to store the scrollHeight before a new message/page of messages is added
  const scrollHeightBeforeUpdate = useRef(0);
  const hasScrolledInitially = useRef(false);

  // Use useLayoutEffect to capture scrollHeight before the DOM is painted
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      // If we are loading older messages, we want to maintain scroll position.
      // Capture the height before new (older) messages are prepended.
      if (isLoadingOlder) {
        scrollHeightBeforeUpdate.current = container.scrollHeight;
      }
    }
  }, [isLoadingOlder]); // Run only when isLoadingOlder changes


  // This is now our main scrolling logic effect
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // --- INITIAL SCROLL LOGIC ---
    // If we haven't scrolled yet for this component instance, scroll to the bottom.
    if (!hasScrolledInitially.current && messages.length > 0) {
      // console.log("DEBUG: Initial mount for this conversation. Scrolling to bottom instantly.");
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      hasScrolledInitially.current = true;
      return; // Stop here after initial scroll
    }

    // --- "LOAD OLDER MESSAGES" SCROLL LOGIC ---
    // If isLoadingOlder just became false, it means we finished loading a new page of older messages.
    if (!isLoadingOlder && scrollHeightBeforeUpdate.current > 0) {
      const newScrollHeight = container.scrollHeight;
      // Restore scroll position so it doesn't jump to the top.
      container.scrollTop += newScrollHeight - scrollHeightBeforeUpdate.current;
      // Reset the ref
      scrollHeightBeforeUpdate.current = 0; 
      // console.log("DEBUG: Restored scroll position after loading older messages.");
    }
    
    // --- "NEW MESSAGE ARRIVED" SCROLL LOGIC ---
    // This logic is for when a new message is added to the end.
    const scrollThreshold = 200; // Pixels from bottom
    const isScrolledNearBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + scrollThreshold;
    
    if (hasScrolledInitially.current && isScrolledNearBottom) {
        // Only auto-scroll if it's not part of loading older messages.
        // We can check this by seeing if our scrollHeight ref is still 0.
        if (scrollHeightBeforeUpdate.current === 0) {
          // console.log("DEBUG: New message arrived and user is near bottom. Scrolling smoothly.");
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }

  }, [messages, isLoadingOlder]); // Depend on messages and isLoadingOlder

  const handleScroll = (event: UIEvent<HTMLUListElement>) => {
    const { scrollTop } = event.currentTarget;
    if (scrollTop === 0 && hasMoreOlderMessages && !isLoadingOlder && onLoadOlderMessages) {
      // console.log("DEBUG: Reached top of scroll. Firing onLoadOlderMessages.");
      onLoadOlderMessages();
    }
  };

  return (
    <ul
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto bg-gray-50 dark:bg-gray-700"
    >
      {/* ... rest of your JSX remains the same ... */}
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
      {!isLoadingOlder && messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center h-full text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            No messages yet.
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Be the first to say hello!
          </p>
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
      ))}
      <div ref={messagesEndRef} />
    </ul>
  );
};

export default MessageList;