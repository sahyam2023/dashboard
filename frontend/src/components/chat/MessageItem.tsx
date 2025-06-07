// frontend/src/components/chat/MessageItem.tsx
import React from 'react';
import { Message } from './types';

interface MessageItemProps {
  message: Message;
  currentUserId: number | null;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, currentUserId }) => {
  const isCurrentUserSender = message.sender_id === currentUserId;

  // Basic date formatting, consider using a library like date-fns for more complex needs
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex ${isCurrentUserSender ? 'justify-end' : 'justify-start'} w-full`}>
      <div
        className={`py-2 px-3 sm:px-4 rounded-2xl max-w-[70%] sm:max-w-[65%] md:max-w-[60%] break-words shadow-sm ${ // Adjusted max-width and padding
          isCurrentUserSender
            ? 'bg-blue-600 dark:bg-blue-700 text-white rounded-br-none'  // Different rounding for current user
            : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-bl-none' // Different rounding for other user
        }`}
      >
        {!isCurrentUserSender && message.sender_username && ( // Only show sender username if it's not the current user and username exists
          <p className="text-xs font-semibold mb-0.5 text-gray-500 dark:text-gray-400">
            {message.sender_username}
          </p>
        )}
        <p className="text-sm leading-snug">{message.content}</p> {/* leading-snug for better text flow */}
        <div className={`text-xs mt-1.5 flex items-center ${isCurrentUserSender ? 'justify-end text-blue-100 dark:text-blue-300' : 'justify-start text-gray-500 dark:text-gray-400'}`}>
          <span>{formatDate(message.created_at)}</span>
          {isCurrentUserSender && message.is_read && (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
             </svg> // Simple checkmark for read, can be double checkmark too
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
