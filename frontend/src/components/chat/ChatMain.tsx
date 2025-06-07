// frontend/src/components/chat/ChatMain.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { User, Conversation, Message, PaginatedUsersResponse } from './types';
import UserList from './UserList';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import { io, Socket } from 'socket.io-client';

import { useAuth } from '../../context/AuthContext'; // Import useAuth
import * as api from '../../services/api'; // Import your API service

// No longer need MOCK_CURRENT_USER_ID

const ChatMain: React.FC = () => {
  const [currentView, setCurrentView] = useState<'conversations' | 'users' | 'chat'>('conversations');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const { user, tokenData } = useAuth(); // Get user and tokenData from AuthContext
  const currentUserId = user?.id || null;
  const authToken = tokenData?.token || null; // Get auth token

  const [socket, setSocket] = useState<Socket | null>(null);

  // Placeholder createConversationAPI (will be replaced by api.createConversation)
  // No longer need the placeholder createConversationAPI, will use api.createConversation directly

  useEffect(() => {
    if (!currentUserId || !authToken) { // Don't connect if user is not logged in
      console.log('ChatMain: User not authenticated, Socket.IO connection deferred.');
      return;
    }

    // Initialize Socket.IO connection
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:7000', {
      auth: { token: authToken } // Send token for connection authentication
      // query: { token: authToken } // Alternative way to send token
    });

    setSocket(newSocket);
    console.log('Socket.IO: Attempting to connect with auth token...');

    newSocket.on('connect', () => {
      console.log('Socket.IO: Connected! SID:', newSocket.id);
      // If selectedConversation exists, try to rejoin room (e.g., after a disconnect/reconnect)
      // This join logic is now primarily in ChatWindow based on selectedConversation
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO: Disconnected. Reason:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO: Connection Error!', error);
    });

    // Global listeners for errors or other events can be here if needed
    // Example:
    // newSocket.on('join_error', (data) => {
    //   console.error('Socket.IO: Global join_error listener:', data.error, 'for conv_id:', data.conversation_id);
    // });
    // newSocket.on('joined_conversation_success', (data) => {
    //     console.log('Socket.IO: Global joined_conversation_success listener for conv_id:', data.conversation_id);
    // });

    // Cleanup on component unmount
    return () => {
      if (newSocket.connected) {
        console.log('Socket.IO: Disconnecting on ChatMain unmount.');
        newSocket.disconnect();
      }
    };
  }, [currentUserId, authToken]); // Re-run if userId or token changes (e.g., on login/logout)

  const handleUserSelect = async (selectedUser: User) => {
    if (!currentUserId) {
      console.error("Current user not set, cannot start conversation.");
      return;
    }
    if (selectedUser.id === currentUserId) {
      console.log("Cannot start a conversation with yourself.");
      return;
    }
    try {
      const conversation = await api.createConversation(selectedUser.id);
      setSelectedConversation(conversation);
      setCurrentView('chat');
      // TODO: Consider how ConversationList should refresh or be updated.
      // For now, it fetches on its own mount/currentUserId change.
      // A more reactive way would be to update a shared state or trigger a refetch.
    } catch (error) {
      console.error('Failed to start conversation:', error);
      // TODO: Show error to user via toast or message
    }
  };

  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setCurrentView('chat');
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
    setCurrentView('conversations');
  };

  const handleStartNewChat = () => {
    setCurrentView('users');
  };

  return (
    // Changed h-screen to h-full to fit within modal constraints
    <div className="flex h-full font-sans antialiased text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800">
      {/* Sidebar for Conversation List or User List */}
      <div className={`w-full md:w-1/3 lg:w-1/4 xl:w-1/5 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col
        ${(currentView === 'chat' && selectedConversation) ? 'hidden md:flex' : 'flex'}`}
      >
        {currentView === 'users' ? (
          <>
            <div className="p-3 border-b">
              <button
                onClick={() => setCurrentView('conversations')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                &larr; Back to Conversations
              </button>
            </div>
            <UserList onUserSelect={handleUserSelect} />
          </>
        ) : (
          <>
            <div className="p-3 border-b flex justify-between items-center">
              <h1 className="text-xl font-bold">My Chats</h1>
              <button
                onClick={handleStartNewChat}
                title="Start new chat"
                className="p-2 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>
            <ConversationList
              onConversationSelect={handleConversationSelect}
              currentUserId={currentUserId}
              socket={socket} // Pass socket
              selectedConversationId={selectedConversation?.conversation_id} // Pass selected ID
            />
          </>
        )}
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${(currentView === 'chat' && selectedConversation) ? 'flex' : 'hidden md:flex'}`}>
        {selectedConversation && currentView === 'chat' ? (
          <ChatWindow
            selectedConversation={selectedConversation}
            currentUserId={currentUserId}
            socket={socket} // Pass the socket instance
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full bg-gray-50 text-gray-400">
            {currentView !== 'users' && <p className="text-lg">Select a conversation or start a new chat.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMain;
