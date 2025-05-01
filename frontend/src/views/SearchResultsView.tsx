//src/views/SearchResultsView.tsx
import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { searchData } from '../services/api';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

interface OutletContextType {
  searchTerm: string;
}

const SearchResultsView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || searchTerm;
  
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const fetchSearchResults = async () => {
      try {
        setIsLoading(true);
        const data = await searchData(query);
        setResults(data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch search results. Please try again later.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  if (isLoading) {
    return <LoadingState message="Searching..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (results.length === 0 && query) {
    return (
      <div>
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Search Results</h2>
        <p className="text-gray-600">
          {results.length} results for "<span className="font-medium">{query}</span>"
        </p>
      </div>
      
      <div className="space-y-4">
        {results.map((result, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
            <h3 className="font-medium text-lg text-gray-900 mb-1">{result.title || result.name}</h3>
            <p className="text-sm text-gray-500 mb-2">{result.type} • {result.software_name}</p>
            <p className="text-gray-600">{result.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchResultsView;