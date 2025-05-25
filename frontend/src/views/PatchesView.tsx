// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star } from 'lucide-react';
import { 
  fetchPatches, 
  fetchSoftware, 
  deleteAdminPatch, 
  PaginatedPatchesResponse,
  addFavoriteApi,
  removeFavoriteApi,
  FavoriteItemType 
} from '../services/api';
import { Patch as PatchType, Software } from '../types';
import DataTable, { ColumnDef } from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { showErrorToast } from '../utils/toastUtils'; // Import toast utility

interface OutletContextType {
  searchTerm: string;
}

const PatchesView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);

  const [releaseFromFilter, setReleaseFromFilter] = useState<string>('');
  const [releaseToFilter, setReleaseToFilter] = useState<string>('');
  const [patchedByDeveloperFilter, setPatchedByDeveloperFilter] = useState<string>('');
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalPatches, setTotalPatches] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string>('patch_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track initial load

  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingPatch, setEditingPatch] = useState<PatchType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patchToDelete, setPatchToDelete] = useState<PatchType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());

  const loadPatches = useCallback(async () => {
    setIsLoading(true);
    if (isInitialLoad) {
      setError(null);
    }

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

      const newFavoritedItems = new Map<number, { favoriteId: number | undefined }>();
      if (isAuthenticated && response.patches && response.patches.length > 0) {
        for (const patch of response.patches) {
          if (patch.favorite_id) {
            newFavoritedItems.set(patch.id, { favoriteId: patch.favorite_id });
          } else {
            newFavoritedItems.set(patch.id, { favoriteId: undefined });
          }
        }
      }
      setFavoritedItems(newFavoritedItems);
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    } catch (err: any) {
      console.error("Failed to load patches:", err);
      const errorMessage = err.response?.data?.msg || err.message || 'Failed to fetch patches. Please try again later.';
      if (isInitialLoad) {
        setError(errorMessage);
        setPatches([]);
        setTotalPages(0);
        setTotalPatches(0);
        setFavoritedItems(new Map());
      } else {
        showErrorToast(errorMessage); // Show toast for non-initial load errors
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedSoftwareId, currentPage, itemsPerPage, sortBy, sortOrder,
    releaseFromFilter, releaseToFilter, patchedByDeveloperFilter,
    isAuthenticated, isInitialLoad // Added isInitialLoad
  ]);
  
  useEffect(() => {
    if (!isAuthenticated) {
      setFavoritedItems(new Map()); 
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const loadSoftwareForFilters = async () => {
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
      } catch (err) {
        console.error("Failed to load software for filters", err);
        showErrorToast("Could not load software list for filtering.");
      }
    };
    loadSoftwareForFilters();
  }, []);

  useEffect(() => {
    loadPatches();
  }, [loadPatches]);
  
  const handleApplyAdvancedFilters = () => { setCurrentPage(1); };
  const handleClearAdvancedFilters = () => {
    setReleaseFromFilter('');
    setReleaseToFilter('');
    setPatchedByDeveloperFilter('');
    setCurrentPage(1);
  };
  const handleFilterChange = (softwareId: number | null) => { setSelectedSoftwareId(softwareId); setCurrentPage(1); };
  const handlePageChange = (newPage: number) => { setCurrentPage(newPage); };
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
    setFeedbackMessage(message); // Using feedback message for success, could be toast too
    loadPatches();
  };
  
  const openAddForm = () => { setEditingPatch(null); setShowAddOrEditForm(true); setFeedbackMessage(null); };
  const openEditForm = (patch: PatchType) => { setEditingPatch(patch); setShowAddOrEditForm(true); setFeedbackMessage(null); };
  const closeAdminForm = () => { setEditingPatch(null); setShowAddOrEditForm(false); };
  const openDeleteConfirm = (patch: PatchType) => { setPatchToDelete(patch); setShowDeleteConfirm(true); setFeedbackMessage(null); };
  const closeDeleteConfirm = () => { setPatchToDelete(null); setShowDeleteConfirm(false); };

  const handleDeleteConfirm = async () => {
    if (!patchToDelete) return;
    setIsDeleting(true);
    // No setError(null) here, use toast for this specific action's error
    try {
      await deleteAdminPatch(patchToDelete.id);
      setFeedbackMessage(`Patch "${patchToDelete.patch_name}" deleted successfully.`); // Or use showSuccessToast
      closeDeleteConfirm();
      if (patches.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        loadPatches();
      }
    } catch (err: any) {
      showErrorToast(err.response?.data?.msg || err.message || "Failed to delete patch.");
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
    try { return new Date(dateString).toLocaleDateString('en-CA'); } catch (e) { return 'Invalid Date'; }
  };

  const columns: ColumnDef<PatchType>[] = [
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
      key: 'download_link', header: 'Link',
      render: (patch: PatchType) => (
        <a href={patch.download_link} target={patch.is_external_link || !patch.download_link?.startsWith('/') ? "_blank" : "_self"} rel="noopener noreferrer" className="flex items-center text-blue-600 hover:text-blue-800" onClick={(e) => e.stopPropagation()}>
          Download <ExternalLink size={14} className="ml-1" />
        </a>
      )
    },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (patch) => patch.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (patch) => patch.updated_by_username || 'N/A' },
    { key: 'created_at', header: 'Created At', sortable: true, render: (patch) => formatDate(patch.created_at) },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (patch) => formatDate(patch.updated_at) },
    ...(isAuthenticated ? [{
      key: 'actions' as keyof PatchType | 'actions', header: 'Actions',
      render: (patch: PatchType) => (
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button onClick={(e) => { e.stopPropagation(); handleFavoriteToggle(patch, 'patch' as FavoriteItemType);}} className={`p-1 ${favoritedItems.get(patch.id)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`} title={favoritedItems.get(patch.id)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}>
            <Star size={16} className={favoritedItems.get(patch.id)?.favoriteId ? "fill-current" : ""} />
          </button>
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEditForm(patch);}} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Patch"><Edit3 size={16} /></button>
              <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(patch);}} className="p-1 text-red-600 hover:text-red-800" title="Delete Patch"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ),
    }] : [])
  ];

  const handleFavoriteToggle = async (item: PatchType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) {
      showErrorToast("Please log in to manage favorites."); // Using toast for this feedback
      return;
    }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavoritedItems = new Map(favoritedItems);
    if (isCurrentlyFavorited) { tempFavoritedItems.set(item.id, { favoriteId: undefined }); } 
    else { tempFavoritedItems.set(item.id, { favoriteId: -1 }); } // Placeholder
    setFavoritedItems(tempFavoritedItems);
    setFeedbackMessage(null); // Clear any persistent feedback

    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        // setFeedbackMessage(`"${item.patch_name}" removed from favorites.`); // Toast preferred
        showErrorToast(`"${item.patch_name}" removed from favorites.`, {theme: 'light', autoClose: 3000}); // Example of different toast
        setFavoritedItems(prev => { const newMap = new Map(prev); newMap.set(item.id, { favoriteId: undefined }); return newMap; });
      } else {
        const newFavorite = await addFavoriteApi(item.id, itemType);
        // setFeedbackMessage(`"${item.patch_name}" added to favorites.`); // Toast preferred
        showErrorToast(`"${item.patch_name}" added to favorites.`, {theme: 'light', autoClose: 3000}); // Example of different toast
        setFavoritedItems(prev => { const newMap = new Map(prev); newMap.set(item.id, { favoriteId: newFavorite.id }); return newMap; });
      }
    } catch (error: any) {
      showErrorToast(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      setFavoritedItems(prev => { // Revert optimistic update
        const newMap = new Map(prev);
        if (isCurrentlyFavorited) { newMap.set(item.id, { favoriteId: currentStatus?.favoriteId });} 
        else { newMap.set(item.id, { favoriteId: undefined }); }
        return newMap;
      });
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Patches</h2>
          <p className="text-gray-600 mt-1">Browse and download software patches</p>
        </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
          <button onClick={showAddOrEditForm && !editingPatch ? closeAdminForm : openAddForm} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <PlusCircle size={18} className="mr-2" />
            {showAddOrEditForm && !editingPatch ? 'Cancel Add Patch' : 'Add New Patch'}
          </button>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}

      {showAddOrEditForm && (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminPatchEntryForm patchToEdit={editingPatch} onPatchAdded={() => handleOperationSuccess('Patch added successfully.')} onPatchUpdated={() => handleOperationSuccess('Patch updated successfully.')} onCancelEdit={closeAdminForm} />
        </div>
      )}

      {softwareList.length > 0 && ( <FilterTabs software={softwareList} selectedSoftwareId={selectedSoftwareId} onSelectFilter={handleFilterChange} /> )}

      <div className="my-4 p-4 border rounded-md bg-gray-50 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
        <div className="flex flex-col">
          <label htmlFor="patchedByDeveloperFilterInput" className="text-sm font-medium text-gray-700 mb-1">Developer</label>
          <input id="patchedByDeveloperFilterInput" type="text" value={patchedByDeveloperFilter} onChange={(e) => setPatchedByDeveloperFilter(e.target.value)} placeholder="e.g., John Doe" className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Released Between</label>
          <div className="flex items-center gap-2">
            <input type="date" value={releaseFromFilter} onChange={(e) => setReleaseFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            <span className="text-gray-500">and</span>
            <input type="date" value={releaseToFilter} onChange={(e) => setReleaseToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
          </div>
        </div>
        <div className="flex items-end gap-2 pt-5">
          <button onClick={handleApplyAdvancedFilters} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm">Apply Filters</button>
          <button onClick={handleClearAdvancedFilters} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm">Clear Filters</button>
        </div>
      </div>

      {isInitialLoad && isLoading ? (
        <LoadingState />
      ) : error && isInitialLoad && patches.length === 0 ? (
        <ErrorState message={error} onRetry={loadPatches} />
      ) : (
         <>
        <DataTable
          columns={columns}
          data={filteredPatchesBySearch}
          rowClassName="group" // Added group class for row hover effect
          isLoading={isLoading && !isInitialLoad} // Show DataTable's internal loading only for non-initial loads
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
        <ConfirmationModal isOpen={showDeleteConfirm} title="Delete Patch" message={`Are you sure you want to delete the patch "${patchToDelete.patch_name}"? This action cannot be undone.`} onConfirm={handleDeleteConfirm} onCancel={closeDeleteConfirm} isConfirming={isDeleting} confirmButtonText="Delete" confirmButtonVariant="danger" />
      )}
    </div>
  );
};

export default PatchesView;