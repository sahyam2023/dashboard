//src/components/Layout.tsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs'; // Import the new component
import Footer from './Footer'; // Import the new Footer component
import ChatMain from './chat/ChatMain'; // Import ChatMain
import { useAuth } from '../context/AuthContext'; // To get currentUserId

const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false); // State for chat modal
  const { user } = useAuth(); // Get user from AuthContext

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
        <Sidebar collapsed={sidebarCollapsed} onToggleChat={toggleChatModal} />
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
              <ChatMain />
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Layout;