// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp, Download, Move, AlertTriangle, Package as PackageIcon, MessageSquare } from 'lucide-react';
import {
  fetchPatches,
  fetchSoftware,
  deleteAdminPatch,
  PaginatedPatchesResponse,
  addFavoriteApi,
  removeFavoriteApi,
  FavoriteItemType,
  fetchVersionsForSoftware, // For Move Modal
  bulkDeleteItems,
  bulkDownloadItems,
  bulkMoveItems,
  BulkItemType,
} from '../services/api';
import { Patch as PatchType, Software, SoftwareVersion } from '../types';
import CommentSection from '../components/comments/CommentSection'; // Added CommentSection
import DataTable, { ColumnDef } from '../components/DataTable';
import { formatToISTLocaleString, formatDateDisplay } from '../utils'; // Updated import
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm';
import Fuse from 'fuse.js';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import Modal from '../components/shared/Modal';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils';

interface OutletContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const PatchesView: React.FC = () => {
  const { searchTerm, setSearchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, user } = useAuth();
  const role = user?.role; // Access role safely, as user can be null
  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);

  const [releaseFromFilter, setReleaseFromFilter] = useState<string>('');
  const [releaseToFilter, setReleaseToFilter] = useState<string>('');
  const [patchedByDeveloperFilter, setPatchedByDeveloperFilter] = useState<string>('');

  // Debounced filter states
  const [debouncedReleaseFromFilter, setDebouncedReleaseFromFilter] = useState<string>('');
  const [debouncedReleaseToFilter, setDebouncedReleaseToFilter] = useState<string>('');
  const [debouncedPatchedByDeveloperFilter, setDebouncedPatchedByDeveloperFilter] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15); // Default items per page
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalPatches, setTotalPatches] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string>('patch_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingPatch, setEditingPatch] = useState<PatchType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [patchToDelete, setPatchToDelete] = useState<PatchType | null>(null);
  const [isProcessingSingleItem, setIsProcessingSingleItem] = useState(false);

  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Bulk Action States
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<number>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState<boolean>(false);
  const [isMovingSelected, setIsMovingSelected] = useState<boolean>(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState<boolean>(false);
  const [modalSelectedSoftwareId, setModalSelectedSoftwareId] = useState<number | null>(null);
  const [modalVersionsList, setModalVersionsList] = useState<SoftwareVersion[]>([]);
  const [modalSelectedVersionId, setModalSelectedVersionId] = useState<number | null>(null);
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState<boolean>(false);
  const [isLoadingModalVersions, setIsLoadingModalVersions] = useState<boolean>(false);

  // State for Comment Section
  const [selectedPatchForComments, setSelectedPatchForComments] = useState<PatchType | null>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const location = useLocation(); // Added useLocation

  const filtersAreActive = useMemo(() => {
    return (
      selectedSoftwareId !== null ||
      releaseFromFilter !== '' ||
      releaseToFilter !== '' ||
      patchedByDeveloperFilter !== '' ||
      searchTerm !== ''
    );
  }, [selectedSoftwareId, releaseFromFilter, releaseToFilter, patchedByDeveloperFilter, searchTerm]);

  const handleClearAllFiltersAndSearch = useCallback(() => {
    setSelectedSoftwareId(null);
    setReleaseFromFilter('');
    setReleaseToFilter('');
    setPatchedByDeveloperFilter('');
    if (setSearchTerm) setSearchTerm('');
    // Note: fetchAndSetPatches(1, true) will be called by useEffect due to filter state changes.
  }, [setSearchTerm]);

  const handleApplyAdvancedFilters = () => {
    fetchAndSetPatches(1, true);
  };

  const handleClearAdvancedFilters = () => {
    setReleaseFromFilter('');
    setReleaseToFilter('');
    setPatchedByDeveloperFilter('');
    // fetchAndSetPatches(1, true) is triggered by useEffect due to filter state changes.
  };

  const fetchAndSetPatches = useCallback(async (pageToLoad: number, isNewQuery: boolean = false) => {
    if (isNewQuery) setIsLoadingInitial(true);
    setError(null);

    try {
      const response: PaginatedPatchesResponse = await fetchPatches(
        selectedSoftwareId ?? undefined, pageToLoad, itemsPerPage, sortBy, sortOrder,
        debouncedReleaseFromFilter || undefined,
        debouncedReleaseToFilter || undefined,
        debouncedPatchedByDeveloperFilter || undefined,
        searchTerm // Pass searchTerm to the API call
      );
      setPatches(response.patches);
      setTotalPages(response.total_pages);
      setTotalPatches(response.total_patches);
      setCurrentPage(response.page);
      setItemsPerPage(response.per_page);

      const newFavoritedItems = new Map<number, { favoriteId: number | undefined }>();
      if (isAuthenticated && response.patches) {
        for (const patch of response.patches) {
          newFavoritedItems.set(patch.id, { favoriteId: patch.favorite_id });
        }
      }
      setFavoritedItems(newFavoritedItems);
    } catch (err: any) {
      const msg = err.response?.data?.msg || err.message || 'Failed to fetch patches.';
      if (isNewQuery) { setError(msg); setPatches([]); setTotalPages(0); setTotalPatches(0); }
      else showErrorToast(msg);
    } finally {
      if (isNewQuery) setIsLoadingInitial(false);
    }
  }, [
    selectedSoftwareId, itemsPerPage, sortBy, sortOrder,
    debouncedReleaseFromFilter, debouncedReleaseToFilter, debouncedPatchedByDeveloperFilter,
    isAuthenticated, searchTerm // Added searchTerm to dependency array
  ]);

  // Debounce effects for filter inputs
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedReleaseFromFilter(releaseFromFilter), 500);
    return () => clearTimeout(handler);
  }, [releaseFromFilter]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedReleaseToFilter(releaseToFilter), 500);
    return () => clearTimeout(handler);
  }, [releaseToFilter]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedPatchedByDeveloperFilter(patchedByDeveloperFilter), 500);
    return () => clearTimeout(handler);
  }, [patchedByDeveloperFilter]);

  useEffect(() => {
    if (isAuthenticated) fetchAndSetPatches(1, true);
    else { setPatches([]); setIsLoadingInitial(false); }
  }, [isAuthenticated, selectedSoftwareId, sortBy, sortOrder, debouncedReleaseFromFilter, debouncedReleaseToFilter, debouncedPatchedByDeveloperFilter, searchTerm, fetchAndSetPatches]); // Added searchTerm

  // Effect to handle focusing on a comment if item_id and comment_id are in URL
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const itemIdStr = queryParams.get('item_id');
    const commentIdStr = queryParams.get('comment_id');

    if (itemIdStr && commentIdStr && patches.length > 0) {
      const targetPatchId = parseInt(itemIdStr, 10);

      if (!isNaN(targetPatchId)) {
        const targetPatch = patches.find(patch => patch.id === targetPatchId);

        if (targetPatch) {
          if (!selectedPatchForComments || selectedPatchForComments.id !== targetPatch.id) {
            setSelectedPatchForComments(targetPatch);
          }
          setTimeout(() => {
            commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        } else {
          console.warn(`PatchesView: Patch with item_id ${targetPatchId} not found in the current list.`);
        }
      }
    }
  }, [location.search, patches, selectedPatchForComments]); // Added selectedPatchForComments to dependencies to re-evaluate if it changes externally

  useEffect(() => { setSelectedPatchIds(new Set()); },
    [selectedSoftwareId, sortBy, sortOrder, debouncedReleaseFromFilter, debouncedReleaseToFilter, debouncedPatchedByDeveloperFilter, searchTerm, currentPage]
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchSoftware().then(setSoftwareList).catch(err => showErrorToast("Failed to load software list."));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (modalSelectedSoftwareId) {
      setIsLoadingModalVersions(true);
      fetchVersionsForSoftware(modalSelectedSoftwareId)
        .then(setModalVersionsList)
        .catch(() => showErrorToast("Failed to load versions for move target."))
        .finally(() => setIsLoadingModalVersions(false));
    } else {
      setModalVersionsList([]);
    }
  }, [modalSelectedSoftwareId]);

  const handleFilterChange = (id: number | null) => setSelectedSoftwareId(id);
  const handleSort = (key: string) => { setSortBy(key); setSortOrder(prev => (sortBy === key && prev === 'asc' ? 'desc' : 'asc')); };
  const handlePageChange = (newPage: number) => fetchAndSetPatches(newPage, true);

  const handleOperationSuccess = (message: string) => {
    setShowAddOrEditForm(false); setEditingPatch(null); /* showSuccessToast(message); */ fetchAndSetPatches(1, true);
  };

  const openAddForm = () => { setEditingPatch(null); setShowAddOrEditForm(true); };
  const openEditForm = (patch: PatchType) => { setEditingPatch(patch); setShowAddOrEditForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeAdminForm = () => { setEditingPatch(null); setShowAddOrEditForm(false); };
  const openDeleteConfirm = (patch: PatchType) => { setPatchToDelete(patch); setShowDeleteConfirm(true); };
  const closeDeleteConfirm = () => { setPatchToDelete(null); setShowDeleteConfirm(false); };

  const handleDeleteConfirm = async () => {
    if (!patchToDelete) return;
    setIsProcessingSingleItem(true);
    if (selectedPatchForComments && selectedPatchForComments.id === patchToDelete.id) {
      setSelectedPatchForComments(null);
    }
    try {
      await deleteAdminPatch(patchToDelete.id);
      showSuccessToast(`Patch "${patchToDelete.patch_name}" deleted.`);
      closeDeleteConfirm(); fetchAndSetPatches(1, true);
    } catch (err: any) { showErrorToast(err.message || "Delete failed."); closeDeleteConfirm(); }
    finally { setIsProcessingSingleItem(false); }
  };

  const filteredPatchesBySearch = useMemo(() => {
    if (!searchTerm) {
      return patches;
    }
    const fuse = new Fuse(patches, {
      keys: ['patch_name', 'description', 'software_name', 'version_number', 'uploaded_by_username', 'updated_by_username'],
      includeScore: true,
      threshold: 0.4,
    });
    return fuse.search(searchTerm).map(item => item.item);
  }, [patches, searchTerm]);

  const handleSelectItem = (id: number, isSelected: boolean) => setSelectedPatchIds(prev => { const n = new Set(prev); if (isSelected) n.add(id); else n.delete(id); return n; });
  const handleSelectAllItems = (isSelected: boolean) => { const n = new Set<number>(); if (isSelected) filteredPatchesBySearch.forEach(p => n.add(p.id)); setSelectedPatchIds(n); };

  const handleBulkDeleteClick = () => { if (selectedPatchIds.size === 0) { showErrorToast("No items selected."); return; } setShowBulkDeleteConfirmModal(true); };
  const confirmBulkDeletePatches = async () => {
    setShowBulkDeleteConfirmModal(false); setIsDeletingSelected(true);
    if (selectedPatchForComments && selectedPatchIds.has(selectedPatchForComments.id)) {
      setSelectedPatchForComments(null);
    }
    try {
      const res = await bulkDeleteItems(Array.from(selectedPatchIds), 'patch');
      showSuccessToast(res.msg || `${res.deleted_count} patch(es) deleted.`);
      setSelectedPatchIds(new Set()); fetchAndSetPatches(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk delete failed."); }
    finally { setIsDeletingSelected(false); }
  };

  const handleBulkDownloadPatches = async () => {
    if (selectedPatchIds.size === 0) {
      showErrorToast("No items selected.");
      return;
    }

    const downloadablePatches = patches.filter(patch =>
      selectedPatchIds.has(patch.id) &&
      !patch.is_external_link &&
      patch.is_downloadable !== false
    );

    if (downloadablePatches.length === 0) {
      showErrorToast("No downloadable patch files selected. External links or non-downloadable items cannot be bulk downloaded.");
      return;
    }

    const downloadablePatchIds = downloadablePatches.map(patch => patch.id);

    setIsDownloadingSelected(true);
    try {
      const blob = await bulkDownloadItems(downloadablePatchIds, 'patch' as BulkItemType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/:/g, '-');
      a.download = `bulk_download_patches_${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (downloadablePatchIds.length === selectedPatchIds.size) {
        showSuccessToast('Download started for all selected downloadable patches.');
      } else {
        showSuccessToast(`Starting download for ${downloadablePatchIds.length} patch file(s). External links or non-downloadable items were excluded.`);
      }
    } catch (e: any) {
      showErrorToast(e.message || "Bulk download failed.");
    } finally {
      setIsDownloadingSelected(false);
    }
  };

  const handleOpenBulkMovePatchesModal = () => {
    if (selectedPatchIds.size === 0) { showErrorToast("No items selected."); return; }
    if (softwareList.length === 0) { showErrorToast("Software list unavailable."); return; }
    setModalSelectedSoftwareId(null); setModalSelectedVersionId(null); setShowBulkMoveModal(true);
  };
  const handleConfirmBulkMovePatches = async () => {
    if (!modalSelectedVersionId) { showErrorToast("Select target version."); return; }
    setShowBulkMoveModal(false); setIsMovingSelected(true);
    try {
      const res = await bulkMoveItems(Array.from(selectedPatchIds), 'patch', { target_version_id: modalSelectedVersionId });
      showSuccessToast(res.msg || `${res.moved_count} patch(es) moved.`);
      setSelectedPatchIds(new Set()); fetchAndSetPatches(1, true);
    } catch (e: any) {
      if (
        e.response &&
        e.response.data &&
        e.response.data.conflicted_items &&
        Array.isArray(e.response.data.conflicted_items) &&
        e.response.data.conflicted_items.length > 0 &&
        (e.response.status === 400 || e.response.status === 207)
      ) {
        let detailedErrorMessage = "Bulk move could not be completed for some patches due to naming conflicts. ";
        const conflicts = e.response.data.conflicted_items;
        const conflictSummaries = conflicts.slice(0, 3).map((item: { name: string; id: number }) => `"${item.name}" (ID ${item.id})`).join(', ');
        detailedErrorMessage += `Conflicting items: ${conflictSummaries}`;
        if (conflicts.length > 3) {
          detailedErrorMessage += ` and ${conflicts.length - 3} more.`;
        }
        detailedErrorMessage += " Please rename the patches or check the target version.";
        showErrorToast(detailedErrorMessage);
        // Also log the original backend message for more context in console
        if (e.response.data.msg) {
          // console.warn('[PatchesView] Backend message for conflict:', e.response.data.msg); // Removed
        }
      } else if (e.message && typeof e.message === 'string' && e.message.includes("UNIQUE constraint failed")) {
        showErrorToast("A patch with this name already exists for the target software/version. Please check for duplicates.");
     } else if (e.message) {
       showErrorToast(e.message);
     } else {
        showErrorToast("Bulk move failed due to an unexpected error.");
      }
      // It's good practice to also log the full error for debugging purposes
      // console.error('[PatchesView] Full error object during bulk move:', e); // Removed
    }
    finally { setIsMovingSelected(false); setModalSelectedSoftwareId(null); setModalSelectedVersionId(null); }
  };

  // const formatDate helper is no longer needed as we use specific utility functions now.
  const columns: ColumnDef<PatchType>[] = [
    { key: 'patch_name', header: 'Patch Name', sortable: true }, { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_number', header: 'Version', sortable: true },
    { key: 'patch_by_developer', header: 'Developer', sortable: true, render: p => p.patch_by_developer || '-' },
    {
      key: 'compatible_vms_versions',
      header: 'VMS Compatibility',
      sortable: true, // Backend supports sorting by this string
      render: (patch: PatchType) => {
        // software_name is directly available on the PatchType from the backend join
        const isRelevantSoftware = patch.software_name === 'VMS' || patch.software_name === 'VA';
        let content: React.ReactNode = '-'; // Default content

        if (isRelevantSoftware) {
          if (patch.compatible_vms_versions && patch.compatible_vms_versions.length > 0) {
            // If it's an array of strings (version numbers)
            if (Array.isArray(patch.compatible_vms_versions)) {
              content = patch.compatible_vms_versions.join(', ');
            }
            // If it's a single string (comma-separated, as GROUP_CONCAT produces)
            // This check might be redundant if frontend type enforces array, but good for safety
            else if (typeof patch.compatible_vms_versions === 'string') {
              content = patch.compatible_vms_versions;
            } else {
              content = 'N/A'; // VMS/VA but data is in unexpected format or empty
            }
          } else {
            content = 'N/A'; // VMS/VA but no compatibility versions set
          }
        }
        // Wrap the content in a div with text-center for alignment
        return <div className="text-center">{content}</div>;
      }
    },
    { key: 'description', header: 'Description', render: p => <span className="text-sm text-gray-600 block max-w-xs truncate" title={p.description || ''}>{p.description || '-'}</span> },
    { key: 'release_date', header: 'Release Date', sortable: true, render: (item: PatchType) => formatDateDisplay(item.release_date) }, // Stays the same
    {
      key: 'download_link',
      header: 'Link',
      render: (p: PatchType) => {
        const isEffectivelyDownloadable = p.is_external_link || p.is_downloadable !== false;
        if (!isEffectivelyDownloadable && !p.is_external_link) {
          return (
            <span className="flex items-center text-gray-400 cursor-not-allowed" title="Download not permitted">
              <Download size={14} className="mr-1" />Link
            </span>
          );
        }
        return (
          <a
            href={p.download_link}
            target={p.is_external_link || !p.download_link?.startsWith('/') ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className={`flex items-center ${isEffectivelyDownloadable ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'}`}
            onClick={(e) => {
              if (!isEffectivelyDownloadable) e.preventDefault();
              e.stopPropagation();
            }}
            title={isEffectivelyDownloadable ? (p.is_external_link ? "Open external link" : "Download patch") : "Download not permitted"}
          >
            <Download size={14} className="mr-1" />Link
          </a>
        );
      }
    },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: p => p.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: p => p.updated_by_username || 'N/A' },
    { key: 'created_at', header: 'Created At', sortable: true, render: (item: PatchType) => formatToISTLocaleString(item.created_at ?? '') },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (item: PatchType) => formatToISTLocaleString(item.updated_at ?? '') },
    {
      key: 'actions' as any,
      header: 'Actions',
      render: (p: PatchType) => (
        <div className="flex space-x-1 items-center">
          {isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFavoriteToggle(p, 'patch');
              }}
              className={`p-1 rounded-md ${favoritedItems.get(p.id)?.favoriteId ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
              title={favoritedItems.get(p.id)?.favoriteId ? "Remove Favorite" : "Add Favorite"}
            >
              <Star size={16} className={favoritedItems.get(p.id)?.favoriteId ? "fill-current" : ""} />
            </button>
          )}
          {isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedPatchForComments && selectedPatchForComments.id === p.id) {
                  setSelectedPatchForComments(null);
                } else {
                  setSelectedPatchForComments(p);
                  setTimeout(() => commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
                }
              }}
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-md"
              title={selectedPatchForComments && selectedPatchForComments.id === p.id ? "Hide Comments" : "View Comments"}
            >
              <MessageSquare size={16} />
              <span className="ml-1 text-xs">({p.comment_count ?? 0})</span>
            </button>
          )}
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={e => { e.stopPropagation(); openEditForm(p); }} className="p-1 text-blue-600 hover:text-blue-800 rounded-md" title="Edit">
                <Edit3 size={16} />
              </button>
              <button onClick={e => { e.stopPropagation(); openDeleteConfirm(p); }} className="p-1 text-red-600 hover:text-red-800 rounded-md" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )
    },
  ];

  const loadPatchesCallback = useCallback(() => { fetchAndSetPatches(1, true); }, [fetchAndSetPatches]);

  const handleFavoriteToggle = async (item: PatchType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) { showErrorToast("Please log in to manage favorites."); return; }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavs = new Map(favoritedItems);
    if (isCurrentlyFavorited) tempFavs.set(item.id, { favoriteId: undefined }); else tempFavs.set(item.id, { favoriteId: -1 });
    setFavoritedItems(tempFavs);
    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        showSuccessToast(`"${item.patch_name}" removed from favorites.`);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: undefined }); return n; });
      } else {
        const newFav = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: newFav.id }); return n; });
        showSuccessToast(`"${item.patch_name}" added to favorites.`);
      }
    } catch (e: any) {
      showErrorToast(e?.response?.data?.msg || e.message || "Failed to update favorite.");
      setFavoritedItems(prev => { const n = new Map(prev); if (isCurrentlyFavorited) n.set(item.id, { favoriteId: currentStatus?.favoriteId }); else n.set(item.id, { favoriteId: undefined }); return n; });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div> <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Patches</h2> <p className="text-gray-600 mt-1 dark:text-gray-300">Browse and manage software patches.</p> </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && !editingPatch && (
          <button onClick={showAddOrEditForm ? closeAdminForm : openAddForm} className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <PlusCircle size={18} className="mr-2" /> {showAddOrEditForm ? 'Cancel' : 'Add New Patch'}
          </button>
        )}
      </div>

      {showAddOrEditForm && (<div className="my-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow"> <AdminPatchEntryForm patchToEdit={editingPatch} onPatchAdded={() => handleOperationSuccess('Patch added.')} onPatchUpdated={() => handleOperationSuccess('Patch updated.')} onCancelEdit={closeAdminForm} /> </div>)}

      {selectedPatchIds.size > 0 && (
        <div className="my-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selectedPatchIds.size} item(s) selected</span>
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleBulkDeleteClick} disabled={isDeletingSelected} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 focus:ring-red-500 disabled:opacity-50"><Trash2 size={14} className="mr-1.5" />Delete</button>)}
            {isAuthenticated && (<button onClick={handleBulkDownloadPatches} disabled={isDownloadingSelected} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 focus:ring-green-500 disabled:opacity-50"><Download size={14} className="mr-1.5" />Download</button>)}
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleOpenBulkMovePatchesModal} disabled={isMovingSelected} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 focus:ring-blue-500 disabled:opacity-50"><Move size={14} className="mr-1.5" />Move</button>)}
          </div>
        </div>
      )}

      {softwareList.length > 0 && <FilterTabs software={softwareList} selectedSoftwareId={selectedSoftwareId} onSelectFilter={handleFilterChange} />}

      <div className="my-4"><button onClick={() => setShowAdvancedFilters(p => !p)} className="flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md text-sm font-medium">{showAdvancedFilters ? (<><ChevronUp size={18} className="mr-2" />Hide</>) : (<><Filter size={18} className="mr-2" />Show</>)} Advanced Filters</button></div>
      {showAdvancedFilters && (
        <div className="my-4 p-4 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
          <div><label htmlFor="patchedByDevFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Developer</label><input id="patchedByDevFilter" type="text" value={patchedByDeveloperFilter} onChange={e => setPatchedByDeveloperFilter(e.target.value)} placeholder="e.g., Main Dev" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Released</label><div className="flex items-center gap-2"><input type="date" value={releaseFromFilter} onChange={e => setReleaseFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" /><span className="text-gray-500 dark:text-gray-400">to</span><input type="date" value={releaseToFilter} onChange={e => setReleaseToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" /></div></div>
          <div className="flex items-end gap-2 pt-5"><button onClick={handleClearAdvancedFilters} className="text-sm px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Clear</button></div>
        </div>
      )}

      {isLoadingInitial ? (
        <div className="py-10"><LoadingState message="Loading patches..." /></div>
      ) : error && patches.length === 0 && !isLoadingInitial ? (
        <ErrorState message={error} onRetry={loadPatchesCallback} />
      ) : !isLoadingInitial && !error && patches.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow-sm my-6">
          <PackageIcon size={48} className="mx-auto text-yellow-500 dark:text-yellow-400 mb-4" />
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-3">
            {filtersAreActive ? "No Patches Found Matching Criteria" : "No Patches Available"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 px-4">
            {filtersAreActive ? "Try adjusting or clearing your search/filter settings." :
              (role === 'admin' || role === 'super_admin') ? "Add new patches to get started." : "Please check back later."}
          </p>
          {filtersAreActive && (<button onClick={handleClearAllFiltersAndSearch} className="mt-6 btn-primary text-sm">Clear All Filters & Search</button>)}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredPatchesBySearch} rowClassName="group" isLoading={isLoadingInitial || isProcessingSingleItem} currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} itemsPerPage={itemsPerPage} totalItems={totalPatches} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} isSelectionEnabled={true} selectedItemIds={selectedPatchIds} onSelectItem={handleSelectItem} onSelectAllItems={handleSelectAllItems} />
      )}

      {showDeleteConfirm && patchToDelete && (<ConfirmationModal isOpen={showDeleteConfirm} title="Delete Patch" message={`Delete "${patchToDelete.patch_name}"?`} onConfirm={handleDeleteConfirm} onCancel={closeDeleteConfirm} isConfirming={isProcessingSingleItem} confirmButtonText="Delete" confirmButtonVariant="danger" />)}
      {showBulkDeleteConfirmModal && (<ConfirmationModal isOpen={showBulkDeleteConfirmModal} title={`Delete ${selectedPatchIds.size} Patch(es)`} message={`Delete ${selectedPatchIds.size} selected items?`} onConfirm={confirmBulkDeletePatches} onCancel={() => setShowBulkDeleteConfirmModal(false)} isConfirming={isDeletingSelected} confirmButtonText="Delete Selected" confirmButtonVariant="danger" />)}
      {showBulkMoveModal && (
        <Modal isOpen={showBulkMoveModal} onClose={() => setShowBulkMoveModal(false)} title={`Move ${selectedPatchIds.size} Patch(es)`}>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Select target Software and Version:</p>
            <div className="mb-4">
              <label htmlFor="modalSoftwareMove" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Software</label>
              <select id="modalSoftwareMove" value={modalSelectedSoftwareId ?? ''} onChange={e => { setModalSelectedSoftwareId(e.target.value ? parseInt(e.target.value) : null); setModalSelectedVersionId(null); }} className="input-class w-full dark:bg-gray-700 dark:text-white dark:border-gray-600" disabled={isMovingSelected || softwareList.length === 0}>
                <option value="">Select Software...</option>
                {softwareList.map(sw => (<option key={sw.id} value={sw.id}>{sw.name}</option>))}
              </select>
            </div>
            {modalSelectedSoftwareId && (
              <div className="mb-4">
                <label htmlFor="modalVersionMove" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Version</label>
                <select id="modalVersionMove" value={modalSelectedVersionId ?? ''} onChange={e => setModalSelectedVersionId(e.target.value ? parseInt(e.target.value) : null)} className="input-class w-full dark:bg-gray-700 dark:text-white dark:border-gray-600" disabled={isMovingSelected || isLoadingModalVersions || modalVersionsList.length === 0}>
                  <option value="">{isLoadingModalVersions ? 'Loading...' : 'Select Version...'}</option>
                  {modalVersionsList.map(v => (<option key={v.id} value={v.id}>{v.version_number}</option>))}
                </select>
                {modalVersionsList.length === 0 && !isLoadingModalVersions && <p className="text-xs text-red-500 mt-1">No versions for selected software.</p>}
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={() => setShowBulkMoveModal(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500" disabled={isMovingSelected}>Cancel</button>
              <button type="button" onClick={handleConfirmBulkMovePatches} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" disabled={isMovingSelected || !modalSelectedSoftwareId || !modalSelectedVersionId}>{isMovingSelected ? 'Moving...' : 'Confirm Move'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Comment Section */}
      {isAuthenticated && selectedPatchForComments && (
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          {/* The close button that might have been here is removed as per instructions */}
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            Comments for: <span className="font-bold text-blue-600 dark:text-blue-400">{selectedPatchForComments.patch_name}</span>
          </h3>
          <CommentSection
            itemId={selectedPatchForComments.id}
            itemType="patch"
            onCommentAction={loadPatchesCallback}
          />
        </div>
      )}
      {!isAuthenticated && selectedPatchForComments && (
        // This section might also have had a close button, ensure it's removed or was never there.
        // Based on previous instructions, it likely had a close button.
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-600 dark:text-gray-400">Please log in to view and manage comments.</p>
        </div>
      )}
    </div>
  );
};

export default PatchesView;