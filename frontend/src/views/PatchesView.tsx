// src/views/PatchesView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp, Download, Move, AlertTriangle, Package as PackageIcon } from 'lucide-react';
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
import DataTable, { ColumnDef } from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminPatchEntryForm from '../components/admin/AdminPatchEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import Modal from '../components/shared/Modal';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; 

interface OutletContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const PatchesView: React.FC = () => {
  const { searchTerm, setSearchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [patches, setPatches] = useState<PatchType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);

  const [releaseFromFilter, setReleaseFromFilter] = useState<string>('');
  const [releaseToFilter, setReleaseToFilter] = useState<string>('');
  const [patchedByDeveloperFilter, setPatchedByDeveloperFilter] = useState<string>('');
  
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
        releaseFromFilter || undefined, releaseToFilter || undefined, patchedByDeveloperFilter || undefined
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
  }, [selectedSoftwareId, itemsPerPage, sortBy, sortOrder, releaseFromFilter, releaseToFilter, patchedByDeveloperFilter, isAuthenticated]);
  
  useEffect(() => {
    if (isAuthenticated) fetchAndSetPatches(1, true);
    else { setPatches([]); setIsLoadingInitial(false); }
  }, [isAuthenticated, selectedSoftwareId, sortBy, sortOrder, releaseFromFilter, releaseToFilter, patchedByDeveloperFilter, fetchAndSetPatches]);

  useEffect(() => { setSelectedPatchIds(new Set()); }, 
    [selectedSoftwareId, sortBy, sortOrder, releaseFromFilter, releaseToFilter, patchedByDeveloperFilter, searchTerm, currentPage]
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
    setShowAddOrEditForm(false); setEditingPatch(null); showSuccessToast(message); fetchAndSetPatches(1, true);
  };
  
  const openAddForm = () => { setEditingPatch(null); setShowAddOrEditForm(true); };
  const openEditForm = (patch: PatchType) => { setEditingPatch(patch); setShowAddOrEditForm(true); };
  const closeAdminForm = () => { setEditingPatch(null); setShowAddOrEditForm(false); };
  const openDeleteConfirm = (patch: PatchType) => { setPatchToDelete(patch); setShowDeleteConfirm(true); };
  const closeDeleteConfirm = () => { setPatchToDelete(null); setShowDeleteConfirm(false); };

  const handleDeleteConfirm = async () => {
    if (!patchToDelete) return;
    setIsProcessingSingleItem(true);
    try {
      await deleteAdminPatch(patchToDelete.id);
      showSuccessToast(`Patch "${patchToDelete.patch_name}" deleted.`);
      closeDeleteConfirm(); fetchAndSetPatches(1, true);
    } catch (err: any) { showErrorToast(err.message || "Delete failed."); closeDeleteConfirm(); }
    finally { setIsProcessingSingleItem(false); }
  };

  const filteredPatchesBySearch = useMemo(() => {
    if (!searchTerm) return patches;
    const lower = searchTerm.toLowerCase();
    return patches.filter(p => 
      p.patch_name.toLowerCase().includes(lower) ||
      (p.description || '').toLowerCase().includes(lower) ||
      (p.software_name || '').toLowerCase().includes(lower) ||
      (p.version_number || '').toLowerCase().includes(lower)
    );
  }, [patches, searchTerm]);

  const handleSelectItem = (id: number, isSelected: boolean) => setSelectedPatchIds(prev => { const n = new Set(prev); if (isSelected) n.add(id); else n.delete(id); return n; });
  const handleSelectAllItems = (isSelected: boolean) => { const n = new Set<number>(); if (isSelected) filteredPatchesBySearch.forEach(p => n.add(p.id)); setSelectedPatchIds(n); };

  const handleBulkDeleteClick = () => { if (selectedPatchIds.size === 0) { showErrorToast("No items selected."); return; } setShowBulkDeleteConfirmModal(true); };
  const confirmBulkDeletePatches = async () => {
    setShowBulkDeleteConfirmModal(false); setIsDeletingSelected(true);
    try {
      const res = await bulkDeleteItems(Array.from(selectedPatchIds), 'patch');
      showSuccessToast(res.msg || `${res.deleted_count} patch(es) deleted.`);
      setSelectedPatchIds(new Set()); fetchAndSetPatches(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk delete failed."); }
    finally { setIsDeletingSelected(false); }
  };

  const handleBulkDownloadPatches = async () => {
    if (selectedPatchIds.size === 0) { showErrorToast("No items selected."); return; }
    setIsDownloadingSelected(true);
    try {
      const blob = await bulkDownloadItems(Array.from(selectedPatchIds), 'patch');
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      const ts = new Date().toISOString().replace(/:/g, '-'); a.download = `bulk_download_patches_${ts}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showSuccessToast('Download started.');
    } catch (e: any) { showErrorToast(e.message || "Bulk download failed."); }
    finally { setIsDownloadingSelected(false); }
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
    } catch (e: any) { showErrorToast(e.message || "Bulk move failed."); }
    finally { setIsMovingSelected(false); setModalSelectedSoftwareId(null); setModalSelectedVersionId(null); }
  };

  const formatDate = (dateStr: string | null | undefined) => dateStr ? new Date(dateStr).toLocaleDateString('en-CA') : '-';
  const columns: ColumnDef<PatchType>[] = [
    { key: 'patch_name', header: 'Patch Name', sortable: true }, { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_number', header: 'Version', sortable: true },
    { key: 'patch_by_developer', header: 'Developer', sortable: true, render: p => p.patch_by_developer || '-' },
    { key: 'description', header: 'Description', render: p => <span className="text-sm text-gray-600 block max-w-xs truncate" title={p.description||''}>{p.description||'-'}</span> },
    { key: 'release_date', header: 'Release Date', sortable: true, render: p => formatDate(p.release_date) },
    { key: 'download_link', header: 'Link', render: p => <a href={p.download_link} target={p.is_external_link||!p.download_link?.startsWith('/')?"_blank":"_self"} rel="noopener noreferrer" className="flex items-center text-blue-600 hover:text-blue-800" onClick={e=>e.stopPropagation()}><Download size={14}className="mr-1"/>Link</a> },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: p => p.uploaded_by_username||'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: p => p.updated_by_username||'N/A' },
    { key: 'created_at', header: 'Created At', sortable: true, render: p => formatDate(p.created_at) },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: p => formatDate(p.updated_at) },
    { key: 'actions' as any, header: 'Actions', render: (p: PatchType) => (<div className="flex space-x-1 items-center">{isAuthenticated&&(<button onClick={e=>{e.stopPropagation();handleFavoriteToggle(p,'patch')}} className={`p-1 rounded-md ${favoritedItems.get(p.id)?.favoriteId?'text-yellow-500 hover:text-yellow-600':'text-gray-400 hover:text-yellow-500'}`} title={favoritedItems.get(p.id)?.favoriteId?"Remove Favorite":"Add Favorite"}><Star size={16} className={favoritedItems.get(p.id)?.favoriteId?"fill-current":""}/></button>)}{(role==='admin'||role==='super_admin')&&(<> <button onClick={e=>{e.stopPropagation();openEditForm(p)}} className="p-1 text-blue-600 hover:text-blue-800 rounded-md" title="Edit"><Edit3 size={16}/></button> <button onClick={e=>{e.stopPropagation();openDeleteConfirm(p)}} className="p-1 text-red-600 hover:text-red-800 rounded-md" title="Delete"><Trash2 size={16}/></button></>)}</div>)},
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
      setFavoritedItems(prev => { const n=new Map(prev); if(isCurrentlyFavorited)n.set(item.id,{favoriteId:currentStatus?.favoriteId}); else n.set(item.id,{favoriteId:undefined}); return n;});
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

      {showAddOrEditForm && ( <div className="my-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow"> <AdminPatchEntryForm patchToEdit={editingPatch} onPatchAdded={() => handleOperationSuccess('Patch added.')} onPatchUpdated={() => handleOperationSuccess('Patch updated.')} onCancelEdit={closeAdminForm} /> </div> )}

      {selectedPatchIds.size > 0 && (
        <div className="my-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selectedPatchIds.size} item(s) selected</span>
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleBulkDeleteClick} disabled={isDeletingSelected} className="btn-danger-xs flex items-center"><Trash2 size={14} className="mr-1.5"/>Delete</button>)}
            {isAuthenticated && (<button onClick={handleBulkDownloadPatches} disabled={isDownloadingSelected} className="btn-success-xs flex items-center"><Download size={14} className="mr-1.5"/>Download</button>)}
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleOpenBulkMovePatchesModal} disabled={isMovingSelected} className="btn-warning-xs flex items-center"><Move size={14} className="mr-1.5"/>Move</button>)}
          </div>
        </div>
      )}

      {softwareList.length > 0 && <FilterTabs software={softwareList} selectedSoftwareId={selectedSoftwareId} onSelectFilter={handleFilterChange} />}
      
      <div className="my-4"><button onClick={() => setShowAdvancedFilters(p => !p)} className="flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md text-sm font-medium">{showAdvancedFilters?(<><ChevronUp size={18}className="mr-2"/>Hide</>):(<><Filter size={18}className="mr-2"/>Show</>)} Advanced Filters</button></div>
      {showAdvancedFilters && (
        <div className="my-4 p-4 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
          <div><label htmlFor="patchedByDevFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Developer</label><input id="patchedByDevFilter" type="text" value={patchedByDeveloperFilter} onChange={e=>setPatchedByDeveloperFilter(e.target.value)} placeholder="e.g., Main Dev" className="input-class"/></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Released</label><div className="flex items-center gap-2"><input type="date" value={releaseFromFilter} onChange={e=>setReleaseFromFilter(e.target.value)} className="input-class"/><span className="text-gray-500 dark:text-gray-400">to</span><input type="date" value={releaseToFilter} onChange={e=>setReleaseToFilter(e.target.value)} className="input-class"/></div></div>
          <div className="flex items-end gap-2 pt-5"><button onClick={handleApplyAdvancedFilters} className="btn-primary text-sm">Apply</button><button onClick={handleClearAdvancedFilters} className="btn-secondary text-sm">Clear</button></div>
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
             (role==='admin'||role==='super_admin') ? "Add new patches to get started." : "Please check back later."}
          </p>
          {filtersAreActive && (<button onClick={handleClearAllFiltersAndSearch} className="mt-6 btn-primary text-sm">Clear All Filters & Search</button>)}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredPatchesBySearch} rowClassName="group" isLoading={isLoadingInitial || isProcessingSingleItem} currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} itemsPerPage={itemsPerPage} totalItems={totalPatches} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} isSelectionEnabled={true} selectedItemIds={selectedPatchIds} onSelectItem={handleSelectItem} onSelectAllItems={handleSelectAllItems} />
      )}

      {showDeleteConfirm && patchToDelete && (<ConfirmationModal isOpen={showDeleteConfirm} title="Delete Patch" message={`Delete "${patchToDelete.patch_name}"?`} onConfirm={handleDeleteConfirm} onCancel={closeDeleteConfirm} isConfirming={isProcessingSingleItem} confirmButtonText="Delete" confirmButtonVariant="danger"/>)}
      {showBulkDeleteConfirmModal && (<ConfirmationModal isOpen={showBulkDeleteConfirmModal} title={`Delete ${selectedPatchIds.size} Patch(es)`} message={`Delete ${selectedPatchIds.size} selected items?`} onConfirm={confirmBulkDeletePatches} onCancel={()=>setShowBulkDeleteConfirmModal(false)} isConfirming={isDeletingSelected} confirmButtonText="Delete Selected" confirmButtonVariant="danger" Icon={AlertTriangle}/>)}
      {showBulkMoveModal && (
        <Modal isOpen={showBulkMoveModal} onClose={()=>setShowBulkMoveModal(false)} title={`Move ${selectedPatchIds.size} Patch(es)`}>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Select target Software and Version:</p>
            <div className="mb-4">
              <label htmlFor="modalSoftwareMove" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Software</label>
              <select id="modalSoftwareMove" value={modalSelectedSoftwareId??''} onChange={e=>{setModalSelectedSoftwareId(e.target.value?parseInt(e.target.value):null); setModalSelectedVersionId(null);}} className="input-class w-full" disabled={isMovingSelected||softwareList.length===0}>
                <option value="">Select Software...</option>
                {softwareList.map(sw=>(<option key={sw.id} value={sw.id}>{sw.name}</option>))}
              </select>
            </div>
            {modalSelectedSoftwareId && (
              <div className="mb-4">
                <label htmlFor="modalVersionMove" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Version</label>
                <select id="modalVersionMove" value={modalSelectedVersionId??''} onChange={e=>setModalSelectedVersionId(e.target.value?parseInt(e.target.value):null)} className="input-class w-full" disabled={isMovingSelected||isLoadingModalVersions||modalVersionsList.length===0}>
                  <option value="">{isLoadingModalVersions?'Loading...':'Select Version...'}</option>
                  {modalVersionsList.map(v=>(<option key={v.id} value={v.id}>{v.version_number}</option>))}
                </select>
                {modalVersionsList.length===0&&!isLoadingModalVersions&&<p className="text-xs text-red-500 mt-1">No versions for selected software.</p>}
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={()=>setShowBulkMoveModal(false)} className="btn-secondary" disabled={isMovingSelected}>Cancel</button>
              <button type="button" onClick={handleConfirmBulkMovePatches} className="btn-primary" disabled={isMovingSelected||!modalSelectedSoftwareId||!modalSelectedVersionId}>{isMovingSelected?'Moving...':'Confirm Move'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PatchesView;