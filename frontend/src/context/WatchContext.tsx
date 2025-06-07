// frontend/src/context/WatchContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchUserWatchPreferences, updateUserWatchPreferences } from '../services/api';
import type { WatchPreference, UpdateWatchPreferencePayload } from '../types';
import { useAuth } from './AuthContext'; // To react to user login/logout
import { showErrorToast } //, showSuccessToast // Optional: for user feedback
  from '../utils/toastUtils';

interface WatchContextType {
  watchPreferences: WatchPreference[];
  isLoading: boolean;
  error: string | null;
  fetchPreferences: () => Promise<void>;
  updatePreference: (contentType: string, category: string | null, watch: boolean) => Promise<void>;
  isWatching: (contentType: string, category?: string | null) => boolean;
}

const WatchContext = createContext<WatchContextType | undefined>(undefined);

export const WatchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [watchPreferences, setWatchPreferences] = useState<WatchPreference[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuth();

  const fetchPreferences = useCallback(async () => {
    if (!isAuthenticated) {
      setWatchPreferences([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchUserWatchPreferences();
      setWatchPreferences(data || []);
    } catch (err: any) {
      const errorMessage = err.response?.data?.msg || err.message || 'Failed to fetch watch preferences.';
      setError(errorMessage);
      showErrorToast(errorMessage);
      setWatchPreferences([]); // Clear preferences on error
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences, user]); // Re-fetch when user changes (login/logout)

  const updatePreference = async (contentType: string, category: string | null, watch: boolean) => {
    if (!isAuthenticated) {
      showErrorToast("Please log in to update watch preferences.");
      return;
    }
    
    // Construct the payload for a single preference update
    const payload: UpdateWatchPreferencePayload[] = [{ content_type: contentType, category, watch }];
    
    // Optimistic update attempt (optional, or can just refetch)
    // For simplicity, we will refetch after update.
    // More complex: update local state, then revert on error.

    setIsLoading(true); // Indicate loading for the update operation
    setError(null);
    try {
      const response = await updateUserWatchPreferences(payload);
      setWatchPreferences(response.updated_preferences || []); // Update with the latest from backend
      // showSuccessToast(response.message || "Watch preference updated."); // Optional success message
    } catch (err: any) {
      const errorMessage = err.response?.data?.msg || err.message || 'Failed to update watch preference.';
      setError(errorMessage);
      showErrorToast(errorMessage);
      // Potentially refetch or revert optimistic update here if implemented
      await fetchPreferences(); // Refetch to ensure consistency on error
    } finally {
      setIsLoading(false);
    }
  };

  const isWatching = (contentType: string, category?: string | null): boolean => {
    return watchPreferences.some(
      pref => pref.content_type === contentType && (category === undefined || pref.category === category)
    );
  };

  return (
    <WatchContext.Provider value={{ watchPreferences, isLoading, error, fetchPreferences, updatePreference, isWatching }}>
      {children}
    </WatchContext.Provider>
  );
};

export const useWatch = (): WatchContextType => {
  const context = useContext(WatchContext);
  if (context === undefined) {
    throw new Error('useWatch must be used within a WatchProvider');
  }
  return context;
};
