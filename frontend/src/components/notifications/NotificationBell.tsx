// src/components/notifications/NotificationBell.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, XCircle, MailQuestion } from 'lucide-react'; // MailQuestion for empty state
import { useNotification } from '../../context/NotificationContext';
import type { Notification } from '../../types'; // Ensure path is correct
import { formatDistanceToNow } from 'date-fns'; // For relative time

const NotificationBell: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchUserNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    refreshUnreadCount, // Added to refresh on open if needed
  } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentNotifications, setCurrentNotifications] = useState<Notification[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const PER_PAGE = 5; // Number of notifications per page in the dropdown

  useEffect(() => {
    // Close dropdown if clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async (page: number) => {
    setIsFetchingMore(true);
    try {
      const response = await fetchUserNotifications(page, PER_PAGE, 'all'); // Fetch all, filter client-side or rely on backend
      if (response) {
        setCurrentNotifications(prev => page === 1 ? response.notifications : [...prev, ...response.notifications]);
        setTotalPages(response.total_pages);
        setCurrentPage(page);
      }
    } catch (e) {
      // Error is handled by context, but local feedback could be added
      console.error("Error loading notifications in bell:", e);
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleToggleDropdown = () => {
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    if (newIsOpen) {
      setCurrentNotifications([]); // Clear previous
      setCurrentPage(1); // Reset to first page
      loadNotifications(1); // Load first page
      refreshUnreadCount(); // Good idea to refresh count when opening
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    await markAsRead(notificationId);
    // Optimistically update UI or wait for notifications list to refresh
    setCurrentNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
  };

  const handleMarkAllReadAndClose = async () => {
    await markAllAsRead();
    setIsOpen(false); // Close dropdown after action
  };

  const handleClearAllAndClose = async () => {
    await clearAll();
    setCurrentNotifications([]); // Clear local state
    setIsOpen(false); // Close dropdown
  };

  const handleLoadMore = () => {
    if (currentPage < totalPages && !isFetchingMore) {
      loadNotifications(currentPage + 1);
    }
  };
  
  // Function to generate a link for a notification (basic example)
  const getNotificationLink = (notification: Notification): string | undefined => {
    if (!notification.item_type || notification.item_id === null || typeof notification.item_id === 'undefined') {
      return undefined;
    }
    // This is a simplified example. You'll need a more robust way to generate links
    // based on your application's routing structure.
    switch (notification.item_type) {
      case 'comment':
        // Ideally, you'd link to the comment itself or the item the comment is on.
        // This might require more info (e.g., parent item's ID and type for a comment).
        // For now, just a placeholder.
        return `/some-item-view/${notification.item_id}`; // Placeholder
      case 'document':
        return `/documents?highlight=${notification.item_id}`; // Example
      case 'patch':
        return `/patches?highlight=${notification.item_id}`; // Example
      // Add other item types as needed
      default:
        return undefined;
    }
  };


  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggleDropdown}
        className="relative p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`View notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-4 w-4 transform -translate-y-1/2 translate-x-1/2 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl z-50 max-h-[70vh] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Notifications</h3>
          </div>

          {isLoading && currentNotifications.length === 0 && <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>}
          {error && <div className="p-4 text-center text-red-500">Error: {error.message}</div>}
          
          {!isLoading && !error && currentNotifications.length === 0 && (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center">
              <MailQuestion size={48} className="mb-3 text-gray-400 dark:text-gray-500" />
              <p className="text-sm">You have no notifications.</p>
            </div>
          )}

          {currentNotifications.length > 0 && (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 overflow-y-auto flex-grow">
              {currentNotifications.map(notification => (
                <li key={notification.id} className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${notification.is_read ? 'opacity-70' : ''}`}>
                  <a 
                    href={getNotificationLink(notification) || '#'} 
                    onClick={(e) => {
                      if (!notification.is_read) {
                        handleMarkAsRead(notification.id);
                      }
                      // If getNotificationLink returns '#', prevent default to avoid page jump
                      if (!getNotificationLink(notification)) e.preventDefault(); 
                    }}
                    className="block"
                    target={getNotificationLink(notification) ? "_blank" : "_self"} // Open in new tab if actual link
                    rel={getNotificationLink(notification) ? "noopener noreferrer" : ""}
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-sm text-gray-700 dark:text-gray-300 break-words mr-2">{notification.message}</p>
                      {!notification.is_read && (
                        <span className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="Unread"></span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </a>
                </li>
              ))}
               {isFetchingMore && <li className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">Loading more...</li>}
               {!isFetchingMore && currentPage < totalPages && (
                <li className="p-2 text-center">
                  <button
                    onClick={handleLoadMore}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
                  >
                    Load More
                  </button>
                </li>
              )}
            </ul>
          )}
          
          {currentNotifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-between items-center">
                <button
                  onClick={handleMarkAllReadAndClose}
                  disabled={isLoading || unreadCount === 0}
                  className="text-xs sm:text-sm px-3 py-1.5 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <CheckCheck size={16} className="mr-1.5" /> Mark all as read
                </button>
                <button
                  onClick={handleClearAllAndClose}
                  disabled={isLoading}
                  className="text-xs sm:text-sm px-3 py-1.5 rounded-md text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <XCircle size={16} className="mr-1.5" /> Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
