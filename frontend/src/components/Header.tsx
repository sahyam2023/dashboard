//src/components/Header.tsx
import React, { useState } from 'react';
import { Menu, Search, X } from 'lucide-react';

interface HeaderProps {
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onSearch: (term: string) => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isCollapsed, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchValue);
  };

  const clearSearch = () => {
    setSearchValue('');
    onSearch('');
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
      <div className="px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 mr-4 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
        </div>

        <form 
          onSubmit={handleSubmit} 
          className={`relative flex-1 max-w-lg mx-6 transition-all duration-200 ${
            isFocused ? 'sm:max-w-2xl' : ''
          }`}
        >
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {searchValue && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </form>
        
        <div className="flex items-center space-x-2">
          {/* User profile or other header actions could go here */}
        </div>
      </div>
    </header>
  );
};

export default Header;