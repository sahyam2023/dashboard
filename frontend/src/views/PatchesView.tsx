// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star } from 'lucide-react'; // Added Star
import { fetchPatches, fetchSoftware, deleteAdminPatch, PaginatedPatchesResponse } from '../services/api'; // Import PaginatedPatchesResponse
import { Patch as PatchType, Software } from '../types';
import { useFavorites } from '../context/FavoritesContext'; // Added useFavorites
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
  const { addFavoriteItem, removeFavoriteItem, isFavorited, isLoadingFavorites } = useFavorites(); // Consumed favorites context

  // Data and Table State
  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null); // Filter state

  // Advanced Filter States
  const [releaseFromFilter, setReleaseFromFilter] = useState<string>('');
  const [releaseToFilter, setReleaseToFilter] = useState<string>('');
  const [patchedByDeveloperFilter, setPatchedByDeveloperFilter] = useState<string>('');
  
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

  // Favorite Filter State
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);

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
        sortOrder,
        releaseFromFilter || undefined,
        releaseToFilter || undefined,
        patchedByDeveloperFilter || undefined
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
  }, [selectedSoftwareId, currentPage, itemsPerPage, sortBy, sortOrder, releaseFromFilter, releaseToFilter, patchedByDeveloperFilter]);

  // Handler for applying advanced filters
  const handleApplyAdvancedFilters = () => {
    setCurrentPage(1); // This will trigger loadPatches due to dependency
  };

  // Handler for clearing advanced filters
  const handleClearAdvancedFilters = () => {
    setReleaseFromFilter('');
    setReleaseToFilter('');
    setPatchedByDeveloperFilter('');
    // setSelectedSoftwareId(null); // Optional: Clear software tab filter as well
    setCurrentPage(1); // This will trigger loadPatches
  };

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

  const patchesToDisplay = useMemo(() => {
    let processedPatches = filteredPatchesBySearch; // Start with text-searched patches

    // Then, apply "Show Favorites Only" filter if active
    if (showFavoritesOnly) {
      // The item type for patches is 'patch'
      processedPatches = processedPatches.filter(patch => isFavorited(patch.id, 'patch'));
    }
    
    return processedPatches;
  }, [filteredPatchesBySearch, showFavoritesOnly, isFavorited]); // Add dependencies

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-CA'); // YYYY-MM-DD format
    } catch (e) { return 'Invalid Date'; }
  };

  const columns: ColumnDef<PatchType>[] = [
    // Favorite Column
    {
      key: 'favorite' as keyof PatchType | 'favorite',
      header: '', // No text header
      render: (patch: PatchType) => {
        const isPatchFavorited = isFavorited(patch.id, 'patch');
        
        const handleFavoriteToggle = async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            if (isPatchFavorited) {
              await removeFavoriteItem('patch', patch.id);
            } else {
              await addFavoriteItem(patch.id, 'patch');
            }
          } catch (error) {
            console.error('Failed to toggle patch favorite:', error);
            // Optionally show a toast error to the user here
          }
        };

        return (
          <button
            onClick={handleFavoriteToggle}
            disabled={isLoadingFavorites}
            title={isPatchFavorited ? 'Remove from favorites' : 'Add to favorites'}
            className={`p-1 rounded-full hover:bg-gray-200 ${isPatchFavorited ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-400'}`}
          >
            <Star size={18} fill={isPatchFavorited ? 'currentColor' : 'none'} />
          </button>
        );
      },
    },
    // Existing Columns
    { key: 'patch_name', header: 'Patch Name', sortable: true },
    { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_number', header: 'Version', sortable: true },
    { key: 'patch_by_developer', header: 'Patch Developer', sortable: true, render: (patch) => patch.patch_by_developer || '-' },
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
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (patch) => patch.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (patch) => patch.updated_by_username || 'N/A' }, // Not typically sorted
    { key: 'created_at', header: 'Created At', sortable: true, render: (patch) => formatDate(patch.created_at) },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (patch) => formatDate(patch.updated_at) },
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

      {/* Advanced Filter UI */}
      <div className="my-4 p-4 border rounded-md bg-gray-50 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-start md:gap-4"> {/* Changed items-end to items-start for better alignment with checkbox */}
        {/* Patched By Developer Filter */}
        <div className="flex flex-col">
          <label htmlFor="patchedByDeveloperFilterInput" className="text-sm font-medium text-gray-700 mb-1">Developer</label>
          <input
            id="patchedByDeveloperFilterInput"
            type="text"
            value={patchedByDeveloperFilter}
            onChange={(e) => setPatchedByDeveloperFilter(e.target.value)}
            placeholder="e.g., John Doe"
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {/* Release Date Filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Released Between</label>
          <div className="flex items-center gap-2">
            <input type="date" value={releaseFromFilter} onChange={(e) => setReleaseFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            <span className="text-gray-500">and</span>
            <input type="date" value={releaseToFilter} onChange={(e) => setReleaseToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-end gap-2 pt-5"> {/* pt-5 to align with labels if inputs are taller */}
          <button
            onClick={handleApplyAdvancedFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearAdvancedFilters}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm"
          >
            Clear Filters
          </button>
        </div>
        {/* Show Favorites Only Checkbox */}
        <div className="flex items-center pt-5"> {/* Adjust styling as needed, pt-5 if it's in the same row as buttons */}
          <input
            type="checkbox"
            id="showFavoritesOnlyCheckboxPatches" // Unique ID
            checked={showFavoritesOnly}
            onChange={(e) => setShowFavoritesOnly(e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="showFavoritesOnlyCheckboxPatches" className="ml-2 text-sm text-gray-700">
            Show Favorites Only
          </label>
        </div>
      </div>

      {error && patches.length === 0 && !isLoading ? (
        <ErrorState message={error} onRetry={loadPatches} />
      ) : (
         <>
        {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <DataTable
          columns={columns}
          data={patchesToDisplay} // Use the new filtered list
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