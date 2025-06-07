// frontend/src/components/chat/ConversationList.tsx
import React, { useState, useEffect, useCallback } from 'react'; // <--- ADD useCallback here
import { Conversation } from './types';
// Placeholder for an API service
// import { fetchConversations } from '../../services/api'; 

import { Socket } from 'socket.io-client';
import * as api from '../../services/api'; // Import your API service
import { Message } from './types'; // Import Message type for socket payload

interface ConversationListProps {
  onConversationSelect: (conversation: Conversation) => void;
  currentUserId: number | null;
  socket: Socket | null; // Pass socket instance
  selectedConversationId?: number | null; // To know which conversation is active
}

const ConversationList: React.FC<ConversationListProps> = ({ 
  onConversationSelect, 
  currentUserId, 
  socket,
  selectedConversationId 
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Placeholder fetchConversations function is removed, will use api.getUserConversations
  
  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUserConversations();
      // Backend already sorts by last_message_created_at
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]); // Dependency array for useCallback
  
  useEffect(() => {
    loadConversations();
  }, [loadConversations]); // Dependency array for useEffect

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleNewMessage = (newMessage: Message) => {
      console.log('SocketIO: new_message received in ConversationList', newMessage);
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
    console.log("ConversationList: 'new_message' listener attached.");

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

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      console.log("ConversationList: 'new_message' and 'messages_read' listeners detached.");
    };
  }, [socket, currentUserId, loadConversations, selectedConversationId]);


  if (loading) return <p className="p-4 text-gray-500">Loading conversations...</p>;
  if (error) return <p className="p-4 text-red-500 dark:text-red-400">Error loading conversations: {error}</p>;

  return (
    // Removed border and rounded-lg from here as ChatMain's container will handle overall card look
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800"> 
      {/* Header is now part of ChatMain, so ConversationList is just the list part */}
      {/* <h2 className="text-xl font-semibold p-4 border-b dark:border-gray-700">Conversations</h2> */}
      
      {conversations.length === 0 && !loading && (
        <p className="p-4 text-center text-gray-500 dark:text-gray-400">No conversations yet. Start a new one!</p>
      )}
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <li
            key={conv.conversation_id}
            onClick={() => onConversationSelect(conv)}
            className={`p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors duration-150 ease-in-out ${
              selectedConversationId === conv.conversation_id 
                ? 'bg-blue-100 dark:bg-blue-800' 
                : 'bg-gray-50 dark:bg-gray-800'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="relative">
                <img
                  src={conv.other_profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.other_username)}&background=random&size=40&color=fff`}
                  alt={conv.other_username}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                {/* Future: Online status indicator
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-white dark:ring-gray-800"></span> 
                */}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className={`text-sm font-semibold truncate ${selectedConversationId === conv.conversation_id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'}`}>
                    {conv.other_username}
                  </p>
                  {conv.last_message_created_at && (
                    <p className={`text-xs whitespace-nowrap ${selectedConversationId === conv.conversation_id ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {new Date(conv.last_message_created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className={`text-xs truncate ${selectedConversationId === conv.conversation_id ? 'text-gray-600 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                    {conv.last_message_sender_id === currentUserId ? <span className="font-medium">You: </span> : ''}
                    {conv.last_message_content || <span className="italic">No messages yet</span>}
                  </p>
                  {conv.unread_messages_count && conv.unread_messages_count > 0 && (
                    <span className="ml-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                      {conv.unread_messages_count > 9 ? '9+' : conv.unread_messages_count}
                    </span> // <--- This span needed to be closed
                  )}
                </div>
              </div>
            </div> {/* <--- This div needed to be closed correctly at the end of the li content */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ConversationList;