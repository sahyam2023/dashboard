// src/context/NotificationContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead as apiMarkNotificationAsRead,
  markAllNotificationsAsRead as apiMarkAllNotificationsAsRead,
  clearAllNotifications as apiClearAllNotifications,
} from '../services/api';
import type { Notification, PaginatedNotificationsResponse } from '../types'; // Ensure this path is correct
import { useAuth } from './AuthContext'; // To only run when authenticated

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;
  fetchUserNotifications: (page?: number, perPage?: number, status?: 'all' | 'read' | 'unread') => Promise<PaginatedNotificationsResponse | undefined>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  clearNotificationsState: () => void; // Function to clear local notification state
  // Added for toast-style notifications
  showToastNotification: (message: string, type: ToastNotificationType) => void; 
}

// Type for generic toast notifications
export type ToastNotificationType = 'success' | 'error' | 'info' | 'warning';

interface ToastNotification {
  id: number;
  message: string;
  type: ToastNotificationType;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const { isAuthenticated } = useAuth();

  // State for toast-style notifications
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);

  const POLLING_INTERVAL = 60000; // 60 seconds

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      // No need to set isLoading for background refresh of count
      const response = await fetchUnreadNotificationCount();
      setUnreadCount(response.count);
    } catch (err) {
      console.error('Failed to refresh unread notification count:', err);
      // Don't set global error for background refresh failure
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshUnreadCount(); // Initial fetch
      const intervalId = setInterval(refreshUnreadCount, POLLING_INTERVAL);
      return () => clearInterval(intervalId);
    } else {
      // If user logs out, clear notifications and count
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, refreshUnreadCount]);

  const fetchUserNotifications = async (
    page: number = 1, 
    perPage: number = 10, 
    status: 'all' | 'read' | 'unread' = 'all'
  ): Promise<PaginatedNotificationsResponse | undefined> => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchNotifications(page, perPage, status);
      // If fetching 'all' or 'unread' for a main view, update the local notifications state.
      // This might need adjustment based on how notifications are displayed (e.g., a separate view vs. dropdown)
      // For now, let's assume this function is primarily for a dedicated notifications view/dropdown.
      setNotifications(response.notifications); 
      // Unread count is primarily managed by refreshUnreadCount, but if fetching 'unread', we could update it too.
      // However, the main source of truth for the badge should be refreshUnreadCount.
      return response;
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError(err as Error);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    if (!isAuthenticated) return;
    try {
      const updatedNotification = await apiMarkNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      // Decrement unread count if the notification was indeed unread
      // This is an optimistic update; refreshUnreadCount will provide the source of truth.
      // Only decrement if the notification was previously unread before this action
      // This requires knowing the previous state or checking updatedNotification.
      // For simplicity, we'll rely on refreshUnreadCount to correct it soon.
      // A more precise optimistic update would check:
      // const notificationToUpdate = notifications.find(n => n.id === notificationId);
      // if (notificationToUpdate && !notificationToUpdate.is_read) {
      //   setUnreadCount(prev => Math.max(0, prev - 1));
      // }
      // For now, a simpler optimistic update, or just rely on backend refresh:
      await refreshUnreadCount(); // Refresh count from backend
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      setError(err as Error); // Show error for direct actions
    }
  };

  const markAllAsRead = async () => {
    if (!isAuthenticated) return;
    try {
      await apiMarkAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0); // Optimistic update
      // await refreshUnreadCount(); // Refresh count from backend - already called by markAsRead if that's used, or can be called here too
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      setError(err as Error);
    }
  };

  const clearAll = async () => {
    if (!isAuthenticated) return;
    try {
      await apiClearAllNotifications();
      setNotifications([]);
      setUnreadCount(0); // Optimistic update
    } catch (err) {
      console.error('Failed to clear all notifications:', err);
      setError(err as Error);
    }
  };

  const clearNotificationsState = () => {
    setNotifications([]);
    setUnreadCount(0);
    setError(null);
    setIsLoading(false);
  };

  // Function to show a toast-style notification
  const showToastNotification = (message: string, type: ToastNotificationType) => {
    const newToastNotification = {
      id: Date.now(), // Simple ID generation
      message,
      type,
    };
    setToastNotifications(prev => [...prev, newToastNotification]);
    // Auto-remove notification after some time
    setTimeout(() => {
      removeToastNotification(newToastNotification.id);
    }, 5000); // Remove after 5 seconds
  };

  const removeToastNotification = (id: number) => {
    setToastNotifications(prev =>
      prev.filter(notification => notification.id !== id)
    );
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications, // For persistent notifications
        unreadCount,
        isLoading,
        error,
        fetchUserNotifications,
        refreshUnreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
        clearNotificationsState,
        showToastNotification, // For toast-style notifications
      }}
    >
      {children}
      {/* Conceptual: Rendering toast notifications */}
      {/* This part would typically be a separate component that consumes toastNotifications state */}
      {/*
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toastNotifications.map(toast => (
          <div
            key={toast.id}
            className={`p-4 rounded-md shadow-lg text-white ${
              toast.type === 'success' ? 'bg-green-500' :
              toast.type === 'error' ? 'bg-red-500' :
              toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500' // info
            }`}
            onClick={() => removeToastNotification(toast.id)} // Allow dismissing by click
          >
            {toast.message}
          </div>
        ))}
      </div>
      */}
    </NotificationContext.Provider>
  );
};
