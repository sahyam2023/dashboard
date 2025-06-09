// frontend/src/components/chat/ConversationList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Conversation, Message } from './types'; // Message might be needed if we directly use its fields for last_message_id
import { formatToISTLocaleString } from '../../utils/dateUtils'; // Import the utility
// Placeholder for an API service
// import { fetchConversations } from '../../services/api'; 

import { Socket } from 'socket.io-client';
import * as api from '../../services/api'; // Import your API service
import Spinner from './Spinner'; // Import Spinner
import { useNotification } from '../../context/NotificationContext'; // Import useNotification

interface ConversationListProps {
  onConversationSelect: (conversation: Conversation) => void;
  currentUserId: number | null;
  socket: Socket | null; // Pass socket instance
  selectedConversationId?: number | null; // To know which conversation is active
  selectionModeEnabled: boolean;
  onToggleSelection: (conversationId: number) => void;
  selectedConversationIds: Set<number>;
  refreshKey?: number; // Added refreshKey prop
}

// Add is_online and last_seen to the Conversation type locally for frontend state
// This might differ from the backend `types.ts` if not yet updated there.
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
  refreshKey, // Destructure refreshKey
}) => {
  const [conversations, setConversations] = useState<FrontendConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToastNotification } = useNotification(); // Corrected to use showToastNotification

  // Placeholder fetchConversations function is removed, will use api.getUserConversations
  
  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const data: Conversation[] = await api.getUserConversations(); // Ensure 'data' is typed as Conversation[]
      const frontendConversations: FrontendConversation[] = data.map(
        (conv: Conversation): FrontendConversation => ({ // Explicitly type 'conv' and the return type of map
          ...conv,
          // other_user_is_online and other_user_last_seen will be implicitly undefined
          // if not part of the 'conv' object, which is fine for optional fields in FrontendConversation.
        })
      );
      setConversations(frontendConversations);
    } catch (err: any) {
      showToastNotification(`Error loading conversations: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, showToastNotification]); 
  
  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshKey]); // Added refreshKey to dependency array

  // Handler for user_online event
  const handleUserOnline = useCallback((data: { user_id: number }) => {
    // console.log('SocketIO: user_online event received in ConversationList', data);
    setConversations(prevConvs =>
      prevConvs.map(conv =>
        conv.other_user_id === data.user_id ? { ...conv, other_user_is_online: true, other_user_last_seen: null } : conv
      )
    );
  }, []);

  // Handler for user_offline event
  const handleUserOffline = useCallback((data: { user_id: number; last_seen: string }) => {
    // console.log('SocketIO: user_offline event received in ConversationList', data);
    setConversations(prevConvs =>
      prevConvs.map(conv =>
        conv.other_user_id === data.user_id ? { ...conv, other_user_is_online: false, other_user_last_seen: data.last_seen } : conv
      )
    );
  }, []);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleNewMessage = (newMessage: Message) => {
      // console.log('SocketIO: new_message received in ConversationList', newMessage);
      setConversations(prevConvs => {
        const updatedConvs = prevConvs.map(conv => {
          if (conv.conversation_id === newMessage.conversation_id) {
            const newUnreadCount = 
              (newMessage.sender_id !== currentUserId && conv.conversation_id !== selectedConversationId) 
              ? (conv.unread_messages_count || 0) + 1 
              : (conv.conversation_id === selectedConversationId ? 0 : (conv.unread_messages_count || 0) ); 
              // If current user is viewing this convo, unread becomes 0 (or handled by markAsRead)

            return {
              ...conv,
              last_message_content: newMessage.content,
              last_message_created_at: newMessage.created_at,
              last_message_sender_id: newMessage.sender_id,
              unread_messages_count: newUnreadCount,
            };
          }
          return conv;
        });
        // Sort again after update
        return updatedConvs.sort((a, b) => 
          new Date(b.last_message_created_at || 0).getTime() - new Date(a.last_message_created_at || 0).getTime()
        );
      });
      // Alternative: Refetch all conversations for simplicity if granular update is too complex
      // loadConversations(); 
    };

    socket.on('new_message', handleNewMessage);
    // console.log("ConversationList: 'new_message' listener attached.");

    // Listener for when messages in a conversation are read by current user (e.g., by opening ChatWindow)
    // This is useful if ChatWindow marks messages as read and ConversationList needs to update unread count.
    // This requires ChatWindow or another component to emit such an event, or a more global state.
    // For now, this is a simple example.
    const handleMessagesRead = (data: { conversationId: number }) => {
        if (data.conversationId) {
            setConversations(prevConvs => 
                prevConvs.map(c => 
                    c.conversation_id === data.conversationId ? { ...c, unread_messages_count: 0 } : c
                )
            );
        }
    };
    socket.on('messages_read', handleMessagesRead); // Assume 'messages_read' is emitted by client/server when read

    const handleUnreadCleared = (data: { conversation_id: number; messages_marked_read: number }) => {
      // console.log('SocketIO: unread_cleared received in ConversationList', data);
      if (data.conversation_id) {
        setConversations(prevConvs =>
          prevConvs.map(c =>
            c.conversation_id === data.conversation_id ? { ...c, unread_messages_count: 0 } : c
          )
        );
        // Optionally, re-sort if order might change due to unread count (though typically doesn't affect main sort order)
      }
    };
    socket.on('unread_cleared', handleUnreadCleared);
    // console.log("ConversationList: 'unread_cleared' listener attached.");

    const handleNewConversationStarted = (newConversation: Conversation) => {
      // console.log('SocketIO: new_conversation_started received in ConversationList', newConversation);
      // Add to the beginning of the list and re-sort (though adding to beginning often implies newest)
      setConversations(prevConvs => {
        // Avoid adding duplicates if event is somehow received multiple times
        if (prevConvs.find(c => c.conversation_id === newConversation.conversation_id)) {
          return prevConvs;
        }
        const updatedConvs = [newConversation, ...prevConvs];
        // Ensure sorting is still correct (backend sends sorted, but adding at front is usually fine)
        // The main sort key is last_message_created_at, new convos might not have this or have it as conv.created_at
        return updatedConvs.sort((a, b) =>
          new Date(b.last_message_created_at || b.created_at || 0).getTime() -
          new Date(a.last_message_created_at || a.created_at || 0).getTime()
        );
      });
    };
    socket.on('new_conversation_started', handleNewConversationStarted);
    // console.log("ConversationList: 'new_conversation_started' listener attached.");

    // Listeners for global online/offline events
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    // console.log("ConversationList: 'user_online' and 'user_offline' listeners attached.");

    const handleMessagesReadUpdate = (data: { conversation_id: string | number; reader_id: number; message_ids: number[] }) => {
      // console.log('ConversationList: messages_read_update received', data);
      const targetConversationId = typeof data.conversation_id === 'string' ? parseInt(data.conversation_id, 10) : data.conversation_id;
      
      setConversations(prevConversations => 
        prevConversations.map(convo => {
          if (
            convo.conversation_id === targetConversationId &&
            convo.last_message_sender_id === currentUserId && // Message was sent by me
            convo.last_message_id && // The conversation has a last_message_id tracked
            data.message_ids.includes(convo.last_message_id) // And this specific last message is among those read
          ) {
            // console.log(`ConversationList: Updating last message read status for conversation ${targetConversationId}`);
            return { ...convo, last_message_is_read: true, unread_messages_count: 0 };
          }
          return convo;
        })
      );
    };

    socket.on('messages_read_update', handleMessagesReadUpdate);
    // console.log("ConversationList: 'messages_read_update' listener attached.");

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('unread_cleared', handleUnreadCleared);
      socket.off('new_conversation_started', handleNewConversationStarted);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('messages_read_update', handleMessagesReadUpdate); // Detach the new listener
      // console.log("ConversationList: All event listeners detached.");
    };
  }, [socket, currentUserId, loadConversations, selectedConversationId, handleUserOnline, handleUserOffline, setConversations]); // Added setConversations


  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }
  // Error display is handled by toast notifications

  return (
    // Removed border and rounded-lg from here as ChatMain's container will handle overall card look
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800"> 
      {/* Header is now part of ChatMain, so ConversationList is just the list part */}
      {/* <h2 className="text-xl font-semibold p-4 border-b dark:border-gray-700">Conversations</h2> */}
      
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
                    ? 'bg-green-100 dark:bg-green-800' // Style for selected items in selection mode
                    : selectedConversationId === conv.conversation_id
                    ? 'bg-blue-100 dark:bg-blue-800' // Style for active (opened) conversation
                    : 'bg-gray-50 dark:bg-gray-800'
                }`}
                // The onClick for opening the conversation when not in selection mode
                // can be placed here on the label.
                onClick={(e) => {
                  if (!selectionModeEnabled) {
                    onConversationSelect(conv);
                  }
                  // If selectionModeEnabled, the label's click will toggle the checkbox,
                  // which in turn calls onToggleSelection via its onChange.
                  // No need to call onToggleSelection here directly from the label's onClick.
                }}
              >
                {selectionModeEnabled && typeof conv.conversation_id === 'number' && (
                  <input
                    type="checkbox"
                    id={`checkbox-${conv.conversation_id}`} // Use actual ID for checkbox
                    checked={isSelected} // isSelected already handles null id case
                    onChange={() => {
                      // Guard is already here due to outer conditional, but being explicit for safety
                      if (typeof conv.conversation_id === 'number') {
                        onToggleSelection(conv.conversation_id);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()} // Prevent label's onClick when checkbox is directly clicked
                    // This might be necessary if the label's onClick has other side effects
                    // For now, let's assume direct checkbox click is fine.
                    // onClick={(e) => e.stopPropagation()} 
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:bg-gray-700"
                  />
                )}
                {/* Conversation Info Container - This part remains clickable for opening chat when not in selection mode */}
                {/* The label wrapping this makes the whole area part of the "for" attribute */}
                <div className="relative"> {/* This div and its children are now part of the label */}
                  <img
                    src={conv.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.other_username)}&background=random&size=40&color=fff`}
                    alt={conv.other_username}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  {/* Online status indicator */}
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