import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, FileText, Puzzle, Link2 as LinkIcon, Archive as FileArchive, Package, Tag } from 'lucide-react'; // Using Link2 for LinkIcon to avoid conflict
import {
  getUserFavoritesApi,
  PaginatedFavoritesResponse,
  DetailedFavoriteItem,
  FavoriteItemType,
  addFavoriteApi,
  removeFavoriteApi,
  getFavoriteStatusApi, // To initialize favorite states correctly if needed, though primary data comes from getUserFavoritesApi
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
const FavoritesView: React.FC = () => {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const [favorites, setFavorites] = useState<DetailedFavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Or your default

  // This state will primarily be used to manage the filled/unfilled star for items on this page
  // It's populated by the `is_favorited` and `favorite_id` coming directly from the `DetailedFavoriteItem`
  const [favoritedItems, setFavoritedItems] = useState<Map<string, { favoriteId: number | undefined }>>(new Map());

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
      case 'document':
        return `/documents?highlight=${item.item_id}&software_id=${item.software_id || ''}`;
      case 'patch':
        return `/patches?highlight=${item.item_id}&software_id=${item.software_id || ''}&version_id=${item.version_id || ''}`;
      case 'link':
         // For external links, the item.name might be the URL, or a specific field if available
         // If it's an uploaded file link, construct path similar to other file types
        if (item.name && (item.name.startsWith('http://') || item.name.startsWith('https://'))) { // Assuming 'name' holds URL for external links for now
            return item.name;
        }
        // Fallback for internal links or if name is not a URL
        return `/links?highlight=${item.item_id}&software_id=${item.software_id || ''}&version_id=${item.version_id || ''}`;
      case 'misc_file':
        return `/misc?highlight=${item.item_id}`; // Assuming a general misc view or specific category view
      case 'software':
        return `/documents?software_id=${item.item_id}`; // Example: link to documents of that software
      case 'version':
        return `/patches?software_id=${item.software_id || ''}&version_id=${item.item_id}`; // Example: link to patches of that version
      default:
        return '#';
    }
  };


  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      setError("Please log in to view your favorites.");
      setFavorites([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    setFeedbackMessage(null);

    try {
      const response: PaginatedFavoritesResponse = await getUserFavoritesApi(currentPage, itemsPerPage);
      setFavorites(response.favorites);
      setTotalPages(response.total_pages);
      setTotalFavorites(response.total_favorites);
      // Update favoritedItems map based on the fetched favorites
      const newFavoritedItems = new Map<string, { favoriteId: number | undefined }>();
      response.favorites.forEach(fav => {
        newFavoritedItems.set(`${fav.item_type}-${fav.item_id}`, { favoriteId: fav.favorite_id });
      });
      setFavoritedItems(newFavoritedItems);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch favorites.');
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, currentPage, itemsPerPage]);

  useEffect(() => {
    if (!isAuthLoading) { // Only load favorites once auth status is confirmed
        loadFavorites();
    }
  }, [loadFavorites, isAuthLoading]);

  const handleFavoriteToggle = async (item: DetailedFavoriteItem) => {
    if (!isAuthenticated) {
      setFeedbackMessage("Please log in to manage favorites.");
      return;
    }

    const uniqueKey = `${item.item_type}-${item.item_id}`;
    const currentStatus = favoritedItems.get(uniqueKey);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;

    // Optimistic UI update: Remove from list immediately if un-favoriting
    if (isCurrentlyFavorited) {
      setFavorites(prevFavorites => prevFavorites.filter(fav => fav.favorite_id !== currentStatus.favoriteId));
      setFavoritedItems(prevMap => {
        const newMap = new Map(prevMap);
        newMap.set(uniqueKey, { favoriteId: undefined });
        return newMap;
      });
    } else {
      // For adding, we'd typically re-fetch or add to list, but this page only shows existing favorites.
      // So, adding back is less of a concern here unless the item was incorrectly removed optimistically.
      // For now, if an item is re-favorited (which shouldn't happen from this page if it's already gone),
      // we'll just update the map. The item won't reappear unless the list is reloaded.
       setFavoritedItems(prevMap => {
        const newMap = new Map(prevMap);
        newMap.set(uniqueKey, { favoriteId: -1 }); // Placeholder, will be updated by actual ID
        return newMap;
      });
    }
    setFeedbackMessage(null);

    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.item_id, item.item_type);
        setFeedbackMessage(`"${item.name}" removed from favorites.`);
        // State already updated optimistically. Optionally, re-fetch to confirm.
        // loadFavorites(); // Or just ensure local state is consistent
      } else {
        // This case (adding a favorite) should ideally not be triggered from the favorites page
        // if an item is only shown when it *is* a favorite.
        // However, if it's possible due to some UI inconsistency:
        const newFavoriteEntry = await addFavoriteApi(item.item_id, item.item_type);
        setFavoritedItems(prevMap => {
            const newMap = new Map(prevMap);
            newMap.set(uniqueKey, { favoriteId: newFavoriteEntry.id });
            return newMap;
        });
        setFeedbackMessage(`"${item.name}" added to favorites.`);
        // Item might not be in the list if it was removed optimistically and re-added.
        // A full reload might be best here if adding is a possible action.
        loadFavorites();
      }
    } catch (error: any) {
      console.error("Failed to toggle favorite:", error);
      setFeedbackMessage(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      // Revert optimistic update
      loadFavorites(); // Re-fetch to get consistent state
    }
  };

  if (isAuthLoading || isLoading) {
    return <LoadingState message="Loading favorites..." />;
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-10">
        <p className="text-lg text-gray-600">Please <Link to="/login" className="text-blue-600 hover:underline">log in</Link> to view your favorites.</p>
      </div>
    );
  }
  
  if (error) {
    return <ErrorState message={error} onRetry={loadFavorites} />;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Star size={32} className="text-yellow-500" />
        <h1 className="text-3xl font-bold text-gray-800">My Favorites</h1>
      </div>

      {feedbackMessage && (
        <div className={`p-3 my-2 rounded text-sm ${feedbackMessage.includes("removed") || feedbackMessage.includes("Failed") ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {feedbackMessage}
        </div>
      )}

      {favorites.length === 0 ? (
        <div className="text-center py-10">
          <Star size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-xl text-gray-600">You haven't favorited any items yet.</p>
          <p className="text-sm text-gray-500 mt-2">Start exploring and mark your favorites by clicking the star icon!</p>
        </div>
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
                className={`p-2 rounded-full ${favoritedItems.get(`${item.item_type}-${item.item_id}`)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600 focus:outline-none`}
                title={favoritedItems.get(`${item.item_type}-${item.item_id}`)?.favoriteId ? "Remove from Favorites" : "Add to Favorites (should not happen here)"}
              >
                <Star size={20} className={favoritedItems.get(`${item.item_type}-${item.item_id}`)?.favoriteId ? "fill-current" : ""} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700">
            Page {currentPage} of {totalPages} (Total: {totalFavorites} items)
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default FavoritesView;
