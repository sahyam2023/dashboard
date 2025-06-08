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
import Spinner from './Spinner'; // Import Spinner
import { useNotification } from '../../context/NotificationContext'; // Import useNotification

interface ChatWindowProps {
  selectedConversation: Conversation | null;
  currentUserId: number | null; // Will be passed from ChatMain
  socket: Socket | null;
}

interface OtherUserStatus {
  is_online: boolean;
  last_seen: string | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ selectedConversation, currentUserId, socket }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false); // For initial message load
  const [loadingOlder, setLoadingOlder] = useState(false); // For loading older messages
  const [sending, setSending] = useState(false);
  const { showToastNotification } = useNotification(); // Corrected to showToastNotification
  const [otherUserStatus, setOtherUserStatus] = useState<OtherUserStatus | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null); // Ref for selectedConversation

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
    // setError(null); // Removed as error state is removed
    try {
      const fetchedMessages = await api.getMessages(conversationId, messagesPerPage, (page - 1) * messagesPerPage);

      // API returns newest first, reverse for chronological display in UI (older at top)
      const newMessages = fetchedMessages.reverse();

      if (newMessages.length < messagesPerPage) {
        setHasMoreMessages(false);
      }
      setMessages(prevMessages => initialLoad ? newMessages : [...newMessages, ...prevMessages]);
      if(initialLoad) setCurrentPage(1); // Reset current page on initial load
    } catch (err: any) { // Explicitly type err
      showToastNotification(`Error loading messages: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      if (initialLoad) {
        setLoading(false);
      } else {
        setLoadingOlder(false);
      }
    }
  }, [messagesPerPage, showToastNotification]); // Added showToastNotification to dependencies

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
    setOtherUserStatus(null); // Reset status when conversation changes
    selectedConversationRef.current = selectedConversation; // Update ref

    // Fetch initial online status for the new selected conversation's other user
    if (selectedConversation?.other_user_id) {
      const fetchStatus = async () => {
        try {
          console.log(`ChatWindow: Fetching status for user ${selectedConversation.other_user_id}`);
          const statusData = await api.getUserChatStatus(selectedConversation.other_user_id);
          setOtherUserStatus(statusData);
        } catch (err: any) {
          console.error("Failed to fetch user status:", err);
          showToastNotification(err.message || 'Failed to load user status', 'error');
          setOtherUserStatus(null);
        }
      };
      fetchStatus();
    }

  }, [selectedConversation, socket, loadMessages, tokenData?.token, showToastNotification]);

  useEffect(() => {
    if (selectedConversation && socket && !loading && messages.length > 0) {
      console.log(`ChatWindow: Emitting 'mark_as_read' for conversation ${selectedConversation.conversation_id}`);
      socket.emit('mark_as_read', { 
        conversation_id: selectedConversation.conversation_id,
        token: tokenData?.token 
      });
    }
  }, [selectedConversation, socket, loading, messages, tokenData?.token]);

  // Listen for real-time online/offline status updates
  useEffect(() => {
    if (!socket) return;

    const handleUserOnline = (data: { user_id: number }) => {
      console.log("ChatWindow: user_online event", data, "current other_user_id:", selectedConversationRef.current?.other_user_id);
      if (data.user_id === selectedConversationRef.current?.other_user_id) {
        setOtherUserStatus(prevStatus => ({ ...prevStatus, is_online: true, last_seen: null }));
      }
    };

    const handleUserOffline = (data: { user_id: number; last_seen: string }) => {
      console.log("ChatWindow: user_offline event", data, "current other_user_id:", selectedConversationRef.current?.other_user_id);
      if (data.user_id === selectedConversationRef.current?.other_user_id) {
        setOtherUserStatus(prevStatus => ({ ...prevStatus, is_online: false, last_seen: data.last_seen }));
      }
    };

    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    console.log(`ChatWindow: 'user_online'/'user_offline' listeners attached globally.`);

    return () => {
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      console.log(`ChatWindow: 'user_online'/'user_offline' listeners detached.`);
    };
  }, [socket]); // Depends only on socket, selectedConversationRef is used to check current relevance

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

  // Removed getFileType as file type is now determined by backend.
  // const getFileType = (fileType: string): Message['file_type'] => { ... };

  const handleSendMessage = async (messageText: string) => {
    if (!selectedConversation || !currentUserId || !messageText.trim()) return;
    setSending(true);
    try {
      // Text message: content is messageText, fileUrl, fileName, fileType are undefined
      await api.sendMessage(selectedConversation.conversation_id, messageText.trim());
      // Optimistic update is handled by socket event from backend
    } catch (err: any) {
      showToastNotification(`Error sending message: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!selectedConversation || !currentUserId) return;
    setSending(true);
    showToastNotification(`Uploading ${file.name}...`, 'info');

    try {
      // Step 1: Upload the file
      const uploadResponse = await api.uploadChatFile(file, selectedConversation.conversation_id);

      app.logger.info('File uploaded, API response:', uploadResponse); // Use app.logger if available, else console.log
      showToastNotification(`${file.name} uploaded. Sending message...`, 'info');

      // Step 2: Send the message with file details from uploadResponse
      // The 'content' for a file message could be the filename, or empty if the UI handles it.
      // Using original file.name as content for now, as backend might expect content.
      await api.sendMessage(
        selectedConversation.conversation_id,
        file.name, // Content of the message (e.g., filename)
        uploadResponse.file_url,
        uploadResponse.file_name, // This is the original_filename from backend response
        uploadResponse.file_type
      );
      // Message is considered sent. UI will update via socket 'new_message' event.
      // No optimistic UI update here to rely on backend + socket for consistency.
      // If immediate feedback is desired, a temporary local message could be added,
      // then replaced/confirmed by the socket event (matching by a temporary ID).
      // For now, we assume the socket event will follow shortly.

    } catch (err: any) {
      console.error("Error in handleSendFile:", err);
      showToastNotification(`Error sending file ${file.name}: ${err.message || 'Unknown error'}`, 'error');
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
      <div className="flex-1 flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400 text-lg">Select a conversation to start chatting.</p>
      </div>
    );
  }

  return (
    // Use h-full and flex-col to make ChatWindow fill its container from ChatMain
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md">
      <header className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700"> {/* Slight bg change for header */}
        <div className="flex items-center space-x-3">
          <img
            src={selectedConversation.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedConversation.other_username)}&background=random&size=40&color=fff`}
            alt={selectedConversation.other_username}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
          />
          <div className="flex flex-col">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100">
              {selectedConversation.other_username}
            </h2>
            {otherUserStatus && (
              <div className="flex items-center space-x-1">
                <span className={`h-2 w-2 rounded-full ${otherUserStatus.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {otherUserStatus.is_online ? 'Online' : (otherUserStatus.last_seen ? `Last seen ${new Date(otherUserStatus.last_seen).toLocaleTimeString()}` : 'Offline')}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {loading && messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}
      {/* {error && <p className="p-4 text-center text-red-500 dark:text-red-400">Error: {error}</p>} Replaced by toast */}

      {/* MessageList should be flex-1 to take up available space */}
      <MessageList
        messages={messages} // ensure this is the correctly ordered list (oldest at top)
        currentUserId={currentUserId}
        onLoadOlderMessages={handleLoadOlder}
        hasMoreOlderMessages={hasMoreMessages}
        isLoadingOlder={loadingOlder}
      />

      <ChatInput
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
        disabled={sending || !socket?.connected}
      />
    </div>
  );
};

export default ChatWindow;
