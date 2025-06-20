// frontend/src/components/chat/ChatMain.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { User, Conversation } from './types'; // User type is already imported
// ChatActionContext import is removed as the component will no longer provide it.
// It will consume the context via useChatActions if needed, or receive props.

// REMOVED: module-level (window as any).triggerOpenChat = null;

import UserList from './UserList';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import { Socket } from 'socket.io-client';

import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';
import ConfirmationModal from '../shared/ConfirmationModal';
import { useNotification } from '../../context/NotificationContext'; // Import useNotification

interface ChatMainProps {
  socket: Socket | null; 
  socketConnected?: boolean; // Add socketConnected prop
  targetUser: User | null; // Add targetUser prop
}

const ChatMain: React.FC<ChatMainProps> = ({ socket, socketConnected, targetUser }) => { // Destructure props
  const [currentView, setCurrentView] = useState<'conversations' | 'users' | 'chat'>('conversations');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const { user } = useAuth(); // Get user from AuthContext (tokenData not needed here directly for socket)
  const currentUserId = user?.id || null;

  // States for "Start New Chat" confirmation (ensure these are present if subtask was reverted)
  // For this subtask, we assume no confirmation modal is present as per prior revert.
  // If confirmation modal logic was here, window.triggerOpenChat would also trigger it.

  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const { showToastNotification } = useNotification(); // For toast notifications
  const [conversationListRefreshKey, setConversationListRefreshKey] = useState<number>(0); // Added state for refresh key
  const [onlineUsersCount, setOnlineUsersCount] = useState<number | null>(null);

  // authToken is not directly used here anymore as socket is initialized by parent

  // const [socket, setSocket] = useState<Socket | null>(null); // Socket is now a prop

  // Placeholder createConversationAPI (will be replaced by api.createConversation)
  // No longer need the placeholder createConversationAPI, will use api.createConversation directly

  // useEffect for socket initialization is removed as socket is passed as a prop.
  // Parent component (Layout.tsx) will manage the socket connection lifecycle.

  useEffect(() => {
    if (socket && socketConnected) {
      const handleOnlineUsersCount = (data: { count: number }) => {
        // console.log('ChatMain: Socket event "online_users_count" received:', data);
        setOnlineUsersCount(data.count);
      };
      socket.on('online_users_count', handleOnlineUsersCount);
      // console.log("ChatMain: 'online_users_count' listener attached.");

      return () => {
        socket.off('online_users_count', handleOnlineUsersCount);
        // console.log("ChatMain: 'online_users_count' listener detached.");
      };
    } else {
      setOnlineUsersCount(null); // Reset if socket is not available or connected
      // console.log('ChatMain: online_users_count listener - socket not available or not connected.');
    }
  }, [socket, socketConnected]);

const handleUserSelect = useCallback(async (selectedUser: User) => {
  const currentUserIdFromHook = user?.id;
  if (!currentUserIdFromHook) {
    console.error("Current user not set, cannot start conversation.");
    showToastNotification("Error: Current user not identified.", "error");
    return;
  }
  if (selectedUser.id === currentUserIdFromHook) {
    showToastNotification("You cannot start a conversation with yourself.", "info");
    return;
  }

  try {
    // console.log(`ChatMain: Attempting to find conversation with user ID: ${selectedUser.id}`);
    const existingConversation = await api.findConversationByUserId(selectedUser.id);
    // console.log('ChatMain: Result from findConversationByUserId:', existingConversation);

    if (existingConversation && typeof existingConversation.conversation_id === 'number') {
      // console.log('ChatMain: Existing conversation found, setting it:', existingConversation);
      setSelectedConversation(existingConversation);
      setCurrentView('chat');
      return; 
    } else if (existingConversation) {
      // console.warn('ChatMain: findConversationByUserId returned a truthy but invalid object. Proceeding with provisional.', existingConversation);
    }
    // console.log('ChatMain: No valid existing conversation found, creating provisional.');

  } catch (error: any) {
    console.error('ChatMain: Error trying to find/validate existing conversation:', error);
    showToastNotification("Could not check for existing conversations. Starting a new chat window.", "warning");
  }

  const provisionalConversation: Conversation = {
    conversation_id: null,
    user1_id: currentUserIdFromHook,
    user2_id: selectedUser.id,
    other_user_id: selectedUser.id,
    other_username: selectedUser.username,
    other_profile_picture_url: selectedUser.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser.username)}&background=random&color=fff`,
    last_message_content: null,
    last_message_created_at: null,
    last_message_sender_id: null,
    unread_messages_count: 0,
    created_at: new Date().toISOString(),
    other_profile_picture: selectedUser.profile_picture_filename || null,
  };
  // console.log('ChatMain: Setting provisional conversation:', provisionalConversation);
  setSelectedConversation(provisionalConversation);
  setCurrentView('chat');
}, [user, showToastNotification]); // Dependencies: user, showToastNotification. api assumed stable.

  // useEffect to handle targetUser prop changes
  useEffect(() => {
    if (targetUser) {
      // If a targetUser is provided (e.g., from a user profile click),
      // automatically select that user for a chat.
      handleUserSelect(targetUser);
    } else {
      // If targetUser is null (e.g., chat opened from sidebar icon without specific user),
      // ensure no chat is automatically selected, defaulting to conversation list or user list view.
      // This might involve resetting selectedConversation if a chat was previously open,
      // or ensuring currentView is 'conversations' or 'users'.
      // However, if the modal is simply opened and targetUser is null,
      // existing logic should already show the conversation list.
      // If a chat was open and then targetUser becomes null (e.g. modal closed and reopened generically),
      // we might want to reset the view.
      // For now, if targetUser is null, we don't take explicit action here,
      // relying on the existing view logic. If the modal is simply opened, currentView should be 'conversations'.
    }
  }, [targetUser, handleUserSelect]);

  // REMOVED: useEffect hook that set up (window as any).triggerOpenChat

  const handleNewConversationStarted = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    // Optionally, trigger a refresh of the conversation list if it doesn't pick up the new one automatically
    setConversationListRefreshKey(prevKey => prevKey + 1); 
  };

  const handleConversationSelect = (conversation: Conversation) => {
    if (!selectionMode) {
      setSelectedConversation(conversation);
      setCurrentView('chat');
    }
  };
  
  const handleToggleSelectionMode = () => {
    setSelectionMode(prevMode => {
      if (prevMode) { // Turning off selection mode
        setSelectedIds(new Set()); 
      }
      return !prevMode;
    });
  };

  const handleInitiateClearSelected = () => {
    if (selectedIds.size > 0) {
      setShowClearConfirmModal(true);
    } else {
      // console.log("No conversations selected to clear.");
    }
  };

  const confirmClearSelected = async () => {
    if (selectedIds.size === 0) {
      showToastNotification("No conversations selected to clear.", "info");
      setShowClearConfirmModal(false);
      return;
    }

    try {
      // Convert Set to Array for the API call
      const idsToClear = Array.from(selectedIds);
      await api.clearBatchConversations(idsToClear);

      // On successful API response:
      // This part needs access to the full conversations list to filter it.
      // Assuming ConversationList manages its own state, we can't directly update it here.
      // For now, we'll log a message and rely on a potential future refetch or event.
      // A more robust solution would involve lifting conversation state or using a global state manager.
      // console.log(`Successfully cleared ${idsToClear.length} conversations. ConversationList will need to refresh.`);
      setConversationListRefreshKey(prevKey => prevKey + 1); // Trigger refresh in ConversationList
      
      // If selectedConversation was one of those cleared, reset it.
      if (selectedConversation && typeof selectedConversation.conversation_id === 'number' && selectedIds.has(selectedConversation.conversation_id)) {
        setSelectedConversation(null);
        // Optionally, switch view back to conversation list if a chat was open
        // setCurrentView('conversations'); 
      }

      showToastNotification(`${selectedIds.size} conversation(s) cleared successfully.`, "success");
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (error: any) {
      console.error("Failed to clear conversations:", error);
      const errorMessage = error.response?.data?.message || error.message || "Failed to clear conversations. Please try again.";
      showToastNotification(errorMessage, "error");
      // Keep selection mode and selected IDs for retry
    } finally {
      setShowClearConfirmModal(false);
    }
  };

  const cancelClearSelected = () => {
    setShowClearConfirmModal(false);
  };

  const handleToggleConversationSelection = useCallback((conversationId: number) => {
    setSelectedIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(conversationId)) {
        newIds.delete(conversationId);
      } else {
        newIds.add(conversationId);
      }
      return newIds;
    });
  }, []);

  const handleBackToList = () => {
    setSelectedConversation(null);
    setCurrentView('conversations');
  };

  // const handleDeselectConversation = () => { // Not needed, handleBackToList does the job
  //   setSelectedConversation(null);
  //   // setCurrentView might also need to be 'conversations' or similar
  // };

  const handleStartNewChat = () => {
    setCurrentView('users');
  };

  // REMOVED: The context value and ChatActionContext.Provider wrapper.
  // This component no longer provides this context.

  return (
    // REMOVED: ChatActionContext.Provider from here
    // Changed h-screen to h-full to fit within modal constraints
    <div className="flex h-full font-sans antialiased text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800">
      {/* Sidebar for Conversation List or User List */}
      <div className={`w-full md:w-2/5 lg:w-1/3 xl:w-1/4 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col
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
          <div className="p-3 border-b dark:border-gray-700">
            {/* Online Users Count Display - NEW POSITION */}
            {currentView === 'conversations' && onlineUsersCount !== null && onlineUsersCount > 0 && !selectionMode && (
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-2"> {/* Note class changes */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {onlineUsersCount} Online
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-xl font-bold">My Chats</h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleToggleSelectionMode}
                  title={selectionMode ? "Cancel Selection" : "Select Conversations"}
                  className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {/* Icon can change based on selectionMode */}
                  {selectionMode ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7V3m0 14V3m0 14H6m3 0h6" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleStartNewChat}
                  title="Start new chat"
                  className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
            </div>
            {(currentView === 'conversations' || currentView === 'chat') && selectionMode && selectedIds.size > 0 && (
              <div className="mt-2">
                <button
                  onClick={handleInitiateClearSelected}
                  className="w-full px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                >
                  Clear Selected ({selectedIds.size})
                </button>
              </div>
            )}
          </div>
          <ConversationList
            onConversationSelect={handleConversationSelect}
            currentUserId={currentUserId}
            socket={socket} // Pass socket
            selectedConversationId={selectedConversation?.conversation_id} // Pass selected ID
            selectionModeEnabled={selectionMode}
            selectedConversationIds={selectedIds}
            onToggleSelection={handleToggleConversationSelection}
            refreshKey={conversationListRefreshKey} // Pass refresh key
          />
        </>
      )}
    </div>

    {/* Main Chat Area */}
    {/* Adjusted md:flex to ensure it shows up correctly when a chat is selected */}
    <div className={`flex-1 flex flex-col ${ (currentView === 'chat' && selectedConversation && !selectionMode) ? 'flex' : 'hidden md:flex'}`}>
      {selectedConversation && currentView === 'chat' && !selectionMode ? ( 
        <ChatWindow
          selectedConversation={selectedConversation}
          currentUserId={currentUserId}
          socket={socket} // Pass the socket instance
          socketConnected={socketConnected} // Pass socketConnected status
          onGoBack={handleBackToList} // Pass the callback function
          onNewConversationStarted={handleNewConversationStarted} // Pass the new callback
        />
      ) : (
        <div className="flex-1 flex items-center justify-center h-full bg-gray-50 dark:bg-gray-800">
          {currentView !== 'users' && !selectionMode && ( // Added !selectionMode here
            <p className="text-gray-400 dark:text-gray-300 text-lg">
              Select a conversation or start a new chat.
            </p>
          )}
          {selectionMode && ( // Message to show when selection mode is active
               <p className="text-gray-400 dark:text-gray-300 text-lg p-4 text-center">
                  Selection mode active. Choose conversations from the list. <br/> Click "Cancel Selection" to exit selection mode.
               </p>
          )}
        </div>
      )}
    </div>
    <ConfirmationModal
      isOpen={showClearConfirmModal}
      title="Clear Selected Conversations?"
      message={`Are you sure you want to clear the selected ${selectedIds.size} conversation(s)? This action will only clear your side of the conversation and cannot be undone.`}
      confirmButtonText="Clear"
      cancelButtonText="Cancel"
      onConfirm={confirmClearSelected}
      onCancel={cancelClearSelected}
      confirmButtonVariant="danger"
    />
    </div>
    // REMOVED: Closing </ChatActionContext.Provider>
  );
};

export default ChatMain;
