// frontend/src/components/chat/ChatWindow.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from './types';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { io, Socket } from 'socket.io-client'; // Import socket.io-client

// Placeholder for an API service
// import { fetchMessages, sendMessage as sendMessageAPI } from '../../services/api';

import * as api from '../../services/api'; // Import your API service
import { useAuth } from '../../context/AuthContext'; // For token

interface ChatWindowProps {
  selectedConversation: Conversation | null;
  currentUserId: number | null; // Will be passed from ChatMain
  socket: Socket | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ selectedConversation, currentUserId, socket }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false); // For initial message load
  const [loadingOlder, setLoadingOlder] = useState(false); // For loading older messages
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Pagination for messages
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesPerPage = 50; // Or whatever your API default is

  const { tokenData } = useAuth(); // For getting the auth token
  // Placeholder fetchMessages function is removed, will use api.getMessages
  // Placeholder sendMessageAPI function is removed, will use api.sendMessage

  const loadMessages = useCallback(async (conversationId: number, page: number = 1, initialLoad = false) => {
    if (initialLoad) {
      setLoading(true);
    } else {
      setLoadingOlder(true);
    }
    setError(null);
    try {
      const fetchedMessages = await api.getMessages(conversationId, messagesPerPage, (page - 1) * messagesPerPage);

      // API returns newest first, reverse for chronological display in UI (older at top)
      const newMessages = fetchedMessages.reverse();

      if (newMessages.length < messagesPerPage) {
        setHasMoreMessages(false);
      }
      setMessages(prevMessages => initialLoad ? newMessages : [...newMessages, ...prevMessages]);
      if(initialLoad) setCurrentPage(1); // Reset current page on initial load
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      if (initialLoad) {
        setLoading(false);
      } else {
        setLoadingOlder(false);
      }
    }
  }, [messagesPerPage]);

  useEffect(() => {
    if (selectedConversation) {
      setMessages([]);
      setHasMoreMessages(true);
      setCurrentPage(1); // Reset page to 1 for new conversation
      loadMessages(selectedConversation.conversation_id, 1, true);

      if (socket && tokenData?.token) {
        console.log(`ChatWindow: Emitting 'join_conversation' for ${selectedConversation.conversation_id}`);
        socket.emit('join_conversation', {
          conversation_id: selectedConversation.conversation_id,
          token: tokenData.token // Send token for authentication
        });
      }
    } else {
      setMessages([]);
    }
    // No specific socket cleanup for 'leave_conversation' here,
    // as joining a new room effectively changes context on server if rooms are exclusive per client session
    // or server handles disconnects.
  }, [selectedConversation, socket, loadMessages, tokenData?.token]);


  useEffect(() => {
    if (!socket || !selectedConversation) return;

    const handleNewMessage = (newMessage: Message) => {
      console.log('SocketIO: new_message received in ChatWindow', newMessage);
      if (newMessage.conversation_id === selectedConversation.conversation_id) {
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        // Potentially mark as read if user is viewing this conversation
        // This is complex if message is from current user; backend handles `is_read` for recipient
      }
    };

    socket.on('new_message', handleNewMessage);
    console.log(`ChatWindow: 'new_message' listener attached for conv ${selectedConversation.conversation_id}.`);

    return () => {
      socket.off('new_message', handleNewMessage);
      console.log(`ChatWindow: 'new_message' listener detached for conv ${selectedConversation.conversation_id}.`);
    };
  }, [socket, selectedConversation]); // Rerun when selectedConversation changes to listen to correct new_message


  const handleSendMessage = async (messageText: string) => {
    if (!selectedConversation || !currentUserId) return;
    setSending(true);
    try {
      // API call saves to DB & triggers socket event from backend
      await api.sendMessage(selectedConversation.conversation_id, messageText);
      // Optimistic update can be done here, but relying on socket event for consistency
      // If socket event is slightly delayed, UI might feel less responsive.
      // Example of optimistic update (commented out):
      // const tempMessage: Message = { id: Date.now(), conversation_id: selectedConversation.conversation_id, sender_id: currentUserId, recipient_id: selectedConversation.other_user_id, content: messageText, created_at: new Date().toISOString(), is_read: false, sender_username: 'You' };
      // setMessages(prev => [...prev, tempMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // TODO: Show error to user, maybe revert optimistic update if implemented
    } finally {
      setSending(false);
    }
  };

  const handleLoadOlder = () => {
    if (selectedConversation && hasMoreMessages && !loadingOlder) { // Check loadingOlder
        const nextPage = currentPage + 1;
        loadMessages(selectedConversation.conversation_id, nextPage, false); // initialLoad = false
        setCurrentPage(nextPage); // Update current page state
    }
  };

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-gray-100">
        <p className="text-gray-500 text-lg">Select a conversation to start chatting.</p>
      </div>
    );
  }

  return (
    // Use h-full and flex-col to make ChatWindow fill its container from ChatMain
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md">
      <header className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750"> {/* Slight bg change for header */}
        <div className="flex items-center space-x-3">
          <img
            src={selectedConversation.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedConversation.other_username)}&background=random&size=40&color=fff`}
            alt={selectedConversation.other_username}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
          />
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">
            {selectedConversation.other_username}
          </h2>
          {/* Future: Add online status or other user actions here */}
        </div>
      </header>

      {loading && messages.length === 0 && <p className="p-4 text-center text-gray-500 dark:text-gray-400">Loading messages...</p>}
      {error && <p className="p-4 text-center text-red-500 dark:text-red-400">Error: {error}</p>}

      {/* MessageList should be flex-1 to take up available space */}
      <MessageList
        messages={messages} // ensure this is the correctly ordered list (oldest at top)
        currentUserId={currentUserId}
        onLoadOlderMessages={handleLoadOlder}
        hasMoreOlderMessages={hasMoreMessages}
        isLoadingOlder={loadingOlder}
      />

      <ChatInput onSendMessage={handleSendMessage} disabled={sending || !socket?.connected} />
    </div>
  );
};

export default ChatWindow;
