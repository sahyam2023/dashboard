// frontend/src/views/FavoritesView.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Correct import for Link if needed
import { fetchFullUserFavorites, FullFavoriteItem } from '../services/api'; // Adjust path
import { useFavorites } from '../context/FavoritesContext'; // Adjust path
import { Star, Download, ExternalLink } from 'lucide-react'; // For unfavorite and link icons
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

const FavoritesView: React.FC = () => {
  const [favoriteItems, setFavoriteItems] = useState<FullFavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { removeFavoriteItem, isFavorited, isLoadingFavorites: isLoadingToggleFavorite } = useFavorites(); // Renamed to avoid conflict

  useEffect(() => {
    const loadFavorites = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const items = await fetchFullUserFavorites();
        setFavoriteItems(items);
      } catch (err: any) {
        setError(err.message || "Failed to load favorites.");
        console.error("Error loading favorites:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadFavorites();
  }, []); // Fetch once on mount

  const handleUnfavorite = async (itemType: string, itemId: number) => {
    try {
      await removeFavoriteItem(itemType, itemId);
      // Refresh list after unfavoriting
      setFavoriteItems(prev => prev.filter(item => !(item.id === itemId && item.item_type === itemType)));
    } catch (err) {
      console.error("Failed to unfavorite:", err);
      // Optionally show a toast error
    }
  };
  
  // Basic loading and error states
  if (isLoading) return <LoadingState message="Loading favorites..." />;
  if (error) return <ErrorState message={error} />;

  if (favoriteItems.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">My Favorites</h2>
        <p className="text-gray-600">You haven't favorited any items yet.</p>
      </div>
    );
  }

  // Simple categorized display (can be enhanced later)
  const categorized = favoriteItems.reduce((acc, item) => {
    const type = item.item_type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, FullFavoriteItem[]>);

  const getItemLink = (item: FullFavoriteItem): string => {
    switch (item.item_type) {
      case 'document':
        return `/documents?highlight=${item.id}`;
      case 'patch':
        return `/patches?highlight=${item.id}`;
      case 'link':
        // For external links, use the URL directly. For internal, form a path.
        return (item as any).is_external_link ? (item as any).url : `/links?highlight=${item.id}`; // Assuming links view supports highlight
      case 'misc_file':
        // Misc files might be direct downloads or link to a view. Assuming a view for now.
        return `/misc?highlight=${item.id}`; // Assuming misc view supports highlight
      default:
        return '#';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-800">My Favorites</h2>
      </div>

      {Object.entries(categorized).map(([type, items]) => (
        items.length > 0 && (
          <section key={type} aria-labelledby={`favorite-${type}-heading`}>
            <h3 id={`favorite-${type}-heading`} className="text-2xl font-semibold text-gray-700 mb-4 capitalize border-b pb-2">
              {type.replace('_', ' ')}s 
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map(item => (
                <div key={`${item.item_type}-${item.id}`} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 ease-in-out flex flex-col justify-between">
                  <div className="p-5">
                    <div className="flex justify-between items-start">
                      <h4 className="text-lg font-semibold text-blue-600 mb-2 pr-2">{item.name || (item as any).title || (item as any).doc_name || (item as any).patch_name || 'Unnamed Item'}</h4>
                      <button
                        onClick={() => handleUnfavorite(item.item_type, item.id)}
                        disabled={isLoadingToggleFavorite}
                        title="Remove from favorites"
                        className="p-1 text-yellow-500 hover:text-yellow-600 disabled:text-gray-300 flex-shrink-0"
                      >
                        <Star size={20} fill="currentColor" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Type: {item.item_type}</p>
                    
                    {/* Item-specific details */}
                    {item.item_type === 'document' && (item as any).software_name && (
                      <p className="text-sm text-gray-500 mb-1">Software: {(item as any).software_name}</p>
                    )}
                    {item.item_type === 'patch' && (item as any).software_name && (
                       <p className="text-sm text-gray-500 mb-1">Software: {(item as any).software_name}</p>
                    )}
                     {item.item_type === 'patch' && (item as any).version_number && (
                      <p className="text-sm text-gray-500 mb-1">Version: {(item as any).version_number}</p>
                    )}
                     {item.item_type === 'link' && (item as any).software_name && (
                       <p className="text-sm text-gray-500 mb-1">Software: {(item as any).software_name}</p>
                    )}
                     {item.item_type === 'link' && (item as any).version_name && (
                       <p className="text-sm text-gray-500 mb-1">Version: {(item as any).version_name}</p>
                    )}
                     {item.item_type === 'misc_file' && (item as any).category_name && (
                       <p className="text-sm text-gray-500 mb-1">Category: {(item as any).category_name}</p>
                    )}

                    <p className="text-gray-600 text-sm mb-3 h-10 overflow-hidden" title={item.description || ''}>
                      {(item.description && item.description.length > 60 ? item.description.substring(0,57) + '...' : item.description) || <span className="italic">No description.</span>}
                    </p>
                  </div>
                  <div className="p-5 bg-gray-50">
                    <Link
                      to={getItemLink(item)}
                      className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 group"
                      target={(item.item_type === 'link' && (item as any).is_external_link) ? '_blank' : '_self'}
                      rel={(item.item_type === 'link' && (item as any).is_external_link) ? 'noopener noreferrer' : undefined}
                    >
                      View Details
                      {(item.item_type === 'link' && (item as any).is_external_link) ? <ExternalLink size={16} className="ml-1 group-hover:translate-x-0.5 transition-transform"/> : <span className="ml-1 group-hover:translate-x-0.5 transition-transform">&rarr;</span>}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      ))}
    </div>
  );
};

export default FavoritesView;
