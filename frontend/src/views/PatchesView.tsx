//src/views/PatchesView.tsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { fetchPatches, fetchSoftware } from '../services/api';
import { Patch, Software } from '../types';
import DataTable from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

interface OutletContextType {
  searchTerm: string;
}

const PatchesView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const [patches, setPatches] = useState<Patch[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [patchesData, softwareData] = await Promise.all([
          fetchPatches(selectedSoftwareId),
          fetchSoftware()
        ]);
        
        setPatches(patchesData);
        setSoftware(softwareData);
        setError(null);
      } catch (err) {
        setError('Failed to fetch patches. Please try again later.');
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

  const filteredPatches = searchTerm
    ? patches.filter(patch => 
        patch.patch_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patch.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patch.software_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patch.version_number.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : patches;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const columns = [
    { key: 'patch_name', header: 'Name' },
    { key: 'version_number', header: 'Version' },
    { key: 'software_name', header: 'Software' },
    { 
      key: 'release_date', 
      header: 'Release Date',
      render: (patch: Patch) => formatDate(patch.release_date)
    },
    { key: 'description', header: 'Description' },
    { 
      key: 'download_link', 
      header: 'Download',
      render: (patch: Patch) => (
        <a
          href={patch.download_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          Download
          <ExternalLink size={14} className="ml-1" />
        </a>
      )
    }
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Patches</h2>
        <p className="text-gray-600">Browse and download software patches</p>
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
        <DataTable 
          data={filteredPatches} 
          columns={columns} 
        />
      )}
    </div>
  );
};

export default PatchesView;