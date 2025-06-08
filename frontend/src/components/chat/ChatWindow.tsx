// frontend/src/components/chat/ChatWindow.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from './types';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { Socket } from 'socket.io-client'; // Import socket.io-client
import * as api from '../../services/api'; // Import your API service
import { useAuth } from '../../context/AuthContext'; // For token
import Spinner from './Spinner'; // Import Spinner
import { useNotification } from '../../context/NotificationContext'; // Import useNotification
import { formatToISTLocaleString } from '../../utils/dateUtils'; // Import the utility

import { ArrowLeft } from 'lucide-react'; // Import an icon

interface ChatWindowProps {
  selectedConversation: Conversation | null;
  currentUserId: number | null;
  socket: Socket | null;
  onGoBack: () => void;
  socketConnected?: boolean;
  onNewConversationStarted: (conversation: Conversation) => void; // Added new prop
}

interface OtherUserStatus {
  is_online: boolean;
  last_seen: string | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  selectedConversation,
  currentUserId,
  socket,
  socketConnected,
  onGoBack,
  onNewConversationStarted, // Destructure new prop
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const { showToastNotification } = useNotification();
  const [otherUserStatus, setOtherUserStatus] = useState<OtherUserStatus | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);

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
      if (initialLoad) setCurrentPage(1); // Reset current page on initial load
    } catch (err: any) { // Explicitly type err
      showToastNotification(`Error loading messages: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      if (initialLoad) {
        setLoading(false);
      } else {
        setLoadingOlder(false);
      }
    }
  }, [messagesPerPage, showToastNotification]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation; // Update ref for listeners

    if (selectedConversation && typeof selectedConversation.conversation_id === 'number') {
      setMessages([]);
      setHasMoreMessages(true);
      setCurrentPage(1);
      loadMessages(selectedConversation.conversation_id, 1, true);

      if (socket && socketConnected && tokenData?.token) {
        console.log(`ChatWindow: Emitting 'join_conversation' for ${selectedConversation.conversation_id}`);
        socket.emit('join_conversation', {
          conversation_id: selectedConversation.conversation_id,
          token: tokenData.token,
        });
      }

      if (selectedConversation.other_user_id) {
        const fetchStatus = async () => {
          try {
            const statusData = await api.getUserChatStatus(selectedConversation.other_user_id as number); // Cast as number
            setOtherUserStatus(statusData);
          } catch (err: any) {
            console.error("Failed to fetch user status:", err);
            showToastNotification(err.message || 'Failed to load user status', 'error');
            setOtherUserStatus(null);
          }
        };
        fetchStatus();
      } else {
        setOtherUserStatus(null);
      }
    } else if (selectedConversation && selectedConversation.conversation_id === null) {
      // This is a provisional conversation, don't load messages from API yet.
      setMessages([]);
      setHasMoreMessages(false); // No messages from API to load yet
      setCurrentPage(1);
      // Fetch status for the other user in the provisional conversation
      if (selectedConversation.other_user_id) {
        const fetchStatus = async () => {
          try {
            const statusData = await api.getUserChatStatus(selectedConversation.other_user_id as number); // Cast as number
            setOtherUserStatus(statusData);
          } catch (err: any) {
            console.error("Failed to fetch user status for provisional chat:", err);
            setOtherUserStatus(null); // Still set to null on error
          }
        };
        fetchStatus();
      } else {
        setOtherUserStatus(null);
      }
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      setCurrentPage(1);
      setOtherUserStatus(null);
    }
  }, [selectedConversation, socket, socketConnected, loadMessages, tokenData?.token, showToastNotification]);

  useEffect(() => {
    if (selectedConversation && typeof selectedConversation.conversation_id === 'number' && socket && socketConnected && !loading && messages.length > 0) {
      console.log(`ChatWindow: Emitting 'mark_as_read' for conversation ${selectedConversation.conversation_id}`);
      socket.emit('mark_as_read', {
        conversation_id: selectedConversation.conversation_id,
        token: tokenData?.token
      });
    }
  }, [selectedConversation, socket, socketConnected, loading, messages, tokenData?.token]);

  // Listen for real-time online/offline status updates
  useEffect(() => {
    if (!socket || !socketConnected) return;

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
  }, [socket, socketConnected]); // Depends only on socket, selectedConversationRef is used to check current relevance

  useEffect(() => {
    if (!socket || !socketConnected || !selectedConversation) return;

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
  }, [socket, socketConnected, selectedConversation]); // Rerun when selectedConversation changes to listen to correct new_message

  // Removed getFileType as file type is now determined by backend.
  // const getFileType = (fileType: string): Message['file_type'] => { ... };

  const handleSendMessage = async (messageText: string) => {
    if (!selectedConversation || !currentUserId || !messageText.trim()) return;
    setSending(true);
    try {
      if (selectedConversation.conversation_id === null) {
        // This is a new conversation
        if (!selectedConversation.other_user_id) {
            showToastNotification("Error: Recipient user ID is missing for new conversation.", "error");
            setSending(false);
            return;
        }
        const returnedConversation = await api.startConversationAndSendMessage(
          selectedConversation.other_user_id, // This must be a number
          messageText.trim()
        );
        onNewConversationStarted(returnedConversation); // Update parent state
      } else {
        // Existing conversation
        await api.sendMessage(selectedConversation.conversation_id, messageText.trim());
      }
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
      if (selectedConversation.conversation_id === null) {
        // New conversation: use startConversationAndSendMessage with file
        if (!selectedConversation.other_user_id) {
            showToastNotification("Error: Recipient user ID is missing for new conversation.", "error");
            setSending(false);
            return;
        }
        // Re-adjusting to current api.ts: upload first, then call startConversationAndSendMessage with URLs
        const uploadResponse = await api.uploadChatFile(file, selectedConversation.other_user_id as number); // Temporarily pass other_user_id for upload path
        showToastNotification(`${file.name} uploaded. Starting conversation...`, 'info');
        const returnedConversation = await api.startConversationAndSendMessage(
            selectedConversation.other_user_id as number,
            file.name, // Content of the message (e.g., filename)
            uploadResponse.file_url,
            uploadResponse.file_name,
            uploadResponse.file_type
        );
        onNewConversationStarted(returnedConversation);

      } else {
        // Existing conversation
        const uploadResponse = await api.uploadChatFile(file, selectedConversation.conversation_id);
        showToastNotification(`${file.name} uploaded. Sending message...`, 'info');
        await api.sendMessage(
          selectedConversation.conversation_id,
          file.name,
          uploadResponse.file_url,
          uploadResponse.file_name,
          uploadResponse.file_type
        );
      }
    } catch (err: any) {
      console.error("Error in handleSendFile:", err);
      showToastNotification(`Error sending file ${file.name}: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleLoadOlder = () => {
    if (selectedConversation && typeof selectedConversation.conversation_id === 'number' && hasMoreMessages && !loadingOlder) {
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

  // Determine if the header should show provisional state or actual data
  const headerUsername = selectedConversation.other_username || "New Chat";
  const headerProfilePic = selectedConversation.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(headerUsername)}&background=random&size=40&color=fff`;


  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md">
      <header className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={onGoBack}
            className="p-1.5 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Go back to conversation list"
          >
            <ArrowLeft size={20} className="sm:w-5 sm:h-5" />
          </button>
          <img
            src={headerProfilePic}
            alt={headerUsername}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
          />
          <div className="flex flex-col">
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
              {headerUsername}
            </h2>
            {otherUserStatus && (
              <div className="flex items-center space-x-1">
                <span className={`h-2 w-2 rounded-full ${otherUserStatus.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {otherUserStatus.is_online ? 'Online' : (otherUserStatus.last_seen ? `Last seen ${formatToISTLocaleString(otherUserStatus.last_seen)}` : 'Offline')}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {loading && messages.length === 0 && selectedConversation.conversation_id !== null && (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}

      {selectedConversation.conversation_id === null && messages.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-gray-400 dark:text-gray-300 text-md text-center">
                Type your first message to start the conversation with {headerUsername}.
            </p>
        </div>
      )}

      {messages.length > 0 && (
        <MessageList
          key={selectedConversation.conversation_id ?? 'provisional'} // Use a key for provisional state
          messages={messages}
          currentUserId={currentUserId}
          onLoadOlderMessages={handleLoadOlder}
        hasMoreOlderMessages={hasMoreMessages}
        isLoadingOlder={loadingOlder}
      />

      <ChatInput
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
        disabled={sending || !socket || !socketConnected}
      />
    </div>
  );
};

export default ChatWindow;
