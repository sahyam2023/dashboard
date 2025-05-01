//src/views/LinksView.tsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchLinks, fetchSoftware } from '../services/api';
import { Link, Software } from '../types';
import FilterTabs from '../components/FilterTabs';
import LinkCard from '../components/LinkCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

interface OutletContextType {
  searchTerm: string;
}

const LinksView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const [links, setLinks] = useState<Link[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [linksData, softwareData] = await Promise.all([
          fetchLinks(selectedSoftwareId),
          fetchSoftware()
        ]);
        
        setLinks(linksData);
        setSoftware(softwareData);
        setError(null);
      } catch (err) {
        setError('Failed to fetch links. Please try again later.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedSoftwareId]);

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  const filteredLinks = searchTerm
    ? links.filter(link => 
        link.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        link.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        link.software_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        link.category.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : links;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Links</h2>
        <p className="text-gray-600">Useful links and resources</p>
      </div>

      {!isLoading && !error && (
        <FilterTabs 
          software={software} 
          selectedSoftwareId={selectedSoftwareId} 
          onSelectFilter={handleFilterChange} 
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => handleFilterChange(selectedSoftwareId)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLinks.length > 0 ? (
            filteredLinks.map((link) => (
              <LinkCard key={link.id} link={link} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500">No links found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LinksView;