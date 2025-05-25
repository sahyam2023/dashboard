// src/components/Header.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // <-- Import Link and useNavigate
import { Menu, Search, X, LogOut, User, LogIn } from 'lucide-react'; // <-- Import LogOut, User, LogIn icons
import { useAuth } from '../context/AuthContext'; // <-- Import useAuth hook (adjust path if needed)

interface HeaderProps {
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onSearch: (term: string) => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isCollapsed, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const { isAuthenticated, username, role, logout, openAuthModal } = useAuth(); // <-- Added openAuthModal
  const navigate = useNavigate(); // <-- Hook for navigation

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
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30"> {/* Increased z-index */}
      <div className="px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Left Section: Toggle and Title */}
        <div className="flex items-center">
          <button
            onClick={toggleSidebar}
            className="p-2 mr-2 md:mr-4 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={24} />
          </button>
          {/* Link title back to dashboard home */}
          <Link to="/" className="text-2xl font-bold text-indigo-600 hover:text-indigo-700 transition-colors hidden sm:block">
            Dashboard
          </Link>
        </div>

        {/* Center Section: Search Bar */}
        <div className="flex-1 flex justify-center px-4">
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-lg" // Use max-w instead of fixed flex-1 for better centering
          >
            <div className="relative">
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
                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label="Clear search"
                >
                  <X size={18} className="text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Section: Auth Controls */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {isAuthenticated ? (
            <>
              {/* Welcome Message */}
              <span className="hidden sm:inline text-gray-700 font-medium">
                Welcome, {username}!
              </span>
              {/* User Profile Link */}
              <Link
                to="/profile"
                className="hidden sm:flex items-center text-sm font-medium text-gray-700 hover:text-indigo-600"
                title="User Profile"
              >
                <User size={18} className="mr-1.5 text-gray-500" />
                <span className="hidden lg:inline">{username}</span> {/* Show full username on larger screens */}
              </Link>
              {/* Mobile User Profile Icon Link */}
              <Link
                to="/profile"
                className="sm:hidden p-2 rounded-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                aria-label="User Profile"
              >
                <User size={22} />
              </Link>
              {/* Super Admin Link */}
              {role === 'super_admin' && ( 
                <Link
                  to="/superadmin"
                  className="px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 hidden md:inline-flex items-center"
                  title="Super Admin Dashboard"
                >
                  Super Admin
                </Link>
              )}
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                aria-label="Logout"
              >
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <>
              {/* Login / Sign Up Button */}
              <button
                onClick={() => openAuthModal('login')}
                className="hidden sm:inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                 <LogIn size={16} className="mr-1.5" />
                Login / Sign Up
              </button>
              {/* Mobile Login / Sign Up Icon Button */}
              <button
                onClick={() => openAuthModal('login')}
                className="sm:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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