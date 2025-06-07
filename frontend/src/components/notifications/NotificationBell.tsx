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
  
  // Function to generate a link for a notification
  const getNotificationLink = (notification: Notification): string | undefined => {
    if (!notification.type) return undefined; // No type, no specific link

    // Handle announcement notifications
    if (notification.type === 'announcement' && notification.item_type === 'announcement') {
      // Announcements don't link anywhere specific, clicking just marks them read.
      // Return '#' or undefined to allow onClick to fire without navigation.
      return '#';
    }

    // Handle new content posted notifications
    if (notification.type === 'new_content_posted' || notification.type === 'content_updated') {
      if (notification.content_type && notification.item_id) {
        let basePath = '';
        switch (notification.content_type) {
          case 'documents': basePath = '/documents'; break;
          case 'patches': basePath = '/patches'; break;
          case 'links': basePath = '/links'; break;
          case 'misc': basePath = '/misc'; break; // Assuming /misc is the route for misc_file list
          default:
            console.warn(`Unknown content_type for new_content_posted notification: ${notification.content_type}`);
            return undefined; // Or a general link
        }
        
        let queryParams = `?item_id=${notification.item_id}`;
        if (notification.category) {
          // Assuming category in notification corresponds to a filter key, e.g., 'doc_type' for documents, or 'software_name' for patches/links
          // This part might need adjustment based on actual filtering keys used in each view.
          // For 'documents', category might be 'doc_type'.
          // For 'patches'/'links', category might be 'software_name' (which might need to be mapped to software_id for filtering).
          // For simplicity, let's assume a generic 'category' query param for now, or adjust per content_type.
          if (notification.content_type === 'documents') {
            queryParams += `&doc_type=${encodeURIComponent(notification.category)}`;
          } else if (notification.content_type === 'patches' || notification.content_type === 'links') {
            // Assuming the category is the software name. The frontend pages might need to handle filtering by this name.
            queryParams += `&software_name=${encodeURIComponent(notification.category)}`;
          }
          // For 'misc', category is null, so no category query param.
        }
        return `${basePath}${queryParams}`;
      }
    }

    // Handle comment-related notifications (reply, mention)
    if ((notification.type === 'reply' || notification.type === 'mention') && notification.item_type === 'comment') {
      if (notification.original_item_type && typeof notification.original_item_id === 'number' && typeof notification.item_id === 'number') {
        let pluralType = '';
        switch (notification.original_item_type) {
          case 'document': pluralType = 'documents'; break;
          case 'patch': pluralType = 'patches'; break;
          case 'link': pluralType = 'links'; break;
          case 'misc_file': pluralType = 'misc'; break;
          case 'software': pluralType = 'software'; break;
          case 'version': pluralType = 'versions'; break;
          default:
            console.warn(`Unknown original_item_type for comment notification: ${notification.original_item_type}`);
            return undefined;
        }
        return `/${pluralType}?item_id=${notification.original_item_id}&comment_id=${notification.item_id}`;
      } else {
        console.warn('Comment notification is missing original item type/ID or comment ID:', notification);
        return undefined;
      }
    }
    
    // Fallback for older direct item notifications if any (or other types)
    // This logic might need to be deprecated or adjusted if all notifications adopt the new structure.
    if (notification.item_type && notification.item_id) {
        let basePath = '';
        switch (notification.item_type) {
            case 'document': basePath = '/documents'; break;
            case 'patch': basePath = '/patches'; break;
            case 'link': basePath = '/links'; break;
            case 'misc_file': basePath = '/misc'; break;
            case 'software': basePath = '/software'; break;
            case 'version': basePath = '/versions'; break;
            // Ensure 'announcement' is not in this switch
            default: 
                console.warn(`Unhandled item_type in fallback: ${notification.item_type}`);
                return undefined;
        }
        return `${basePath}?item_id=${notification.item_id}`;
    }

    console.warn(`Could not determine link for notification:`, notification);
    return undefined; // Default undefined if no specific link can be generated
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
                      if (getNotificationLink(notification) === '#') e.preventDefault();
                    }}
                    className="block"
                    target="_self" // Always open in the same tab for internal navigation
                    // rel attribute removed as it's not needed for _self
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
