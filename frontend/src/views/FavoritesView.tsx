import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, FileText, Puzzle, Link2 as LinkIcon, Archive as FileArchive, Package, Tag } from 'lucide-react';
import { Box, Typography } from '@mui/material'; // Added Box and Typography
import {
  getUserFavoritesApi,
  PaginatedFavoritesResponse,
  DetailedFavoriteItem,
  FavoriteItemType,
  addFavoriteApi,
  removeFavoriteApi,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; // Import toast utilities

const FavoritesView: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth(); // Renamed to avoid conflict
  const [favorites, setFavorites] = useState<DetailedFavoriteItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true); 
  const [error, setError] = useState<string | null>(null); // For initial load error
  // Removed feedbackMessage, will use toasts for feedback

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track initial load

  // This map is primarily for UI state of the star icon if needed, but data comes from `favorites` list
  const [favoritedItemsMap, setFavoritedItemsMap] = useState<Map<string, { favoriteId: number | undefined }>>(new Map());

  const mapItemTypeToIcon = (itemType: FavoriteItemType) => {
    switch (itemType) {
      case 'document': return <FileText size={18} className="mr-2 text-blue-500" />;
      case 'patch': return <Puzzle size={18} className="mr-2 text-green-500" />;
      case 'link': return <LinkIcon size={18} className="mr-2 text-purple-500" />;
      case 'misc_file': return <FileArchive size={18} className="mr-2 text-yellow-500" />;
      case 'software': return <Package size={18} className="mr-2 text-indigo-500" />;
      case 'version': return <Tag size={18} className="mr-2 text-pink-500" />;
      default: return <Star size={18} className="mr-2 text-gray-500" />;
    }
  };
  
  const getItemPageLink = (item: DetailedFavoriteItem): string => {
    switch (item.item_type) {
      case 'document': return `/documents?highlight=${item.item_id}&software_id=${item.software_id || ''}`;
      case 'patch': return `/patches?highlight=${item.item_id}&software_id=${item.software_id || ''}&version_id=${item.version_id || ''}`;
      case 'link':
        if (item.name && (item.name.startsWith('http://') || item.name.startsWith('https://'))) { return item.name; }
        return `/links?highlight=${item.item_id}&software_id=${item.software_id || ''}&version_id=${item.version_id || ''}`;
      case 'misc_file': return `/misc?highlight=${item.item_id}`;
      case 'software': return `/documents?software_id=${item.item_id}`;
      case 'version': return `/patches?software_id=${item.software_id || ''}&version_id=${item.item_id}`;
      default: return '#';
    }
  };

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoadingData(false);
      setError("Please log in to view your favorites.");
      setFavorites([]);
      setFavoritedItemsMap(new Map());
      setTotalPages(0);
      setTotalFavorites(0);
      if (isInitialLoad) setIsInitialLoad(false);
      return;
    }

    setIsLoadingData(true);
    if (isInitialLoad) {
      setError(null); // Clear main error only on initial load attempt
    }

    try {
      const response: PaginatedFavoritesResponse = await getUserFavoritesApi(currentPage, itemsPerPage);
      setFavorites(response.favorites);
      setTotalPages(response.total_pages);
      setTotalFavorites(response.total_favorites);
      
      const newFavoritedItemsMap = new Map<string, { favoriteId: number | undefined }>();
      response.favorites.forEach(fav => {
        newFavoritedItemsMap.set(`${fav.item_type}-${fav.item_id}`, { favoriteId: fav.favorite_id });
      });
      setFavoritedItemsMap(newFavoritedItemsMap);

      if (isInitialLoad) {
        setIsInitialLoad(false); // Mark initial load as complete
      }
    } catch (err: any) {
      console.error("Failed to load favorites:", err);
      const errorMessage = err.response?.data?.msg || err.message || 'Failed to fetch favorites.';
      if (isInitialLoad) {
        setError(errorMessage); // Set error for ErrorState component display
        setFavorites([]);
        setFavoritedItemsMap(new Map());
        setTotalPages(0);
        setTotalFavorites(0);
      } else {
        showErrorToast(errorMessage); // Show toast for non-initial load errors, keep stale data
      }
    } finally {
      setIsLoadingData(false);
      if (isInitialLoad) setIsInitialLoad(false); // Ensure initial load is false even on error
    }
  }, [isAuthenticated, currentPage, itemsPerPage, isInitialLoad]);

  useEffect(() => {
    if (!isAuthLoading) { 
        loadFavorites();
    }
  }, [loadFavorites, isAuthLoading]);

  const handleFavoriteToggle = async (item: DetailedFavoriteItem) => {
    if (!isAuthenticated) {
      showErrorToast("Please log in to manage favorites.");
      return;
    }

    const uniqueKey = `${item.item_type}-${item.item_id}`;
    // Since this page only shows favorited items, toggling always means un-favoriting.
    // Optimistic UI update: Remove from list immediately.
    setFavorites(prevFavorites => prevFavorites.filter(fav => fav.favorite_id !== item.favorite_id));
    setFavoritedItemsMap(prevMap => {
      const newMap = new Map(prevMap);
      newMap.delete(uniqueKey); // Remove from map
      return newMap;
    });

    try {
      await removeFavoriteApi(item.item_id, item.item_type);
      showSuccessToast(`"${item.name}" removed from favorites.`);
      // Optionally, reload to ensure pagination and total counts are accurate,
      // though optimistic removal often feels faster.
      // If totalFavorites is important to update immediately:
      setTotalFavorites(prev => prev -1); 
      if (favorites.length === 1 && currentPage > 1) { // If last item on a page (not first page)
        setCurrentPage(prev => prev - 1); // This will trigger loadFavorites
      } else if (favorites.length === 1 && currentPage === 1) {
        // If last item on first page, list will be empty after removal.
        // loadFavorites will be triggered if currentPage doesn't change but items are 0
        // No specific action here, data will be empty or loadFavorites will run
      }
      // If not the last item, the optimistic removal is usually sufficient.
      // Consider if totalPages needs adjustment or if loadFavorites should always run.
      // For simplicity, if many items are removed, a full reload via loadFavorites might be better.
      // loadFavorites(); // Uncomment if strict data consistency is preferred over optimistic UI.
      
    } catch (error: any) {
      showErrorToast(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      // Revert optimistic update by reloading
      loadFavorites(); 
    }
  };

  // Display loading state only during initial auth check or initial data fetch
  if (isAuthLoading || (isInitialLoad && isLoadingData)) {
    return <LoadingState message="Loading favorites..." />;
  }

  if (!isAuthenticated && !isAuthLoading) { // Ensure auth check is complete
    return (
      <div className="text-center py-10">
        <p className="text-lg text-gray-600">Please <Link to="/login" className="text-blue-600 hover:underline">log in</Link> to view your favorites.</p>
      </div>
    );
  }
  
  // Display error state only on initial load failure
  if (error && isInitialLoad && favorites.length === 0) {
    return <ErrorState message={error} onRetry={loadFavorites} />;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Star size={32} className="text-yellow-500" />
        {/* Using Typography for h1 for theme consistency, though direct h1 is also fine */}
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'text.primary' }}> 
          My Favorites
        </Typography>
      </div>

      {favorites.length === 0 && !isLoadingData ? (
        <Box 
          sx={{ 
            textAlign: 'center', 
            py: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }} 
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm my-6">
          <Star size={48} className="text-yellow-500 dark:text-yellow-400 mb-4" /> {/* Changed color to yellow and added centering styles */}
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            You haven't favorited any items yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Start exploring and mark your favorites by clicking the star icon!
          </Typography>
        </Box>
      ) : (
        <div className="space-y-4">
          {favorites.map(item => (
            <div key={item.favorite_id} className="bg-white shadow-sm rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center">
                {mapItemTypeToIcon(item.item_type)}
                <div>
                  <Link 
                    to={getItemPageLink(item)} 
                    target={item.item_type === 'link' && (item.name.startsWith('http://') || item.name.startsWith('https://')) ? '_blank' : '_self'}
                    rel={item.item_type === 'link' && (item.name.startsWith('http://') || item.name.startsWith('https://')) ? 'noopener noreferrer' : ''}
                    className="text-lg font-semibold text-blue-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-gray-500 capitalize">
                    Type: {item.item_type.replace('_', ' ')}
                    {item.software_name && ` • Software: ${item.software_name}`}
                    {item.version_number && ` • Version: ${item.version_number}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Favorited on: {new Date(item.favorited_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleFavoriteToggle(item)}
                className="p-2 rounded-full text-yellow-500 hover:text-yellow-600 focus:outline-none"
                title="Remove from Favorites"
              >
                <Star size={20} className="fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-8">
          <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1 || isLoadingData} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-gray-700"> Page {currentPage} of {totalPages} (Total: {totalFavorites} items) </span>
          <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages || isLoadingData} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default FavoritesView;
