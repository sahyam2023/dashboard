// frontend/src/components/chat/ChatWindow.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from './types';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { Socket } from 'socket.io-client';
import * as api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Spinner from './Spinner';
import { useNotification } from '../../context/NotificationContext';
import { formatToISTLocaleString } from '../../utils/dateUtils';
import { ArrowLeft } from 'lucide-react';

interface ChatWindowProps {
  selectedConversation: Conversation | null;
  currentUserId: number | null;
  socket: Socket | null;
  onGoBack: () => void;
  socketConnected?: boolean;
  onNewConversationStarted: (conversation: Conversation) => void;
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
  onNewConversationStarted,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const { showToastNotification } = useNotification();
  const [otherUserStatus, setOtherUserStatus] = useState<OtherUserStatus | null>(null);
  const selectedConversationRef = useRef<Conversation | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesPerPage = 50;
  const { tokenData } = useAuth();

  // Helper function to mark messages as read
  const markMessagesAsRead = useCallback(() => {
    if (socket && socketConnected && tokenData?.token && selectedConversationRef.current?.conversation_id) {
      socket.emit('mark_as_read', {
        conversation_id: selectedConversationRef.current.conversation_id,
        token: tokenData.token,
      });
    }
  }, [socket, socketConnected, tokenData]);

  const loadMessages = useCallback(async (conversationId: number, page: number = 1, initialLoad = false) => {
    if (initialLoad) setLoading(true);
    else setLoadingOlder(true);

    try {
      const fetchedMessages = await api.getMessages(conversationId, messagesPerPage, (page - 1) * messagesPerPage);
      const newMessages = fetchedMessages.reverse();

      if (newMessages.length < messagesPerPage) {
        setHasMoreMessages(false);
      }
      setMessages(prevMessages => initialLoad ? newMessages : [...newMessages, ...prevMessages]);
      if (initialLoad) {
        setCurrentPage(1);
        // Mark messages as read after the initial load is successful
        markMessagesAsRead();
      }
    } catch (err: any) {
      showToastNotification(`Error loading messages: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      if (initialLoad) setLoading(false);
      else setLoadingOlder(false);
    }
  }, [messagesPerPage, showToastNotification, markMessagesAsRead]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;

    if (selectedConversation && typeof selectedConversation.conversation_id === 'number') {
      setMessages([]);
      setHasMoreMessages(true);
      setCurrentPage(1);
      loadMessages(selectedConversation.conversation_id, 1, true);

      if (socket && socketConnected && tokenData?.token) {
        socket.emit('join_conversation', {
          conversation_id: selectedConversation.conversation_id,
          token: tokenData.token,
        });
      }

      if (selectedConversation.other_user_id) {
        api.getUserChatStatus(selectedConversation.other_user_id as number)
          .then(setOtherUserStatus)
          .catch(err => {
            console.error("Failed to fetch user status:", err);
            showToastNotification(err.message || 'Failed to load user status', 'error');
            setOtherUserStatus(null);
          });
      } else {
        setOtherUserStatus(null);
      }
    } else if (selectedConversation && selectedConversation.conversation_id === null) {
      setMessages([]);
      setHasMoreMessages(false);
      setCurrentPage(1);
      if (selectedConversation.other_user_id) {
        api.getUserChatStatus(selectedConversation.other_user_id as number)
          .then(setOtherUserStatus)
          .catch(err => {
            console.error("Failed to fetch user status for provisional chat:", err);
            setOtherUserStatus(null);
          });
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

  // *** THIS IS THE MAIN FIX - THE LOOP IS REMOVED ***
  // The old `useEffect` that emitted 'mark_as_read' and depended on `messages` is gone.
  // We now call `markMessagesAsRead()` intentionally at the right times.

  useEffect(() => {
    if (!socket || !socketConnected) return;

    const handleUserOnline = (data: { user_id: number }) => {
      if (data.user_id === selectedConversationRef.current?.other_user_id) {
        setOtherUserStatus(prevStatus => ({ ...prevStatus, is_online: true, last_seen: null }));
      }
    };

    const handleUserOffline = (data: { user_id: number; last_seen: string }) => {
      if (data.user_id === selectedConversationRef.current?.other_user_id) {
        setOtherUserStatus(prevStatus => ({ ...prevStatus, is_online: false, last_seen: data.last_seen }));
      }
    };

    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);

    return () => {
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
    };
  }, [socket, socketConnected]);

  useEffect(() => {
    if (!socket || !socketConnected || !selectedConversation) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.conversation_id === selectedConversationRef.current?.conversation_id) {
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        // When a new message arrives, mark it as read.
        markMessagesAsRead();
      }
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, socketConnected, selectedConversation, markMessagesAsRead]); // Added markMessagesAsRead dependency

  useEffect(() => {
    if (!socket || !socketConnected || !currentUserId) return;

    const handleMessagesReadUpdate = (data: { conversation_id: string | number; reader_id: number; message_ids: number[] }) => {
      const currentConversationId = selectedConversationRef.current?.conversation_id;
      if (currentConversationId === null || currentConversationId === undefined) return;
      
      const receivedConversationId = typeof data.conversation_id === 'string' ? parseInt(data.conversation_id, 10) : data.conversation_id;
      
      if (currentConversationId === receivedConversationId) {
        setMessages(prevMessages =>
          prevMessages.map(msg => 
            data.message_ids.includes(msg.id) && msg.sender_id === currentUserId 
            ? { ...msg, is_read: true } 
            : msg
          )
        );
      }
    };
    
    socket.on('messages_read_update', handleMessagesReadUpdate);

    return () => {
      socket.off('messages_read_update', handleMessagesReadUpdate);
    };
  }, [socket, socketConnected, currentUserId]); // Removed messages from dependencies

  const handleSendMessage = async (messageText: string) => {
    if (!selectedConversation || !currentUserId || !messageText.trim()) return;
    setSending(true);
    try {
      if (selectedConversation.conversation_id === null) {
        if (!selectedConversation.other_user_id) {
            showToastNotification("Error: Recipient user ID is missing.", "error");
            setSending(false);
            return;
        }
        const returnedConversation = await api.startConversationAndSendMessage(
          selectedConversation.other_user_id,
          messageText.trim()
        );
        onNewConversationStarted(returnedConversation);
      } else {
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
        if (!selectedConversation.other_user_id) {
            showToastNotification("Error: Recipient user ID is missing.", "error");
            setSending(false);
            return;
        }
        const uploadResponse = await api.uploadChatFile(file, selectedConversation.other_user_id as number);
        const returnedConversation = await api.startConversationAndSendMessage(
            selectedConversation.other_user_id as number,
            file.name,
            uploadResponse.file_url,
            uploadResponse.file_name,
            uploadResponse.file_type
        );
        onNewConversationStarted(returnedConversation);
      } else {
        const uploadResponse = await api.uploadChatFile(file, selectedConversation.conversation_id);
        await api.sendMessage(
          selectedConversation.conversation_id,
          file.name,
          uploadResponse.file_url,
          uploadResponse.file_name,
          uploadResponse.file_type
        );
      }
    } catch (err: any) {
      showToastNotification(`Error sending file ${file.name}: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setSending(false);
    }
  };
  
  const handleLoadOlder = () => {
    if (selectedConversation && typeof selectedConversation.conversation_id === 'number' && hasMoreMessages && !loadingOlder) {
      const nextPage = currentPage + 1;
      loadMessages(selectedConversation.conversation_id, nextPage, false);
      setCurrentPage(nextPage);
    }
  };

  const headerUsername = selectedConversation?.other_username || "New Chat";
  const headerProfilePic = selectedConversation?.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(headerUsername)}&background=random&size=40&color=fff`;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md">
      <header className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={onGoBack}
            className="p-1.5 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <img
            src={headerProfilePic}
            alt={headerUsername}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
          />
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
              {headerUsername}
            </h2>
            {otherUserStatus && (
              <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                <span className={`h-2 w-2 rounded-full ${otherUserStatus.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span>
                  {otherUserStatus.is_online ? 'Online' : (otherUserStatus.last_seen ? `Last seen ${formatToISTLocaleString(otherUserStatus.last_seen)}` : 'Offline')}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex-1 flex items-center justify-center h-full"><Spinner size="lg" /></div>
        ) : (
          <MessageList
            key={selectedConversation?.conversation_id ?? 'provisional-' + selectedConversation?.other_user_id}
            messages={messages}
            currentUserId={currentUserId}
            onLoadOlderMessages={handleLoadOlder}
            hasMoreOlderMessages={hasMoreMessages} 
            isLoadingOlder={loadingOlder}
          />
        )}
      </div>

      {selectedConversation && (
        <ChatInput
          onSendMessage={handleSendMessage}
          onSendFile={handleSendFile}
          disabled={sending || !socket || !socketConnected}
        />
      )}
    </div>
  );
};

export default ChatWindow;