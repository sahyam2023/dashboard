// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2 } from 'lucide-react';
import { fetchPatches, fetchSoftware, deleteAdminPatch, PaginatedPatchesResponse } from '../services/api'; // Import PaginatedPatchesResponse
import { Patch as PatchType, Software } from '../types';
import DataTable, { ColumnDef } from '../components/DataTable'; // Import DataTable and ColumnDef
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState'; // Can be replaced by DataTable's isLoading
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';

interface OutletContextType {
  searchTerm: string;
}

const PatchesView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  // Data and Table State
  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null); // Filter state
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalPatches, setTotalPatches] = useState<number>(0);

  // Sorting State
  const [sortBy, setSortBy] = useState<string>('patch_name'); // Default sort column
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Loading and Error State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State for Forms and Modals
  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingPatch, setEditingPatch] = useState<PatchType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patchToDelete, setPatchToDelete] = useState<PatchType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadPatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // setFeedbackMessage(null); // Clear previous feedback
    try {
      const response: PaginatedPatchesResponse = await fetchPatches(
        selectedSoftwareId === null ? undefined : selectedSoftwareId,
        currentPage,
        itemsPerPage,
        sortBy,
        sortOrder
      );
      setPatches(response.patches);
      setTotalPages(response.total_pages);
      setTotalPatches(response.total_patches);
      setCurrentPage(response.page); 
      setItemsPerPage(response.per_page);
    } catch (err: any) {
      setPatches([]); // Add this line
      setError(err.message || 'Failed to fetch patches.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSoftwareId, currentPage, itemsPerPage, sortBy, sortOrder]);

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
    setCurrentPage(1); 
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
    setCurrentPage(1); 
  };

  const handleOperationSuccess = (message: string) => {
    setShowAddOrEditForm(false);
    setEditingPatch(null);
    setFeedbackMessage(message);
    loadPatches();
  };
  
  const openAddForm = () => {
    setEditingPatch(null);
    setShowAddOrEditForm(true);
    setFeedbackMessage(null);
  };

  const openEditForm = (patch: PatchType) => {
    setEditingPatch(patch);
    setShowAddOrEditForm(true);
    setFeedbackMessage(null);
  };

  const closeAdminForm = () => {
    setEditingPatch(null);
    setShowAddOrEditForm(false);
  };

  const openDeleteConfirm = (patch: PatchType) => {
    setPatchToDelete(patch);
    setShowDeleteConfirm(true);
    setFeedbackMessage(null);
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
      setFeedbackMessage(`Patch "${patchToDelete.patch_name}" deleted successfully.`);
      closeDeleteConfirm();
      if (patches.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        loadPatches();
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete patch.");
      closeDeleteConfirm(); 
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredPatchesBySearch = useMemo(() => {
    if (!searchTerm) return patches;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return patches.filter(patch =>
      patch.patch_name.toLowerCase().includes(lowerSearchTerm) ||
      (patch.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (patch.software_name || '').toLowerCase().includes(lowerSearchTerm) ||
      (patch.version_number || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [patches, searchTerm]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-CA'); // YYYY-MM-DD format
    } catch (e) { return 'Invalid Date'; }
  };

  const columns: ColumnDef<PatchType>[] = [
    { key: 'patch_name', header: 'Patch Name', sortable: true },
    { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_number', header: 'Version', sortable: true },
    { key: 'description', header: 'Description', render: (patch: PatchType) => (
        <span className="text-sm text-gray-600 block max-w-xs truncate" title={patch.description || ''}>
          {patch.description || '-'}
        </span>
      )
    },
    { key: 'release_date', header: 'Release Date', sortable: true, render: (patch) => formatDate(patch.release_date) },
    {
      key: 'download_link',
      header: 'Link',
      render: (patch: PatchType) => (
        <a
          href={patch.download_link}
          target={patch.is_external_link || !patch.download_link?.startsWith('/') ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          Download <ExternalLink size={14} className="ml-1" />
        </a>
      )
    },
    { key: 'created_at', header: 'Created At', sortable: true, render: (patch) => formatDate(patch.created_at) },
    ...(isAuthenticated && (role === 'admin' || role === 'super_admin') ? [{
      key: 'actions' as keyof PatchType | 'actions',
      header: 'Actions',
      render: (patch: PatchType) => (
        <div className="flex space-x-2">
          <button onClick={(e) => { e.stopPropagation(); openEditForm(patch);}} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Patch"><Edit3 size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(patch);}} className="p-1 text-red-600 hover:text-red-800" title="Delete Patch"><Trash2 size={16} /></button>
        </div>
      ),
    }] : [])
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Patches</h2>
          <p className="text-gray-600 mt-1">Browse and download software patches</p>
        </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
          <button
            onClick={showAddOrEditForm && !editingPatch ? closeAdminForm : openAddForm}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddOrEditForm && !editingPatch ? 'Cancel Add Patch' : 'Add New Patch'}
          </button>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}

      {showAddOrEditForm && (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminPatchEntryForm
            patchToEdit={editingPatch}
            onPatchAdded={() => handleOperationSuccess('Patch added successfully.')}
            onPatchUpdated={() => handleOperationSuccess('Patch updated successfully.')}
            onCancelEdit={closeAdminForm}
          />
        </div>
      )}

      {softwareList.length > 0 && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {error && patches.length === 0 && !isLoading ? (
        <ErrorState message={error} onRetry={loadPatches} />
      ) : (
         <>
        {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <DataTable
          columns={columns}
          data={filteredPatchesBySearch}
          isLoading={isLoading}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          totalItems={totalPatches}
          sortColumn={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
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