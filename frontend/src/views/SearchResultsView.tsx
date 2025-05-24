import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom'; // Removed useOutletContext
import { searchData } from '../services/api';
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
  // Add other fields that might appear in search results
}

interface CategorizedResults {
  [key: string]: SearchResultItem[];
}

const SearchResultsView: React.FC = () => {
  // Removed searchTerm from useOutletContext
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(); // Keep navigate if needed for other purposes or future enhancements
  const query = searchParams.get('q') || ''; // Sole source of truth for search term

  const [categorizedResults, setCategorizedResults] = useState<CategorizedResults>({});
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Removed useEffect that synced searchTerm with URL

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
  }, [query]);

  const renderResultItem = (result: SearchResultItem, index: number) => {
    const key = `${result.type}-${result.id}-${index}`;
    let linkTo: string | undefined = undefined;
    let isExternal = false;
    let isDownload = false;
    let downloadUrl: string | undefined = undefined;

    switch (result.type) {
      case 'document':
        linkTo = `/documents?highlight=${result.id}`; // Or just /documents
        break;
      case 'patch':
        linkTo = `/patches?highlight=${result.id}`; // Or just /patches
        break;
      case 'software':
        linkTo = `/documents?software_id=${result.id}`;
        break;
      case 'version':
        linkTo = `/patches?software_id=${result.software_id}`; // Future: &version=${result.name}
        break;
      case 'link':
        if (result.is_external_link && result.url) {
          linkTo = result.url;
          isExternal = true;
        } else if (result.stored_filename) {
          // Assuming official_uploads for links, adjust if path varies
          downloadUrl = `/official_uploads/links/${result.stored_filename}`;
          isDownload = true;
        }
        break;
      case 'misc_file':
        if (result.stored_filename) {
          downloadUrl = `/misc_uploads/${result.stored_filename}`;
          isDownload = true;
        }
        break;
      default:
        // No specific link, just display info
        break;
    }

    const title = result.title || result.name || 'Untitled';
    const description = result.description ? (result.description.length > 150 ? result.description.substring(0, 147) + '...' : result.description) : 'No description available.';

    const content = (
      <>
        <h4 className="font-medium text-lg text-gray-900 mb-1">{title}</h4>
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


  if (isLoading) {
    return <LoadingState message="Searching..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }
  
  if (totalResults === 0 && query) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Search Results</h2>
          <p className="text-gray-600">
            No results found for "<span className="font-medium">{query}</span>"
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-6 text-center">
          <p className="text-gray-500">Try different keywords or check back later.</p>
        </div>
      </div>
    );
  }
  
  // Handle case where query is empty (e.g. navigating to /search directly)
  if (!query) {
     return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Search</h2>
          <p className="text-gray-600">Please enter a search term in the header to find results.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Search Results</h2>
        <p className="text-gray-600">
          Found {totalResults} result{totalResults !== 1 ? 's' : ''} for "<span className="font-medium">{query}</span>"
        </p>
      </div>
      
      {Object.entries(categorizedResults).map(([type, items]) => (
        items.length > 0 && (
          <div key={type} className="mb-8"> {/* Increased mb for more spacing between categories */}
            <h3 className="text-xl font-semibold text-gray-700 mb-4 capitalize border-b pb-2">{type.replace('_', ' ')}s</h3> {/* Added border-b and pb for styling */}
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