// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle } from 'lucide-react';
import { fetchPatches, fetchSoftware } from '../services/api';
import { Patch as PatchType, Software } from '../types'; // Renamed Patch to PatchType
import DataTable from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext'; // For admin check
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm'; // Import the admin form

interface OutletContextType {
  searchTerm: string;
}

const PatchesView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]); // Renamed
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true); // For loading patches
  const [error, setError] = useState<string | null>(null); // For errors fetching patches

  const [showAddPatchForm, setShowAddPatchForm] = useState(false);

  const loadPatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const patchesData = await fetchPatches(selectedSoftwareId === null ? undefined : selectedSoftwareId);
      setPatches(patchesData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch patches.');
      console.error("Error fetching patches:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSoftwareId]);

  useEffect(() => {
    const loadSoftwareForFilters = async () => {
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
      } catch (err) {
        console.error("Failed to load software for filters", err);
        // setError('Failed to load filter options.'); // Can be a separate error state
      }
    };
    loadSoftwareForFilters();
  }, []);

  useEffect(() => {
    loadPatches();
  }, [loadPatches]);

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  const handlePatchAdded = (newPatch: PatchType) => {
    setShowAddPatchForm(false);
    loadPatches(); // Refresh the list
  };

  const filteredPatches = useMemo(() => {
    if (!searchTerm) {
      return patches;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return patches.filter(patch =>
      patch.patch_name.toLowerCase().includes(lowerSearchTerm) ||
      (patch.description || '').toLowerCase().includes(lowerSearchTerm) || // Handle null description
      (patch.software_name || '').toLowerCase().includes(lowerSearchTerm) || // Handle undefined software_name
      (patch.version_number || '').toLowerCase().includes(lowerSearchTerm) // Handle undefined version_number
    );
  }, [patches, searchTerm]);

  const formatDate = (dateString: string | null): string => { // Accept string | null
    if (!dateString) return 'N/A'; // Handle null or empty dates
    try {
      return new Date(dateString).toLocaleDateString('en-CA'); // 'en-CA' gives YYYY-MM-DD, or choose your preferred locale
    } catch (e) {
      return 'Invalid Date';
    }
  };

  const columns = [
    { key: 'patch_name', header: 'Name' },
    { key: 'version_number', header: 'Version' }, // This comes from backend join
    { key: 'software_name', header: 'Software' }, // This comes from backend join
    {
      key: 'release_date',
      header: 'Release Date',
      render: (patch: PatchType) => formatDate(patch.release_date)
    },
    { key: 'description', header: 'Description' },
    {
      key: 'download_link',
      header: 'Download',
      render: (patch: PatchType) => (
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
    // TODO LATER: Add "Actions" column for Edit/Delete buttons for admins
  ];

  const handleRetryFetchPatches = () => {
    loadPatches();
     if(softwareList.length === 0) {
        const loadSoftwareForFilters = async () => { /* ... */ };
        loadSoftwareForFilters();
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Patches</h2>
          <p className="text-gray-600 mt-1">Browse and download software patches</p>
        </div>
        {isAuthenticated && role === 'admin' && (
          <button
            onClick={() => setShowAddPatchForm(prev => !prev)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddPatchForm ? 'Cancel Add Patch' : 'Add New Patch'}
          </button>
        )}
      </div>

      {showAddPatchForm && isAuthenticated && role === 'admin' && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <AdminPatchEntryForm onPatchAdded={handlePatchAdded} />
        </div>
      )}

      {softwareList.length > 0 && !error && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={handleRetryFetchPatches} />
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