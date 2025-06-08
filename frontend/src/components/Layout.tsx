//src/components/Layout.tsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs'; // Import the new component
import Footer from './Footer'; // Import the new Footer component
import ChatMain from './chat/ChatMain'; // Import ChatMain
import { useAuth } from '../context/AuthContext'; // To get currentUserId
import { io, Socket } from 'socket.io-client'; // Import socket.io-client
import { useEffect } from 'react'; // Import useEffect

const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false); // State for chat modal
  const { user, tokenData } = useAuth(); // Get user and tokenData from AuthContext
  const [socket, setSocket] = useState<Socket | null>(null); // Socket state

  useEffect(() => {
    if (user && tokenData?.token) {
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:7000', {
        auth: { token: tokenData.token }
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket.IO connected in Layout:', newSocket.id);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected in Layout. Reason:', reason);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket.IO connection error in Layout:', error);
      });

      return () => {
        if (newSocket.connected) {
          console.log('Socket.IO disconnecting in Layout cleanup.');
          newSocket.disconnect();
        }
        setSocket(null);
      };
    } else {
      // If user logs out or token becomes unavailable, disconnect and clear socket
      if (socket && socket.connected) {
        console.log('Socket.IO disconnecting in Layout due to user logout/token removal.');
        socket.disconnect();
      }
      setSocket(null);
    }
  }, [user, tokenData]);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const toggleChatModal = () => {
    setIsChatOpen(prev => !prev);
  };

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
        <Sidebar collapsed={sidebarCollapsed} onToggleChat={toggleChatModal} socket={socket} />
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
        {isChatOpen && user && (
          <div
            className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-40"
            onClick={toggleChatModal} // Close on overlay click
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] md:max-h-[700px] lg:max-h-[800px] flex flex-col overflow-hidden" // Adjusted height constraints
              onClick={(e) => e.stopPropagation()} // Prevent modal close when clicking inside modal
            >
              <div className="flex justify-between items-center p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Chat</h2>
                <button
                  onClick={toggleChatModal}
                  className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  aria-label="Close chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Pass currentUserId which ChatMain expects as MOCK_CURRENT_USER_ID for now */}
              {/* ChatMain internally uses a MOCK_CURRENT_USER_ID, which is fine for now */}
              {/* We pass user.id to ChatMain if it's adapted to take it as a prop later */}
              <ChatMain socket={socket} /> {/* Pass socket to ChatMain */}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Layout;