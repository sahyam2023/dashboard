//src/components/Layout.tsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs'; // Import the new component
import Footer from './Footer'; // Import the new Footer component

const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    // In a real app, you might want to navigate to a search results page
    // or pass the search term to child components
    console.log(`Searching for: ${term}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header 
        toggleSidebar={toggleSidebar} 
        isCollapsed={sidebarCollapsed}
        onSearch={handleSearch}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />
        <main 
          className={`flex-1 p-6 overflow-auto transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'ml-20' : 'ml-64'
          }`}
        >
          <div className="container mx-auto">
            <Breadcrumbs /> {/* Add Breadcrumbs here */}
            <Outlet context={{ searchTerm }} />
          </div>
        </main>
      </div>
      <Footer /> {/* Add Footer here */}
    </div>
  );
};

export default Layout;