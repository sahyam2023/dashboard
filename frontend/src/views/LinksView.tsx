// src/views/LinksView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { fetchLinks, fetchSoftware, fetchVersionsForSoftware } from '../services/api'; // Added fetchVersionsForSoftware
import { Link as LinkType, Software, AddLinkPayload } from '../types'; // Renamed Link to LinkType
import FilterTabs from '../components/FilterTabs';
import LinkCard from '../components/LinkCard'; // Assuming LinkCard is updated for the new LinkType
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext'; // For admin check
import AdminLinkEntryForm from '../components/admin/AdminLinkEntryForm'; // Import the admin form
import { PlusCircle } from 'lucide-react';

interface OutletContextType {
  searchTerm: string;
}

const LinksView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [links, setLinks] = useState<LinkType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]); // Renamed
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  // Optional: Add state for selectedVersionId if you want to filter links by version too
  // const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(true); // For loading links
  const [error, setError] = useState<string | null>(null); // For errors fetching links

  const [showAddLinkForm, setShowAddLinkForm] = useState(false);

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Pass undefined if null, and potentially selectedVersionId if you add that filter
      const linksData = await fetchLinks(
        selectedSoftwareId === null ? undefined : selectedSoftwareId
        // selectedVersionId === null ? undefined : selectedVersionId // If filtering by version
      );
      setLinks(linksData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch links.');
      console.error("Error fetching links:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSoftwareId]); // Add selectedVersionId if you implement version filtering

  useEffect(() => {
    const loadSoftwareForFilters = async () => {
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
      } catch (err) {
        console.error("Failed to load software for filters", err);
      }
    };
    loadSoftwareForFilters();
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
    // If you add version filtering, reset version when software changes
    // setSelectedVersionId(null);
  };

  // const handleVersionFilterChange = (versionId: number | null) => {
  //   setSelectedVersionId(versionId);
  // };

  const handleLinkAdded = (newLink: LinkType) => {
    setShowAddLinkForm(false);
    loadLinks(); // Refresh the list
  };

  const filteredLinks = useMemo(() => {
    if (!searchTerm) {
      return links;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return links.filter(link =>
      link.title.toLowerCase().includes(lowerSearchTerm) ||
      (link.description || '').toLowerCase().includes(lowerSearchTerm) || // Handle null description
      (link.software_name || '').toLowerCase().includes(lowerSearchTerm) || // Handle undefined software_name
      (link.version_name || '').toLowerCase().includes(lowerSearchTerm)    // Handle version_name if you add it
    );
  }, [links, searchTerm]);

  // If LinkCard expects specific props, ensure 'link' object from 'filteredLinks' matches
  // Your Link type now has is_external_link, stored_filename etc. LinkCard might need adjustment.

  const handleRetryFetchLinks = () => {
      loadLinks();
      if(softwareList.length === 0) {
        const loadSoftwareForFilters = async () => { /* ... */ };
        loadSoftwareForFilters();
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Links</h2>
          <p className="text-gray-600 mt-1">Useful links and resources</p>
        </div>
        {isAuthenticated && role === 'admin' && (
          <button
            onClick={() => setShowAddLinkForm(prev => !prev)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddLinkForm ? 'Cancel Add Link' : 'Add New Link'}
          </button>
        )}
      </div>

      {showAddLinkForm && isAuthenticated && role === 'admin' && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <AdminLinkEntryForm onLinkAdded={handleLinkAdded} />
        </div>
      )}

      {softwareList.length > 0 && !error && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
        // TODO: Optionally add a second FilterTabs or dropdown for versions if a software is selected
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={handleRetryFetchLinks} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredLinks.length > 0 ? (
            filteredLinks.map((link) => (
              <LinkCard key={link.id} link={link} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500">
                No links found {selectedSoftwareId ? `for ${softwareList.find(s=>s.id === selectedSoftwareId)?.name || 'the selected software'}` : ''}.
                {searchTerm && " matching your search."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LinksView;