// frontend/src/context/FavoritesContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext'; // To check authentication status
import {
  fetchUserFavoriteIds,
  addFavorite as apiAddFavorite,
  removeFavorite as apiRemoveFavorite,
  // Ensure FavoriteIdentifier is exported from api.ts or define it here
} from '../services/api'; // Adjust path as needed

// If FavoriteIdentifier is not exported from api.ts or a global types file, define it here.
// For this task, assuming it might not be, so including it.
export interface FavoriteIdentifier {
  item_id: number;
  item_type: string;
}

interface FavoritesContextType {
  favoriteIds: FavoriteIdentifier[];
  addFavoriteItem: (itemId: number, itemType: string) => Promise<void>;
  removeFavoriteItem: (itemType: string, itemId: number) => Promise<void>;
  isFavorited: (itemId: number, itemType: string) => boolean;
  isLoadingFavorites: boolean;
  refreshFavorites: () => void; // Added for explicit refresh
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<FavoriteIdentifier[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavoriteIds([]); // Clear favorites if not authenticated
      setIsLoadingFavorites(false); // Ensure loading is false if not authenticated
      return;
    }
    setIsLoadingFavorites(true);
    try {
      const data = await fetchUserFavoriteIds();
      setFavoriteIds(data || []);
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
      setFavoriteIds([]); // Clear on error too
      // Optionally set an error state to show a toast/message, e.g., using a toast library
      // showErrorToast("Failed to load your favorites.");
    } finally {
      setIsLoadingFavorites(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]); // loadFavorites dependency includes isAuthenticated

  const addFavoriteItem = async (itemId: number, itemType: string) => {
    try {
      await apiAddFavorite(itemId, itemType);
      setFavoriteIds(prev => {
        // Avoid adding duplicates if already present (e.g., due to rapid clicks)
        if (!prev.some(fav => fav.item_id === itemId && fav.item_type === itemType)) {
          return [...prev, { item_id: itemId, item_type: itemType }];
        }
        return prev;
      });
      // showSuccessToast(`${itemType} added to favorites`); // Example toast
    } catch (error) {
      console.error("Failed to add favorite:", error);
      // showErrorToast(`Failed to add ${itemType} to favorites`); // Example toast
      throw error; // Re-throw for component-level handling if needed
    }
  };

  const removeFavoriteItem = async (itemType: string, itemId: number) => {
    try {
      await apiRemoveFavorite(itemType, itemId);
      setFavoriteIds(prev => prev.filter(fav => !(fav.item_id === itemId && fav.item_type === itemType)));
      // showSuccessToast(`${itemType} removed from favorites`); // Example toast
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      // showErrorToast(`Failed to remove ${itemType} from favorites`); // Example toast
      throw error; // Re-throw
    }
  };

  const isFavorited = (itemId: number, itemType: string): boolean => {
    return favoriteIds.some(fav => fav.item_id === itemId && fav.item_type === itemType);
  };
  
  const refreshFavorites = useCallback(() => { // useCallback for refreshFavorites
    loadFavorites();
  }, [loadFavorites]);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, addFavoriteItem, removeFavoriteItem, isFavorited, isLoadingFavorites, refreshFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
