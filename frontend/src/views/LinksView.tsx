// src/views/LinksView.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import {
  fetchLinks, fetchSoftware, fetchVersionsForSoftware, deleteAdminLink,
  PaginatedLinksResponse, addFavoriteApi, removeFavoriteApi, FavoriteItemType,
  bulkDeleteItems, bulkDownloadItems, bulkMoveItems, BulkItemType
} from '../services/api';
import { Link as LinkType, Software, SoftwareVersion } from '../types'; // LinkType is already here
import CommentSection from '../components/comments/CommentSection'; // Added CommentSection
import DataTable, { ColumnDef } from '../components/DataTable';
import { formatToISTLocaleString } from '../utils'; // Updated import
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminLinkEntryForm from '../components/admin/AdminLinkEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import Modal from '../components/shared/Modal';
import { PlusCircle, Edit3, Trash2, ExternalLink, Star, Filter, ChevronUp, Link as LinkIconLucide, Download, Move, AlertTriangle, MessageSquare } from 'lucide-react'; // Added MessageSquare
import { showErrorToast, showSuccessToast } from '../utils/toastUtils';

interface OutletContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const LinksView: React.FC = () => {
  const { searchTerm, setSearchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, user } = useAuth();
  const role = user?.role; // Access role safely, as user can be null
  const [links, setLinks] = useState<LinkType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [versionList, setVersionList] = useState<SoftwareVersion[]>([]); // For main page filter

  const [activeSoftwareId, setActiveSoftwareId] = useState<number | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<number | null>(null);

  const [linkTypeFilter, setLinkTypeFilter] = useState<string>('');
  const [createdFromFilter, setCreatedFromFilter] = useState<string>('');
  const [createdToFilter, setCreatedToFilter] = useState<string>('');

  // Debounced filter states
  const [debouncedCreatedFromFilter, setDebouncedCreatedFromFilter] = useState<string>('');
  const [debouncedCreatedToFilter, setDebouncedCreatedToFilter] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15); // Default
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalLinks, setTotalLinks] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<LinkType | null>(null);
  const [isProcessingSingleItem, setIsProcessingSingleItem] = useState(false);

  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Bulk Action States
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<number>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState<boolean>(false);
  const [isMovingSelected, setIsMovingSelected] = useState<boolean>(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState<boolean>(false);
  const [modalSelectedSoftwareId, setModalSelectedSoftwareId] = useState<number | null>(null);
  const [modalVersionsList, setModalVersionsList] = useState<SoftwareVersion[]>([]);
  const [modalSelectedVersionId, setModalSelectedVersionId] = useState<number | null | undefined>(undefined);
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState<boolean>(false);
  const [isLoadingModalVersions, setIsLoadingModalVersions] = useState<boolean>(false);

  // State for Comment Section
  const [selectedLinkForComments, setSelectedLinkForComments] = useState<LinkType | null>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const location = useLocation(); // Added useLocation

  const filtersAreActive = useMemo(() => {
    return activeSoftwareId !== null || activeVersionId !== null || linkTypeFilter !== '' || createdFromFilter !== '' || createdToFilter !== '' || searchTerm !== '';
  }, [activeSoftwareId, activeVersionId, linkTypeFilter, createdFromFilter, createdToFilter, searchTerm]);

  const handleClearAllFiltersAndSearch = useCallback(() => {
    setActiveSoftwareId(null); setActiveVersionId(null);
    setLinkTypeFilter(''); setCreatedFromFilter(''); setCreatedToFilter('');
    if (setSearchTerm) setSearchTerm('');
    setCurrentPage(1); // Reset to page 1
    // fetchAndSetLinks(1, true) will be called by useEffect
  }, [setSearchTerm]);

  const fetchAndSetLinks = useCallback(async (pageToLoad: number, isNewQuery: boolean = false) => {
    if (isNewQuery) setIsLoadingInitial(true);
    setError(null);

    try {
      const response: PaginatedLinksResponse = await fetchLinks(
        activeSoftwareId || undefined, activeVersionId || undefined,
        pageToLoad, itemsPerPage, sortBy, sortOrder,
        linkTypeFilter || undefined, debouncedCreatedFromFilter || undefined, debouncedCreatedToFilter || undefined
      );
      setLinks(response.links);
      setTotalPages(response.total_pages);
      setTotalLinks(response.total_links);
      setCurrentPage(response.page);
      setItemsPerPage(response.per_page);

      const newFavs = new Map<number, { favoriteId: number | undefined }>();
      if (isAuthenticated && response.links) response.links.forEach(l => newFavs.set(l.id, { favoriteId: l.favorite_id }));
      setFavoritedItems(newFavs);
    } catch (err: any) {
      const msg = err.response?.data?.msg || err.message || 'Failed to fetch links.';
      if (isNewQuery) { setError(msg); setLinks([]); setTotalPages(0); setTotalLinks(0); }
      else showErrorToast(msg);
    } finally {
      if (isNewQuery) setIsLoadingInitial(false);
    }
  }, [activeSoftwareId, activeVersionId, itemsPerPage, sortBy, sortOrder, linkTypeFilter, debouncedCreatedFromFilter, debouncedCreatedToFilter, isAuthenticated]);

  // Debounce effects for date filters
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedCreatedFromFilter(createdFromFilter), 500);
    return () => clearTimeout(handler);
  }, [createdFromFilter]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedCreatedToFilter(createdToFilter), 500);
    return () => clearTimeout(handler);
  }, [createdToFilter]);

  useEffect(() => { if (isAuthenticated) fetchSoftware().then(setSoftwareList).catch(err => showErrorToast("Failed to load software list.")); else setSoftwareList([]); }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) fetchAndSetLinks(1, true);
    else { setLinks([]); setIsLoadingInitial(false); }
  }, [isAuthenticated, activeSoftwareId, activeVersionId, sortBy, sortOrder, linkTypeFilter, debouncedCreatedFromFilter, debouncedCreatedToFilter, searchTerm, fetchAndSetLinks]); // Added searchTerm

  useEffect(() => { setSelectedLinkIds(new Set()); }, [activeSoftwareId, activeVersionId, sortBy, sortOrder, linkTypeFilter, debouncedCreatedFromFilter, debouncedCreatedToFilter, searchTerm, currentPage]);

  useEffect(() => {
    if (activeSoftwareId) fetchVersionsForSoftware(activeSoftwareId).then(setVersionList).catch(() => { showErrorToast("Failed to load versions for filter."); setVersionList([]); });
    else setVersionList([]);
  }, [activeSoftwareId]);

  // Effect to handle focusing on a comment if item_id and comment_id are in URL
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const itemIdStr = queryParams.get('item_id');
    const commentIdStr = queryParams.get('comment_id');

    if (itemIdStr && commentIdStr && links.length > 0) {
      const targetLinkId = parseInt(itemIdStr, 10);

      if (!isNaN(targetLinkId)) {
        const targetLink = links.find(link => link.id === targetLinkId);

        if (targetLink) {
          if (!selectedLinkForComments || selectedLinkForComments.id !== targetLink.id) {
            setSelectedLinkForComments(targetLink);
          }
          setTimeout(() => {
            commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        } else {
          console.warn(`LinksView: Link with item_id ${targetLinkId} not found in the current list.`);
        }
      }
    }
  }, [location.search, links, selectedLinkForComments]);

  useEffect(() => {
    if (modalSelectedSoftwareId) {
      setIsLoadingModalVersions(true);
      fetchVersionsForSoftware(modalSelectedSoftwareId).then(setModalVersionsList).catch(() => showErrorToast("Failed to load versions for move.")).finally(() => setIsLoadingModalVersions(false));
    } else setModalVersionsList([]);
  }, [modalSelectedSoftwareId]);

  const handleSoftwareFilterChange = (id: number | null) => { setActiveSoftwareId(id); setActiveVersionId(null); setCurrentPage(1); };
  const handleVersionFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setActiveVersionId(e.target.value ? parseInt(e.target.value) : null); setCurrentPage(1); };
  const handlePageChange = (newPage: number) => { setCurrentPage(newPage); fetchAndSetLinks(newPage, true); }; // isNewQuery = true for page changes
  const handleSort = (key: string) => { setSortBy(key); setSortOrder(prev => (sortBy === key && prev === 'asc' ? 'desc' : 'asc')); setCurrentPage(1); };
  const handleApplyAdvancedFilters = () => { setCurrentPage(1); fetchAndSetLinks(1, true); };

  const handleOperationSuccess = async (message: string) => { // Made async
    setShowAddOrEditForm(false);
    setEditingLink(null);
    /* showSuccessToast(message); */
    await fetchAndSetLinks(1, true); // Await this

    // After successful link addition/update, refresh versionList if a software filter is active
    if (activeSoftwareId) {
      try {
        const versions = await fetchVersionsForSoftware(activeSoftwareId);
        setVersionList(versions);
      } catch (err) {
        console.error("Error refreshing version list after operation:", err);
        showErrorToast("Failed to refresh version list for the current software filter.");
        // versionList will retain its old state, which is acceptable.
      }
    }
  };
  const openAddForm = () => {
    setEditingLink(null);
    setShowAddOrEditForm(true);
  };
  const openEditForm = (link: LinkType) => { setEditingLink(link); setShowAddOrEditForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeAdminForm = () => {
    setEditingLink(null);
    setShowAddOrEditForm(false);
  };
  const openDeleteConfirm = (link: LinkType) => { setLinkToDelete(link); setShowDeleteConfirm(true); };
  const closeDeleteConfirm = () => { setLinkToDelete(null); setShowDeleteConfirm(false); };

  const handleDeleteLinkConfirm = async () => {
    if (!linkToDelete) return;
    setIsProcessingSingleItem(true);
    if (selectedLinkForComments && selectedLinkForComments.id === linkToDelete.id) {
      setSelectedLinkForComments(null);
    }
    try {
      await deleteAdminLink(linkToDelete.id);
      showSuccessToast(`Link "${linkToDelete.title}" deleted.`);
      closeDeleteConfirm(); fetchAndSetLinks(1, true);
    } catch (err: any) { showErrorToast(err.message || "Delete failed."); closeDeleteConfirm(); }
    finally { setIsProcessingSingleItem(false); }
  };

  const filteredLinksBySearch = useMemo(() => {
    if (!searchTerm) return links;
    const lower = searchTerm.toLowerCase();
    return links.filter(l => l.title.toLowerCase().includes(lower) || (l.description || '').toLowerCase().includes(lower) || (l.software_name || '').toLowerCase().includes(lower) || (l.version_name || '').toLowerCase().includes(lower));
  }, [links, searchTerm]);

  const handleSelectItem = (id: number, isSelected: boolean) => setSelectedLinkIds(prev => { const n = new Set(prev); if (isSelected) n.add(id); else n.delete(id); return n; });
  const handleSelectAllItems = (isSelected: boolean) => { const n = new Set<number>(); if (isSelected) filteredLinksBySearch.forEach(l => n.add(l.id)); setSelectedLinkIds(n); };

  const handleBulkDeleteLinksClick = () => { if (selectedLinkIds.size === 0) { showErrorToast("No items selected."); return; } setShowBulkDeleteConfirmModal(true); };
  const confirmBulkDeleteLinks = async () => {
    setShowBulkDeleteConfirmModal(false); setIsDeletingSelected(true);
    if (selectedLinkForComments && selectedLinkIds.has(selectedLinkForComments.id)) {
      setSelectedLinkForComments(null);
    }
    try {
      const res = await bulkDeleteItems(Array.from(selectedLinkIds), 'link');
      showSuccessToast(res.msg || `${res.deleted_count} link(s) deleted.`);
      setSelectedLinkIds(new Set()); fetchAndSetLinks(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk delete failed."); }
    finally { setIsDeletingSelected(false); }
  };

  const downloadableSelectedCount = useMemo(() => {
    return links.filter(link => selectedLinkIds.has(link.id) && !link.is_external_link && link.stored_filename).length;
  }, [links, selectedLinkIds]);

  const handleBulkDownloadLinks = async () => {
    if (selectedLinkIds.size === 0) { showErrorToast("No items selected."); return; }
    const downloadableLinks = links.filter(link => selectedLinkIds.has(link.id) && !link.is_external_link && link.stored_filename);
    if (downloadableLinks.length === 0) { showErrorToast("No downloadable files among selected links. External links or links without files cannot be bulk downloaded."); return; }

    const downloadableLinkIds = downloadableLinks.map(link => link.id);
    if (downloadableLinkIds.length < selectedLinkIds.size) {
      showSuccessToast(`Starting download for ${downloadableLinkIds.length} file-based links. External links were excluded.`);
    }

    setIsDownloadingSelected(true);
    try {
      const blob = await bulkDownloadItems(downloadableLinkIds, 'link');
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      const ts = new Date().toISOString().replace(/:/g, '-'); a.download = `bulk_download_links_${ts}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      if (downloadableLinkIds.length === selectedLinkIds.size) showSuccessToast('Download started.');
    } catch (e: any) { showErrorToast(e.message || "Bulk download failed."); }
    finally { setIsDownloadingSelected(false); }
  };

  const handleOpenBulkMoveLinksModal = () => {
    if (selectedLinkIds.size === 0) { showErrorToast("No items selected."); return; }
    if (softwareList.length === 0) { showErrorToast("Software list unavailable."); return; }
    setModalSelectedSoftwareId(null); setModalSelectedVersionId(undefined); setShowBulkMoveModal(true);
  };

  const handleConfirmBulkMoveLinks = async () => {
    if (!modalSelectedSoftwareId) { showErrorToast("Select target software."); return; }
    setShowBulkMoveModal(false); setIsMovingSelected(true);
    const targetMetadata: { target_software_id: number, target_version_id?: number | null } = { target_software_id: modalSelectedSoftwareId };
    if (modalSelectedVersionId !== undefined) {
      targetMetadata.target_version_id = modalSelectedVersionId;
    }
    try {
      const res = await bulkMoveItems(Array.from(selectedLinkIds), 'link', targetMetadata);
      showSuccessToast(res.msg || `${res.moved_count} link(s) moved.`);
      setSelectedLinkIds(new Set()); fetchAndSetLinks(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk move failed."); }
    finally { setIsMovingSelected(false); setModalSelectedSoftwareId(null); setModalSelectedVersionId(undefined); }
  };

  const columns: ColumnDef<LinkType>[] = [
    { key: 'title', header: 'Title', sortable: true }, { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_name', header: 'Version', sortable: true, render: l => l.version_name || 'N/A' },
    { key: 'description', header: 'Description', render: l => <span className="text-sm text-gray-600 block max-w-xs truncate" title={l.description || ''}>{l.description || '-'}</span> },
    {
      // THIS IS THE PART TO CHANGE
      key: 'url',
      header: 'Link', // Changed from 'URL/FILE' to 'Link' for consistency with PatchesView
      render: (l: LinkType) => {
        const isEffectivelyDownloadable = l.is_external_link || l.is_downloadable !== false;

        // The text will now always be "Link"
        const displayText = 'Link';

        // The icon will now always be Download, just like in PatchesView
        const IconComponent = Download;

        if (!isEffectivelyDownloadable && !l.is_external_link) { // Uploaded file, not downloadable
          return (
            <span className="flex items-center text-gray-400 cursor-not-allowed" title="Download not permitted">
              <IconComponent size={14} className="mr-1 flex-shrink-0" />
              {displayText}
            </span>
          );
        }
        return (
          <a
            href={l.url}
            target={l.is_external_link || !l.url?.startsWith('/') ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className={`flex items-center ${isEffectivelyDownloadable ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'}`}
            onClick={(e) => {
              if (!isEffectivelyDownloadable) e.preventDefault();
              e.stopPropagation();
            }}
            // Update the title attribute to be more specific to links context, matching PatchesView's logic
            title={isEffectivelyDownloadable ? (l.is_external_link ? "Open external link" : "Download file") : "Download not permitted"}
          >
            <IconComponent size={14} className="mr-1 flex-shrink-0" />
            {displayText}
          </a>
        );
      }
    },
    { key: 'uploaded_by_username', header: 'Added By', sortable: true, render: l => l.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: l => l.updated_by_username || 'N/A' },
    { key: 'created_at', header: 'Created', sortable: true, render: (item: LinkType) => formatToISTLocaleString(item.created_at) },
    { key: 'updated_at', header: 'Updated', sortable: true, render: (item: LinkType) => formatToISTLocaleString(item.updated_at) },
    {
      key: 'actions' as any,
      header: 'Actions',
      render: (l: LinkType) => (
        <div className="flex space-x-1 items-center">
          {isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFavoriteToggle(l, 'link');
              }}
              className={`p-1 rounded-md ${favoritedItems.get(l.id)?.favoriteId ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
              title={favoritedItems.get(l.id)?.favoriteId ? "Remove Favorite" : "Add Favorite"}
            >
              <Star size={16} className={favoritedItems.get(l.id)?.favoriteId ? "fill-current" : ""} />
            </button>
          )}
          {isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedLinkForComments && selectedLinkForComments.id === l.id) {
                  setSelectedLinkForComments(null);
                } else {
                  setSelectedLinkForComments(l);
                  setTimeout(() => commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
                }
              }}
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-md"
              title={selectedLinkForComments && selectedLinkForComments.id === l.id ? "Hide Comments" : "View Comments"}
            >
              <MessageSquare size={16} />
              <span className="ml-1 text-xs">({l.comment_count ?? 0})</span>
            </button>
          )}
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={e => { e.stopPropagation(); openEditForm(l); }} className="p-1 text-blue-600 hover:text-blue-800 rounded-md" title="Edit">
                <Edit3 size={16} />
              </button>
              <button onClick={e => { e.stopPropagation(); openDeleteConfirm(l); }} className="p-1 text-red-600 hover:text-red-800 rounded-md" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )
    },
  ];

  const loadLinksCallback = useCallback(() => { fetchAndSetLinks(1, true); }, [fetchAndSetLinks]);

  const handleFavoriteToggle = async (item: LinkType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) { showErrorToast("Please log in to manage favorites."); return; }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavs = new Map(favoritedItems);
    if (isCurrentlyFavorited) tempFavs.set(item.id, { favoriteId: undefined }); else tempFavs.set(item.id, { favoriteId: -1 });
    setFavoritedItems(tempFavs);
    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        showSuccessToast(`"${item.title}" removed from favorites.`);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: undefined }); return n; });
      } else {
        const newFav = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: newFav.id }); return n; });
        showSuccessToast(`"${item.title}" added to favorites.`);
      }
    } catch (e: any) {
      showErrorToast(e?.response?.data?.msg || e.message || "Failed to update favorite.");
      setFavoritedItems(prev => { const n = new Map(prev); if (isCurrentlyFavorited) n.set(item.id, { favoriteId: currentStatus?.favoriteId }); else n.set(item.id, { favoriteId: undefined }); return n; });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div> <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Links</h2> <p className="text-gray-600 mt-1 dark:text-gray-300">Manage and browse useful links and resources.</p> </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && !editingLink && (
          <button
            onClick={() => {
              if (showAddOrEditForm) {
                closeAdminForm();
              } else {
                openAddForm();
              }
            }}
            // Explicit classes for blue button, matching DocumentsView
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" /> {showAddOrEditForm ? 'Cancel' : 'Add New Link'}
          </button>
        )}
      </div>

      {showAddOrEditForm && (<div className="my-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow"><AdminLinkEntryForm linkToEdit={editingLink} onLinkAdded={() => handleOperationSuccess("Link added.")} onLinkUpdated={() => handleOperationSuccess("Link updated.")} onCancelEdit={closeAdminForm} /></div>)}

      {selectedLinkIds.size > 0 && (
        <div className="my-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selectedLinkIds.size} item(s) selected</span>
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleBulkDeleteLinksClick} disabled={isDeletingSelected} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 focus:ring-red-500 disabled:opacity-50"><Trash2 size={14} className="mr-1.5" />Delete</button>)}
            {isAuthenticated && (<button onClick={handleBulkDownloadLinks} disabled={isDownloadingSelected || downloadableSelectedCount === 0} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 focus:ring-green-500 disabled:opacity-50"><Download size={14} className="mr-1.5" />Download ({downloadableSelectedCount})</button>)}
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleOpenBulkMoveLinksModal} disabled={isMovingSelected} className="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm flex items-center focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-white bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 focus:ring-blue-500 disabled:opacity-50"><Move size={14} className="mr-1.5" />Move</button>)}
          </div>
        </div>
      )}

      {/* REVISED STRUCTURE FOR FILTERS START */}
      {/* This div contains the FilterTabs AND the Version dropdown side-by-side (on md screens) */}
      <div className="flex flex-col md:flex-row md:items-center md:gap-4 -mt-20">
        {softwareList.length > 0 && (
          // Added w-fit to ensure this wrapper only takes the necessary width of FilterTabs
          <div className="w-fit flex-shrink-0">
            <FilterTabs software={softwareList} selectedSoftwareId={activeSoftwareId} onSelectFilter={handleSoftwareFilterChange} />
          </div>
        )}
        {activeSoftwareId && (
          // This div's classes are already correct from previous steps
          <div className="flex items-center gap-2 min-w-[200px] mt-4 md:mt-0 flex-shrink-0">
            <label htmlFor="versionFilterLinks" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Version</label>
            <select id="versionFilterLinks" value={activeVersionId || ''} onChange={handleVersionFilterChange} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" disabled={versionList.length === 0}>
              <option value="">All Versions</option>
              {versionList.map(v => (<option key={v.id} value={v.id}>{v.version_number}</option>))}
            </select>
          </div>
        )}
      </div>

      {/* This div specifically for the Advanced Filters button, placing it directly below the above section */}
      {/* This div already has mt-0, keeping it close to the filter row */}
      <div className="mb-4 mt-0">
        <button
          onClick={() => setShowAdvancedFilters(p => !p)}
          // Explicit classes for grey button, matching DocumentsView
          className="flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md text-sm font-medium"
        >
          {showAdvancedFilters ? <ChevronUp size={18} className="mr-1.5" /> : <Filter size={18} className="mr-1.5" />} Advanced Filters
        </button>
      </div>
      {/* REVISED STRUCTURE FOR FILTERS END */}

      {showAdvancedFilters && (
        <div className="my-4 p-4 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
          <div className="flex flex-col">
            <label htmlFor="linkTypeFilterSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Link Type</label>
            <select id="linkTypeFilterSelect" value={linkTypeFilter} onChange={(e) => setLinkTypeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200">
              <option value="">All</option> <option value="external">External URL</option> <option value="uploaded">Uploaded File</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Created Between</label>
            <div className="flex items-center gap-2">
              <input type="date" value={createdFromFilter} onChange={(e) => setCreatedFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <input type="date" value={createdToFilter} onChange={(e) => setCreatedToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200" />
            </div>
          </div>
          <div className="flex items-end gap-2 pt-5"><button onClick={handleApplyAdvancedFilters} className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Apply</button><button onClick={handleClearAllFiltersAndSearch} className="text-sm px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Clear All</button></div>
        </div>
      )}

      {isLoadingInitial ? (
        <div className="py-10"><LoadingState message="Loading links..." /></div>
      ) : error && links.length === 0 && !isLoadingInitial ? (
        <ErrorState message={error} onRetry={loadLinksCallback} />
      ) : !isLoadingInitial && !error && links.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow-sm my-6">
          <LinkIconLucide size={48} className="mx-auto text-yellow-500 dark:text-yellow-400 mb-4" />
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-3">
            {filtersAreActive ? "No Links Found Matching Criteria" : "No Links Available"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 px-4">
            {filtersAreActive ? "Try adjusting or clearing your search/filter settings." :
              (role === 'admin' || role === 'super_admin') ? "Add new links to get started." : "Please check back later."}
          </p>
          {filtersAreActive && (<button onClick={handleClearAllFiltersAndSearch} className="mt-6 btn-primary text-sm">Clear All Filters & Search</button>)}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredLinksBySearch} rowClassName="group" isLoading={isLoadingInitial || isProcessingSingleItem} currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} itemsPerPage={itemsPerPage} totalItems={totalLinks} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} isSelectionEnabled={true} selectedItemIds={selectedLinkIds} onSelectItem={handleSelectItem} onSelectAllItems={handleSelectAllItems} />
      )}

      {showDeleteConfirm && linkToDelete && (<ConfirmationModal isOpen={showDeleteConfirm} title="Delete Link" message={`Delete "${linkToDelete.title}"?`} onConfirm={handleDeleteLinkConfirm} onCancel={closeDeleteConfirm} isConfirming={isProcessingSingleItem} confirmButtonText="Delete" confirmButtonVariant="danger" />)}
      {showBulkDeleteConfirmModal && (<ConfirmationModal isOpen={showBulkDeleteConfirmModal} title={`Delete ${selectedLinkIds.size} Link(s)`} message={`Delete ${selectedLinkIds.size} selected items?`} onConfirm={confirmBulkDeleteLinks} onCancel={() => setShowBulkDeleteConfirmModal(false)} isConfirming={isDeletingSelected} confirmButtonText="Delete Selected" confirmButtonVariant="danger" />)}

      {showBulkMoveModal && (
        <Modal isOpen={showBulkMoveModal} onClose={() => setShowBulkMoveModal(false)} title={`Move ${selectedLinkIds.size} Link(s)`}>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Select target Software and optionally a Version:</p>
            <div className="mb-4">
              <label htmlFor="modalSoftwareMoveLinks" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Software*</label>
              <select id="modalSoftwareMoveLinks" value={modalSelectedSoftwareId ?? ''} onChange={e => { setModalSelectedSoftwareId(e.target.value ? parseInt(e.target.value) : null); setModalSelectedVersionId(undefined); }} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" disabled={isMovingSelected || softwareList.length === 0}>
                <option value="">Select Software...</option>
                {softwareList.map(sw => (<option key={sw.id} value={sw.id}>{sw.name}</option>))}
              </select>
            </div>
            {modalSelectedSoftwareId && (
              <div className="mb-4">
                <label htmlFor="modalVersionMoveLinks" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Version (Optional)</label>
                <select id="modalVersionMoveLinks" value={modalSelectedVersionId === null ? 'NULL_VERSION' : modalSelectedVersionId ?? ''} onChange={e => setModalSelectedVersionId(e.target.value === 'NULL_VERSION' ? null : (e.target.value ? parseInt(e.target.value) : undefined))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" disabled={isMovingSelected || isLoadingModalVersions}>
                  <option value="">{isLoadingModalVersions ? 'Loading...' : 'Select Version (Optional)...'}</option>
                  <option value="NULL_VERSION">No Specific Version (Clear Association)</option>
                  {modalVersionsList.map(v => (<option key={v.id} value={v.id}>{v.version_number}</option>))}
                </select>
                {modalVersionsList.length === 0 && !isLoadingModalVersions && modalSelectedSoftwareId && <p className="text-xs text-yellow-600 mt-1">No versions for selected software. You can still move to the software without a specific version.</p>}
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={() => setShowBulkMoveModal(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500" disabled={isMovingSelected}>Cancel</button>
              <button type="button" onClick={handleConfirmBulkMoveLinks} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" disabled={isMovingSelected || !modalSelectedSoftwareId}>{isMovingSelected ? 'Moving...' : 'Confirm Move'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Comment Section */}
      {isAuthenticated && selectedLinkForComments && (
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          {/* The close button that might have been here is removed as per instructions */}
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            Comments for: <span className="font-bold text-blue-600 dark:text-blue-400">{selectedLinkForComments.title}</span>
          </h3>
          <CommentSection
            itemId={selectedLinkForComments.id}
            itemType="link"
          />
        </div>
      )}
      {!isAuthenticated && selectedLinkForComments && (
        // This section might also have had a close button, ensure it's removed or was never there.
        // Based on previous instructions, it likely had a close button.
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-600 dark:text-gray-400">Please log in to view and manage comments.</p>
        </div>
      )}
    </div>
  );
};

export default LinksView;