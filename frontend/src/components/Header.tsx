// src/components/Header.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, X, LogOut, User, LogIn, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './notifications/NotificationBell';

interface HeaderProps {
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onSearch: (term: string) => void; // Assuming onSearch might still be used elsewhere or for other purposes
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isCollapsed, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const { themeMode, toggleThemeMode } = useTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const clearSearch = () => {
    setSearchValue('');
    // Optional: if onSearch was used to clear results, ensure that's handled
    // if (location.pathname.startsWith('/search')) navigate('/documents'); // Example
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header aria-label="Page header" className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-30">
      <div className="px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Left Section: Toggle and Title */}
        <div className="flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 mr-2 md:mr-4 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={24} />
          </button>
          <Link to="/" className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors hidden sm:block focus:outline-none rounded-sm">
            CtrlDash
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
        <div className="flex items-center space-x-2 sm:space-x-3">
          <NotificationBell />
          <button
            onClick={toggleThemeMode}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors"
            title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {isAuthenticated ? (
            <>
              <span className="hidden sm:inline text-gray-700 dark:text-gray-300 font-medium">
                Welcome {user?.username || ''},
              </span>
              {/* Profile link for larger screens */}
              <Link
                to="/profile"
                className="group hidden sm:flex items-center justify-center rounded-full p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors"
                title="User Profile"
                aria-label="User Profile"
              >
                {user?.profile_picture_url ? (
                  <img
                    src={user.profile_picture_url}
                    alt={`${user?.username || 'User'}'s profile picture`}
                    className="h-8 w-8 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500 dark:group-hover:border-indigo-400 transition-colors"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500 dark:group-hover:border-indigo-400 transition-colors">
                    <User size={24} className="text-gray-500 dark:text-gray-400" />
                  </div>
                )}
              </Link>
              {/* Profile link for smaller screens */}
              <Link
                to="/profile"
                className="group sm:hidden flex items-center justify-center rounded-full p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors"
                aria-label="User Profile"
              >
                {user?.profile_picture_url ? (
                  <img
                    src={user.profile_picture_url}
                    alt={`${user?.username || 'User'}'s profile picture`}
                    className="h-7 w-7 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500 dark:group-hover:border-indigo-400 transition-colors"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500 dark:group-hover:border-indigo-400 transition-colors">
                    <User size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                )}
              </Link>
              {user?.role === 'super_admin' && (
                <Link
                  to="/superadmin"
                  className="px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 hidden md:inline-flex items-center focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 dark:focus:ring-offset-gray-800 dark:focus:ring-red-400"
                  title="Super Admin Dashboard"
                  aria-label="Super Admin Dashboard"
                >
                  Super Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 transition-colors"
                aria-label="Logout"
              >
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => openAuthModal('login')}
                className="hidden sm:inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-500 dark:focus:ring-offset-gray-800 dark:focus:ring-gray-400"
                aria-label="Login or Sign Up"
              >
                <LogIn size={16} className="mr-1.5" />
                Login / Sign Up
              </button>
              <button
                onClick={() => openAuthModal('login')}
                className="sm:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-500 dark:focus:ring-offset-gray-800"
                aria-label="Login or Sign Up"
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