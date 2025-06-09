// frontend/src/components/chat/ConversationList.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from './types';
import { formatToISTLocaleString } from '../../utils/dateUtils';
import { Socket } from 'socket.io-client';
import * as api from '../../services/api';
import Spinner from './Spinner';
import { useNotification } from '../../context/NotificationContext';

interface ConversationListProps {
  onConversationSelect: (conversation: Conversation) => void;
  currentUserId: number | null;
  socket: Socket | null;
  selectedConversationId?: number | null;
  selectionModeEnabled: boolean;
  onToggleSelection: (conversationId: number) => void;
  selectedConversationIds: Set<number>;
  refreshKey?: number;
}

interface FrontendConversation extends Conversation {
  other_user_is_online?: boolean;
  other_user_last_seen?: string | null;
}

const ConversationList: React.FC<ConversationListProps> = ({
  onConversationSelect,
  currentUserId,
  socket,
  selectedConversationId,
  selectionModeEnabled,
  onToggleSelection,
  selectedConversationIds,
  refreshKey,
}) => {
  const [conversations, setConversations] = useState<FrontendConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const { showToastNotification } = useNotification();
  
  // [LOGGING] Add a counter to make logs unique for each API call
  const loadCounter = useRef(0); 

  const loadConversations = useCallback(async () => {
    const callId = loadCounter.current++; // Get a unique ID for this call
    // console.log(`[${callId}] Attempting to load conversations. Is loading? ${isLoadingRef.current}`);

    if (isLoadingRef.current) {
      // console.log(`[${callId}] SKIPPING load: A load is already in progress.`);
      return;
    }
    if (!currentUserId) {
      // console.log(`[${callId}] SKIPPING load: No current user ID.`);
      return;
    }

    // console.log(`[${callId}] STARTING load conversations.`);
    isLoadingRef.current = true;
    setLoading(true);
    
    try {
      const data: Conversation[] = await api.getUserConversations();
      // console.log(`[${callId}] SUCCESS loading conversations. Received ${data.length} items.`, data);

      // [LOGGING] The most important log: Check for duplicates IN THE RAW API DATA
      const conversationIds = data.map(c => c.conversation_id);
      const uniqueIds = new Set(conversationIds);
      if (uniqueIds.size !== conversationIds.length) {
        console.error(`[${callId}] CRITICAL ERROR: API returned duplicate conversation_ids!`, conversationIds);
      }

      const frontendConversations: FrontendConversation[] = data.map(
        (conv: Conversation): FrontendConversation => ({ ...conv })
      );

      // [LOGGING] Log the state *before* and *after* setting it
      setConversations(currentConvs => {
        // console.log(`[${callId}] SETTING conversations state. Previous length: ${currentConvs.length}, New length: ${frontendConversations.length}`);
        return frontendConversations;
      });

    } catch (err: any) {
      console.error(`[${callId}] FAILED loading conversations.`, err);
      showToastNotification(`Error loading conversations: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      // console.log(`[${callId}] FINISHING load conversations. Releasing lock.`);
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [currentUserId, showToastNotification]); 
  
  useEffect(() => {
    // console.log("Component mounted or refreshKey changed. Triggering initial load.");
    loadConversations();
  }, [loadConversations, refreshKey]);

  // Online/Offline handlers are fine
  const handleUserOnline = useCallback((data: { user_id: number }) => {
    setConversations(prevConvs =>
      prevConvs.map(conv =>
        conv.other_user_id === data.user_id ? { ...conv, other_user_is_online: true, other_user_last_seen: null } : conv
      )
    );
  }, []);

  const handleUserOffline = useCallback((data: { user_id: number; last_seen: string }) => {
    setConversations(prevConvs =>
      prevConvs.map(conv =>
        conv.other_user_id === data.user_id ? { ...conv, other_user_is_online: false, other_user_last_seen: data.last_seen } : conv
      )
    );
  }, []);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    // [LOGGING] Add logs to the socket listeners
    const handleNewConversationStarted = (newConversation: Conversation) => {
      // console.log("SOCKET EVENT: 'new_conversation_started' received.", newConversation);
      loadConversations();
    };
    socket.on('new_conversation_started', handleNewConversationStarted);

    const handleNewMessage = (newMessage: Message) => {
      // console.log("SOCKET EVENT: 'new_message' received.", newMessage);
      setConversations(prevConvs => {
        const convIndex = prevConvs.findIndex(c => c.conversation_id === newMessage.conversation_id);

        if (convIndex === -1) {
          // console.log(`Ignoring 'new_message' for unknown conversation ID: ${newMessage.conversation_id}. Waiting for reload.`);
          return prevConvs;
        }

        const updatedConvs = [...prevConvs];
        const originalConv = updatedConvs[convIndex];
        const updatedConv = {
          ...originalConv,
          last_message_content: newMessage.content,
          last_message_created_at: newMessage.created_at,
          last_message_sender_id: newMessage.sender_id,
          last_message_id: newMessage.id,
          unread_messages_count:
            (newMessage.sender_id !== currentUserId && originalConv.conversation_id !== selectedConversationId)
              ? (originalConv.unread_messages_count || 0) + 1
              : (originalConv.conversation_id === selectedConversationId ? 0 : (originalConv.unread_messages_count || 0)),
        };
        
        updatedConvs.splice(convIndex, 1);
        updatedConvs.unshift(updatedConv);
        
        return updatedConvs;
      });
    };
    socket.on('new_message', handleNewMessage);
    
    const handleUnreadCleared = (data: { conversation_id: number; }) => {
        setConversations(prevConvs =>
          prevConvs.map(c =>
            c.conversation_id === data.conversation_id ? { ...c, unread_messages_count: 0 } : c
          )
        );
    };
    socket.on('unread_cleared', handleUnreadCleared);
    
    const handleMessagesReadUpdate = (data: { conversation_id: string | number; reader_id: number; message_ids: number[] }) => {
      const targetConversationId = typeof data.conversation_id === 'string' ? parseInt(data.conversation_id, 10) : data.conversation_id;
      setConversations(prevConvs =>
        prevConvs.map(convo => {
          if (
            convo.conversation_id === targetConversationId &&
            convo.last_message_sender_id === currentUserId &&
            convo.last_message_id &&
            data.message_ids.includes(convo.last_message_id)
          ) {
            return { ...convo, last_message_is_read: true };
          }
          return convo;
        })
      );
    };
    socket.on('messages_read_update', handleMessagesReadUpdate);
    
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    
    return () => {
      socket.off('new_conversation_started', handleNewConversationStarted);
      socket.off('new_message', handleNewMessage);
      socket.off('unread_cleared', handleUnreadCleared);
      socket.off('messages_read_update', handleMessagesReadUpdate);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
    };
  }, [socket, currentUserId, selectedConversationId, loadConversations, handleUserOnline, handleUserOffline]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800">
      {conversations.length === 0 && !loading && (
        <p className="p-4 text-center text-gray-500 dark:text-gray-400">No conversations yet. Start a new one!</p>
      )}
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 flex-1 overflow-y-auto">
        {conversations.map((conv) => {
          const isSelected = typeof conv.conversation_id === 'number' ? selectedConversationIds.has(conv.conversation_id) : false;
          return (
            <li key={conv.conversation_id ?? `provisional-${conv.other_user_id}`} className="flex items-center">
              <label
                htmlFor={`checkbox-${conv.conversation_id ?? conv.other_user_id}`}
                className={`w-full p-3 flex items-center space-x-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 ease-in-out ${
                  selectionModeEnabled ? 'cursor-pointer' : ''
                } ${
                  selectionModeEnabled && isSelected
                    ? 'bg-green-100 dark:bg-green-800'
                    : selectedConversationId === conv.conversation_id
                    ? 'bg-blue-100 dark:bg-blue-800'
                    : 'bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={(e) => {
                  if (!selectionModeEnabled) {
                    onConversationSelect(conv);
                  }
                }}
              >
                {selectionModeEnabled && typeof conv.conversation_id === 'number' && (
                  <input
                    type="checkbox"
                    id={`checkbox-${conv.conversation_id}`}
                    checked={isSelected}
                    onChange={() => {
                      if (typeof conv.conversation_id === 'number') {
                        onToggleSelection(conv.conversation_id);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:bg-gray-700"
                  />
                )}
                <div className="relative">
                  <img
                    src={conv.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.other_username)}&background=random&size=40&color=fff`}
                    alt={conv.other_username}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  {conv.other_user_is_online !== undefined && (
                    <span
                      className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-800
                                  ${conv.other_user_is_online ? 'bg-green-400' : 'bg-gray-400'}`}
                    ></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${
                        selectionModeEnabled && isSelected 
                          ? 'text-green-700 dark:text-green-300' 
                          : selectedConversationId === conv.conversation_id 
                          ? 'text-blue-700 dark:text-blue-300' 
                          : 'text-gray-800 dark:text-gray-100'
                      }`}>
                        {conv.other_username}
                      </p>
                    </div>
                    {conv.last_message_created_at && (
                      <p className={`text-xs whitespace-nowrap ml-2 ${
                        selectionModeEnabled && isSelected
                          ? 'text-green-500 dark:text-green-400'
                          : selectedConversationId === conv.conversation_id 
                          ? 'text-blue-500 dark:text-blue-400' 
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {formatToISTLocaleString(conv.last_message_created_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center">
                      {conv.last_message_sender_id === currentUserId && (
                        <span className="mr-1">
                          {conv.last_message_is_read ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 dark:text-blue-400"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-gray-500"><path d="M20 6 9 17l-5-5"/></svg>
                          )}
                        </span>
                      )}
                      <p className={`text-xs truncate ${
                        selectionModeEnabled && isSelected
                          ? 'text-gray-700 dark:text-gray-300'
                          : selectedConversationId === conv.conversation_id 
                          ? 'text-gray-600 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {conv.last_message_sender_id === currentUserId ? <span className="font-medium">You: </span> : ''}
                        {conv.last_message_content || <span className="italic">No messages yet</span>}
                      </p>
                    </div>
                    {conv.unread_messages_count && conv.unread_messages_count > 0 && !(selectionModeEnabled && isSelected) && (
                      <span className="ml-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                        {conv.unread_messages_count > 9 ? '9+' : conv.unread_messages_count}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ConversationList;