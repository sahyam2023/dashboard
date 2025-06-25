// src/components/Header.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, X, LogOut, User, LogIn, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './notifications/NotificationBell';
import { fetchSearchSuggestions, Suggestion } from '../services/api'; // Added

interface HeaderProps {
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onSearch: (term: string) => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar, isCollapsed, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null); // Ref for the search container

  const { user, isAuthenticated, logout, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const { themeMode, toggleThemeMode } = useTheme();

  const handleSubmit = (e?: React.FormEvent, navigationValue?: string) => {
    if (e) e.preventDefault();
    const termToSearch = navigationValue || searchValue;
    if (termToSearch.trim()) {
      navigate(`/search?q=${encodeURIComponent(termToSearch.trim())}`);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const clearSearch = () => {
    setSearchValue('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // Clear search input and hide suggestions immediately
    setSearchValue('');
    setSuggestions([]);
    setShowSuggestions(false);

    const { id, type, software_id, name, page_number } = suggestion; // Added page_number
    const pageQuery = page_number ? `page=${page_number}&` : ''; // Construct page query part

    switch (type) {
      case 'document':
        navigate(`/documents?${pageQuery}highlight=${id}`);
        break;
      case 'patch':
        navigate(`/patches?${pageQuery}highlight=${id}`);
        break;
      case 'link':
        navigate(`/links?${pageQuery}highlight=${id}`);
        break;
      case 'misc_file':
        navigate(`/misc?${pageQuery}highlight=${id}`);
        break;
      case 'software':
        // Software itself doesn't have a page_number in this context, link to its main view or documents
        navigate(`/documents?software_id=${id}`); // Or a dedicated software page if exists
        break;
      case 'version':
        // Versions are context-dependent. Assuming patches view is primary for versions.
        // Page number for a version itself might not be directly applicable unless it's about a specific patch for that version.
        // If backend provides page_number for a specific item (like a patch) related to this version, use it.
        // For now, keeping it simple, linking to patches for that software/version.
        if (software_id) {
          navigate(`/patches?software_id=${software_id}&version_id=${id}`);
        } else {
          console.warn(`Software ID missing for version suggestion: ${name}`);
          navigate(`/search?q=${encodeURIComponent(name)}`);
        }
        break;
      default:
        navigate(`/search?q=${encodeURIComponent(name)}`);
        break;
    }
  };

  // Debounced fetch function
  const debouncedFetchSuggestions = useCallback((term: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(async () => {
      if (term.trim().length >= 2) {
        setIsSuggestionsLoading(true);
        console.log(`[Autocomplete] Debounced: Fetching suggestions for term: "${term}"`); // DEBUG
        try {
          const fetchedSuggestions = await fetchSearchSuggestions(term);
          console.log("[Autocomplete] Fetched suggestions:", fetchedSuggestions); // DEBUG
          setSuggestions(fetchedSuggestions);
          setShowSuggestions(true); // Show suggestions when they are fetched
        } catch (error) {
          console.error("[Autocomplete] Failed to fetch search suggestions:", error); // DEBUG
          setSuggestions([]);
          setShowSuggestions(false); // Hide on error
        } finally {
          setIsSuggestionsLoading(false);
        }
      } else {
        console.log(`[Autocomplete] Debounced: Term "${term}" too short, clearing suggestions.`); // DEBUG
        setSuggestions([]);
        setShowSuggestions(false); // Hide if term is too short
      }
    }, 300); // 300ms debounce delay
  }, []); // Empty dependency array means this function is created once

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchValue(term);
    if (term.trim().length >= 2) {
      debouncedFetchSuggestions(term);
    } else {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Effect to handle clicks outside the search suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (debounceTimeoutRef.current) { // Clear timeout on unmount
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);


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
        <div className="flex-1 flex justify-center px-4" ref={searchContainerRef}>
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
                onChange={handleSearchInputChange}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true);}}
                // onBlur={() => setTimeout(() => setShowSuggestions(false), 100)} // Delay to allow click on suggestion
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
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-60 overflow-auto">
                {isSuggestionsLoading ? (
                  <li className="px-4 py-2 text-gray-500 dark:text-gray-400">Loading...</li>
                ) : (
                  suggestions.map((suggestion, index) => (
                    <li
                      key={`${suggestion.id}-${index}`}
                      onMouseDown={(e) => { // Use onMouseDown to fire before onBlur on input
                        e.preventDefault(); // Prevent input from losing focus immediately
                        handleSuggestionClick(suggestion);
                      }}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-sm text-gray-700 dark:text-gray-200"
                    >
                      {suggestion.name}
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({suggestion.type})</span>
                    </li>
                  ))
                )}
              </ul>
            )}
             {showSuggestions && !isSuggestionsLoading && suggestions.length === 0 && searchValue.length >= 2 && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-lg p-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No suggestions found.</p>
                </div>
            )}
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