import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Star, SearchX as SearchXIcon } from 'lucide-react'; // Added SearchXIcon
import { Box, Typography } from '@mui/material'; // Added Box and Typography
import { 
  searchData,
  addFavoriteApi, // Added
  removeFavoriteApi, // Added
  getFavoriteStatusApi, // Added
  FavoriteItemType // Added
} from '../services/api';
import { useAuth } from '../context/AuthContext'; // Added
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
interface SearchResultItem {
  id: number | string;
  name?: string;
  title?: string;
  description?: string;
  type: string;
  software_name?: string;
  software_id?: number | string; // For versions
  url?: string; // For external links
  is_external_link?: boolean; // For links
  stored_filename?: string; // For uploaded files (links, misc_files)
  is_downloadable?: boolean;
  is_favorited?: boolean; // Added
  favorite_id?: number; // Added
  page_number?: number; // Added for internal navigation
  // Add other fields that might appear in search results
}

interface CategorizedResults {
  [key: string]: SearchResultItem[];
}

const SearchResultsView: React.FC = () => {
  const { isAuthenticated } = useAuth(); // Added
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(); 
  const query = searchParams.get('q') || ''; 

  const [categorizedResults, setCategorizedResults] = useState<CategorizedResults>({});
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null); // Added

  // Favorite State for search results
  const [favoritedItemsSearchResults, setFavoritedItemsSearchResults] = useState<Map<string, { favoriteId: number | undefined }>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      setFavoritedItemsSearchResults(new Map()); // Clear favorites on logout
    }
  }, [isAuthenticated]);
  
  useEffect(() => {
    if (!query) {
      setCategorizedResults({});
      setTotalResults(0);
      return;
    }

    const fetchSearchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data: SearchResultItem[] = await searchData(query);
        
        // Group results by type
        const groupedResults = data.reduce((acc, result) => {
          const typeKey = result.type || 'unknown';
          if (!acc[typeKey]) {
            acc[typeKey] = [];
          }
          acc[typeKey].push(result);
          return acc;
        }, {} as CategorizedResults);
        
        setCategorizedResults(groupedResults);
        setTotalResults(data.length);

        // Initialize favoritedItemsSearchResults directly from search data
        const newFavoritedItems = new Map<string, { favoriteId: number | undefined }>();
        if (isAuthenticated && data && data.length > 0) {
            for (const item of data) {
                const uniqueKey = `${item.type}-${item.id}`;
                if (item.favorite_id) { // Check if favorite_id exists and is truthy (not null/undefined)
                    newFavoritedItems.set(uniqueKey, { favoriteId: item.favorite_id });
                } else {
                    newFavoritedItems.set(uniqueKey, { favoriteId: undefined });
                }
            }
        }
        setFavoritedItemsSearchResults(newFavoritedItems);

      } catch (err) {
        setError('Failed to fetch search results. Please try again later.');
        console.error(err);
        setCategorizedResults({});
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearchResults();
  }, [query, isAuthenticated]); // Added isAuthenticated as a dependency

  const renderResultItem = (result: SearchResultItem, index: number) => {
    const key = `${result.type}-${result.id}-${index}`;
    let linkTo: string | undefined = undefined;
    let isExternal = false;
    let isDownload = false;
    let downloadUrl: string | undefined = undefined;
    let isEffectivelyDownloadable = true; // Default to true, adjust based on type and flags

    switch (result.type) {
      case 'document':
        linkTo = `/documents?page=${result.page_number || 1}&highlight=${result.id}`;
        // Downloadability for documents in search results is handled by DocumentsView
        break;
      case 'patch':
        linkTo = `/patches?page=${result.page_number || 1}&highlight=${result.id}`;
        // Downloadability for patches in search results is handled by PatchesView
        break;
      case 'software':
        linkTo = `/documents?software_id=${result.id}`;
        break;
      case 'version':
        linkTo = `/patches?software_id=${result.software_id}`;
        break;
      case 'link':
        if (result.page_number && result.id) { // Prioritize internal navigation
          linkTo = `/links?page=${result.page_number}&highlight=${result.id}`;
        } else if (result.is_external_link && result.url) { // External link
          linkTo = result.url;
          isExternal = true;
        } else if (result.stored_filename) { // Fallback to download for internal files if no page_number (should be rare)
          downloadUrl = `/official_uploads/links/${result.stored_filename}`;
          isDownload = true;
          isEffectivelyDownloadable = result.is_downloadable !== false;
        }
        break;
      case 'misc_file':
        if (result.page_number && result.id) { // Prioritize internal navigation
          linkTo = `/misc?page=${result.page_number}&highlight=${result.id}`; // Assuming /misc route
        } else if (result.stored_filename) { // Fallback to download
          downloadUrl = `/misc_uploads/${result.stored_filename}`;
          isDownload = true;
          isEffectivelyDownloadable = result.is_downloadable !== false;
        }
        break;
      default:
        break;
    }

    const title = result.title || result.name || 'Untitled';
    const description = result.description ? (result.description.length > 150 ? result.description.substring(0, 147) + '...' : result.description) : 'No description available.';

    const content = (
      <>
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-lg text-gray-900 mb-1 flex-grow">{title}</h4>
          {isAuthenticated && ( 
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault(); // Prevent navigation for Link components
                handleFavoriteToggle(result);
              }}
              className={`p-1 ${favoritedItemsSearchResults.get(`${result.type}-${result.id}`)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600 flex-shrink-0`}
              title={favoritedItemsSearchResults.get(`${result.type}-${result.id}`)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star size={16} className={favoritedItemsSearchResults.get(`${result.type}-${result.id}`)?.favoriteId ? "fill-current" : ""} />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">
          Type: {result.type}
          {result.type === 'version' && result.software_name && ` (for ${result.software_name})`}
          {result.type !== 'version' && result.software_name && ` • Software: ${result.software_name}`}
        </p>
        <p className="text-gray-600 text-sm">{description}</p>
      </>
    );
    
    const commonClasses = "block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow";

    if (isExternal && linkTo) {
      return (
        <a href={linkTo} target="_blank" rel="noopener noreferrer" key={key} className={commonClasses}>
          {content}
        </a>
      );
    }
    
    if (isDownload && downloadUrl) {
       if (!isEffectivelyDownloadable) {
         return (
           <div key={key} className={`${commonClasses} cursor-not-allowed opacity-70`} title="Download not permitted">
             {content}
             {/* Optionally, add a disabled-looking download icon here if needed */}
           </div>
         );
       }
       return (
        <a href={downloadUrl} key={key} className={commonClasses} download target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }

    if (linkTo) {
      return (
        <Link to={linkTo} key={key} className={commonClasses}>
          {content}
        </Link>
      );
    }

    return (
      <div key={key} className={commonClasses + " cursor-default"}>
        {content}
      </div>
    );
  };

  const handleFavoriteToggle = async (item: SearchResultItem) => {
    if (!isAuthenticated) {
      setFeedbackMessage("Please log in to manage favorites.");
      return;
    }
    const uniqueKey = `${item.type}-${item.id}`;
    const itemIdAsNumber = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;

    if (isNaN(itemIdAsNumber)) {
      setFeedbackMessage("Invalid item ID for favoriting.");
      return;
    }

    const currentStatus = favoritedItemsSearchResults.get(uniqueKey);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;

    const tempFavoritedItems = new Map(favoritedItemsSearchResults);
    if (isCurrentlyFavorited) {
      tempFavoritedItems.set(uniqueKey, { favoriteId: undefined });
    } else {
      tempFavoritedItems.set(uniqueKey, { favoriteId: -1 }); // Placeholder
    }
    setFavoritedItemsSearchResults(tempFavoritedItems);
    setFeedbackMessage(null);


    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(itemIdAsNumber, item.type as FavoriteItemType);
        setFeedbackMessage(`"${item.name || item.title}" removed from favorites.`);
        setFavoritedItemsSearchResults(prev => {
          const newMap = new Map(prev);
          newMap.set(uniqueKey, { favoriteId: undefined });
          return newMap;
        });
      } else {
        const newFavorite = await addFavoriteApi(itemIdAsNumber, item.type as FavoriteItemType);
        setFavoritedItemsSearchResults(prev => {
          const newMap = new Map(prev);
          newMap.set(uniqueKey, { favoriteId: newFavorite.id });
          return newMap;
        });
        setFeedbackMessage(`"${item.name || item.title}" added to favorites.`);
      }
    } catch (error: any) {
      console.error("Failed to toggle favorite for search result:", error);
      setFeedbackMessage(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      setFavoritedItemsSearchResults(prev => {
        const newMap = new Map(prev);
        if (isCurrentlyFavorited) {
          newMap.set(uniqueKey, { favoriteId: currentStatus?.favoriteId });
        } else {
          newMap.set(uniqueKey, { favoriteId: undefined });
        }
        return newMap;
      });
    }
  };

  if (isLoading) {
    return <LoadingState message="Searching..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }
  
  if (totalResults === 0 && query) {
    return (
      <Box className="container mx-auto px-4 py-8" sx={{ textAlign: 'center', mt: 4, p: 3 }}>
        {/* feedbackMessage can be integrated if needed, or rely on toasts */}
        <Typography variant="h5" component="h2" sx={{ mb: 2, color: 'text.primary' }}>
          Search Results
        </Typography>
        <SearchXIcon size={60} className="text-gray-400 dark:text-gray-500 mb-4 mx-auto" />
        <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
          No results found for "<Typography component="span" sx={{ fontWeight: 'medium', color: 'text.primary' }}>{query}</Typography>"
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Try different keywords or check back later.
        </Typography>
      </Box>
    );
  }
  
  if (!query) {
     return (
      <div className="container mx-auto px-4 py-8">
        {feedbackMessage && <div className="p-3 my-2 bg-blue-100 text-blue-700 rounded text-sm">{feedbackMessage}</div>}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Search</h2>
          <p className="text-gray-600">Please enter a search term in the header to find results.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {feedbackMessage && <div className="p-3 my-2 bg-blue-100 text-blue-700 rounded text-sm">{feedbackMessage}</div>}
      <div className="mb-6">
        <Typography variant="h5" component="h2" sx={{ mb: 1, color: 'text.primary' }}>
          Search Results
        </Typography>
        <Typography color="text.secondary">
          Found {totalResults} result{totalResults !== 1 ? 's' : ''} for "<Typography component="span" sx={{ fontWeight: 'medium', color: 'text.primary' }}>{query}</Typography>"
        </Typography>
      </div>
      
      {Object.entries(categorizedResults).map(([type, items]) => (
        items.length > 0 && (
          <div key={type} className="mb-8"> 
            <Typography variant="h6" component="h3" sx={{ mb: 2, textTransform: 'capitalize', borderBottom: 1, borderColor: 'divider', pb: 1, color: 'text.primary' }}>
              {type.replace('_', ' ')}s
            </Typography>
            <div className="space-y-4">
              {items.map((result, index) => renderResultItem(result, index))}
            </div>
          </div>
        )
      ))}
    </div>
  );
};

export default SearchResultsView;