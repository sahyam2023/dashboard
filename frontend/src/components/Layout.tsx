//src/components/Layout.tsx
import React, { useState, useEffect } from 'react'; // useEffect was already imported
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs'; // Import the new component
import Footer from './Footer'; // Import the new Footer component
import ChatMain from './chat/ChatMain'; // Import ChatMain
import { useAuth } from '../context/AuthContext'; // To get currentUserId
import { useChatActions } from '../context/ChatActionContext'; // Import useChatActions
import { io, Socket } from 'socket.io-client'; // Import socket.io-client

const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // const [isChatOpen, setIsChatOpen] = useState(false); // Removed local state
  const { user, tokenData } = useAuth(); // Get user and tokenData from AuthContext
  const { 
    isChatModalOpen, 
    openChatWithUser, 
    closeChatModal, 
    targetUser 
  } = useChatActions(); // Get values from ChatActionContext

  const [socket, setSocket] = useState<Socket | null>(null); // Socket state
  const [socketConnected, setSocketConnected] = useState(false); // New state for socket connection status

  useEffect(() => {
    if (user && tokenData?.token) {
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:7000', {
        auth: { token: tokenData.token }
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setSocketConnected(true);
        // console.log('Layout.tsx: Socket connected. SID:', newSocket.id);
        newSocket.emit('join_user_channel');
        // console.log('Layout.tsx: Emitted "join_user_channel" to server.'); // <<< ADD THIS LINE
      });

      newSocket.on('disconnect', (reason) => {
        setSocketConnected(false);
        console.log('Layout.tsx: Socket disconnected. Reason:', reason);
      });

      newSocket.on('connect_error', (error) => {
        setSocketConnected(false); // Also set to false on connection error
        console.error('Socket.IO connection error in Layout:', error);
      });

      return () => {
        if (newSocket.connected) {
          console.log('Socket.IO disconnecting in Layout cleanup.');
          newSocket.disconnect();
        }
        setSocket(null);
        setSocketConnected(false);
      };
    } else {
      // If user logs out or token becomes unavailable, disconnect and clear socket
      if (socket && socket.connected) {
        console.log('Socket.IO disconnecting in Layout due to user logout/token removal.');
        socket.disconnect(); // This will trigger the 'disconnect' event above, setting socketConnected to false
      }
      setSocket(null); // Explicitly set socket to null
      setSocketConnected(false); // Explicitly set connected status to false
    }
  }, [user, tokenData]); // Removed 'socket' from dependency array as it's managed within this effect

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  // const toggleChatModal = () => { // Removed local toggle function
  //   setIsChatOpen(prev => !prev);
  // };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    console.log(`Searching for: ${term}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header 
        toggleSidebar={toggleSidebar} 
        isCollapsed={sidebarCollapsed}
        onSearch={handleSearch}
        // Consider adding a chat toggle button to Header as well or instead of Sidebar
      />
      <div className="flex flex-1 overflow-hidden relative"> {/* Added relative for modal positioning context */}
        {/* Updated onToggleChat to use openChatWithUser(null) for generic open */}
        <Sidebar collapsed={sidebarCollapsed} onToggleChat={() => openChatWithUser(null)} socket={socket} socketConnected={socketConnected} />
        <main 
          className={`flex-1 p-6 overflow-auto transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'ml-20' : 'ml-64' // Adjust based on actual sidebar width
          }`}
        >
          <div className="container mx-auto">
            <Breadcrumbs />
            <Outlet context={{ searchTerm }} />
          </div>
        </main>

        {/* Chat Modal/Overlay */}
        {/* Updated rendering condition to use isChatModalOpen */}
        {isChatModalOpen && user && ( 
          <div
            className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-40"
            onClick={closeChatModal} // Close on overlay click using context function
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-11/12 max-w-7xl h-[90vh] sm:h-[90vh] md:max-h-[750px] lg:max-h-[850px] flex flex-col overflow-hidden" // Updated size classes
              onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking inside modal
            >
              <div className="flex justify-between items-center p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Chat</h2>
                <button
                  onClick={closeChatModal} // Close button uses context function
                  className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  aria-label="Close chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden"> {/* Added this wrapper */}
                {/* Pass targetUser and other necessary props to ChatMain */}
                <ChatMain 
                  socket={socket} 
                  socketConnected={socketConnected} 
                  targetUser={targetUser} // Pass targetUser from context
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Layout;