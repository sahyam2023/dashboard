// src/components/Header.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, X, LogOut, User, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext'; // Import useTheme
import { IconButton } from '@mui/material'; // Import IconButton
import Brightness4Icon from '@mui/icons-material/Brightness4'; // Dark mode icon
import Brightness7Icon from '@mui/icons-material/Brightness7'; // Light mode icon

interface HeaderProps {
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onSearch: (term: string) => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isCollapsed, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const { user, isAuthenticated, logout, openAuthModal } = useAuth(); // Updated
  const navigate = useNavigate();
  const { themeMode, toggleThemeMode } = useTheme(); // Theme context

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // REMOVE: onSearch(searchValue); 
    if (searchValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const clearSearch = () => {
    setSearchValue('');
    // REMOVE: onSearch('');
    // Optional: Navigate away from search results if currently there
    // This depends on desired UX, for now, just clear the input.
    // if (location.pathname === '/search') navigate('/documents'); 
  };

  const handleLogout = () => {
    logout(); // Call logout from auth context
    navigate('/'); // 
 // Redirect to login page after logout
  };

  return (
    <header aria-label="Page header" className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-30">
      <div className="px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Left Section: Toggle and Title */}
        <div className="flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 mr-2 md:mr-4 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={24} />
          </button>
          <Link to="/" className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors hidden sm:block focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 rounded-sm">
            Dashboard
          </Link>
        </div>

        {/* Center Section: Search Bar */}
        <div className="flex-1 flex justify-center px-4">
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-lg"
          >
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400 dark:text-gray-500" />
              </div>
              <input
                type="text"
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label="Clear search"
                >
                  <X size={18} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Section: Auth Controls & Theme Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3"> {/* Adjusted space-x for new icon button */}
          <IconButton 
            sx={{ ml: 1, color: 'text.primary' }} // Use theme text color
            onClick={toggleThemeMode} 
            aria-label={themeMode === 'dark' ? 'Activate light mode' : 'Activate dark mode'}
          >
            {themeMode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
          {isAuthenticated ? (
            <>
              <span className="hidden sm:inline text-gray-700 dark:text-gray-300 font-medium">
                Welcome, {user?.username || 'Guest'}!
              </span>
              <Link
                to="/profile"
                className="hidden sm:flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 rounded-sm"
                title="User Profile"
                aria-label="User Profile" 
              >
                <User size={18} className="mr-1.5 text-gray-500 dark:text-gray-400" />
                <span className="hidden lg:inline">{user?.username}</span>
              </Link>
              <Link
                to="/profile"
                className="sm:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                aria-label="User Profile"
              >
                <User size={22} />
              </Link>
              {user?.role === 'super_admin' && ( 
                <Link
                  to="/superadmin"
                  className="px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 hidden md:inline-flex items-center focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 dark:focus:ring-red-400" 
                  title="Super Admin Dashboard"
                  aria-label="Super Admin Dashboard"
                >
                  Super Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                aria-label="Logout"
              >
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => openAuthModal('login')}
                className="hidden sm:inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-500 dark:focus:ring-gray-400"
                aria-label="Login or Sign Up"
              >
                 <LogIn size={16} className="mr-1.5" />
                Login / Sign Up
              </button>
              <button
                onClick={() => openAuthModal('login')}
                className="sm:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Login / Sign Up"
              >
                <LogIn size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;