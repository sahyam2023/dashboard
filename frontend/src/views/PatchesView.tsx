// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2 } from 'lucide-react';
import { fetchPatches, fetchSoftware, deleteAdminPatch } from '../services/api';
import { Patch as PatchType, Software } from '../types'; // Ensure PatchType includes software_id and version_number
import DataTable from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm'; // Uses the updated form
import ConfirmationModal from '../components/shared/ConfirmationModal';

interface OutletContextType {
  searchTerm: string;
}

const PatchesView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false); // Combined state
  const [editingPatch, setEditingPatch] = useState<PatchType | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patchToDelete, setPatchToDelete] = useState<PatchType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadPatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const patchesData = await fetchPatches(selectedSoftwareId === null ? undefined : selectedSoftwareId);
      setPatches(patchesData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch patches.');
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

  const handleOperationSuccess = () => {
    setShowAddOrEditForm(false);
    setEditingPatch(null);
    loadPatches();
  };
  
  const openAddForm = () => {
    setEditingPatch(null);
    setShowAddOrEditForm(true);
  };

  const openEditForm = (patch: PatchType) => {
    setEditingPatch(patch);
    setShowAddOrEditForm(true);
  };

  const closeAdminForm = () => {
    setEditingPatch(null);
    setShowAddOrEditForm(false);
  };

  const openDeleteConfirm = (patch: PatchType) => {
    setPatchToDelete(patch);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setPatchToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!patchToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAdminPatch(patchToDelete.id);
      closeDeleteConfirm();
      loadPatches(); // Refresh list
    } catch (err: any) {
      setError(err.message || "Failed to delete patch.");
      console.error("Delete error:", err);
      closeDeleteConfirm(); 
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredPatches = useMemo(() => {
    if (!searchTerm) return patches;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return patches.filter(patch =>
      patch.patch_name.toLowerCase().includes(lowerSearchTerm) ||
      (patch.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (patch.software_name || '').toLowerCase().includes(lowerSearchTerm) ||
      (patch.version_number || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [patches, searchTerm]);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-CA');
    } catch (e) { return 'Invalid Date'; }
  };

  const columns = [
    { key: 'patch_name', header: 'Name' },
    { key: 'version_number', header: 'Version' }, // Display version string
    { key: 'software_name', header: 'Software' },
    { key: 'release_date', header: 'Release Date', render: (patch: PatchType) => formatDate(patch.release_date) },
    { key: 'description', header: 'Description', render: (patch: PatchType) => (
        <span className="text-sm text-gray-600 block max-w-xs truncate" title={patch.description || ''}>
          {patch.description || '-'}
        </span>
      )
    },
    {
      key: 'download_link',
      header: 'Download',
      render: (patch: PatchType) => (
        <a
          href={patch.download_link}
          target={patch.is_external_link || !patch.download_link?.startsWith('/') ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          Download <ExternalLink size={14} className="ml-1" />
        </a>
      )
    },
    ...(isAuthenticated && role === 'admin' ? [{
      key: 'actions',
      header: 'Actions',
      render: (patch: PatchType) => (
        <div className="flex space-x-2">
          <button onClick={() => openEditForm(patch)} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Patch">
            <Edit3 size={16} />
          </button>
          <button onClick={() => openDeleteConfirm(patch)} className="p-1 text-red-600 hover:text-red-800" title="Delete Patch">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }] : [])
  ];
  
  const handleRetryFetch = () => {
      loadPatches();
      if(softwareList.length === 0) { /* ... fetch software ... */ }
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
            onClick={showAddOrEditForm && !editingPatch ? closeAdminForm : openAddForm}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddOrEditForm && !editingPatch ? 'Cancel Add Patch' : 'Add New Patch'}
          </button>
        )}
      </div>

      {showAddOrEditForm && (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminPatchEntryForm
            patchToEdit={editingPatch} // This will be null for "Add" mode
            onPatchAdded={handleOperationSuccess}
            onPatchUpdated={handleOperationSuccess}
            onCancelEdit={closeAdminForm}
          />
        </div>
      )}


      {softwareList.length > 0 && (!error || patches.length > 0) && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error && patches.length === 0 ? (
        <ErrorState message={error} onRetry={handleRetryFetch} />
      ) : (
         <>
        {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>} {/* Inline error for partial data display */}
        <DataTable
          data={filteredPatches}
          columns={columns}
          isLoading={isLoading}
        />
        </>
      )}

      {showDeleteConfirm && patchToDelete && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Delete Patch"
          message={`Are you sure you want to delete the patch "${patchToDelete.patch_name}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={closeDeleteConfirm}
          isConfirming={isDeleting}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
};

export default PatchesView;