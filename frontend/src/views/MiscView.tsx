// src/views/MiscView.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'; // Added useRef
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchMiscCategories, fetchMiscFiles, deleteAdminMiscCategory, deleteAdminMiscFile,
  PaginatedMiscFilesResponse, addFavoriteApi, removeFavoriteApi, FavoriteItemType,
  bulkDeleteItems, bulkDownloadItems, bulkMoveItems, BulkItemType
} from '../services/api';
import { MiscCategory, MiscFile } from '../types'; // MiscFile is already here
import CommentSection from '../components/comments/CommentSection'; // Added CommentSection
import DataTable, { ColumnDef } from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import AdminUploadToMiscForm from '../components/admin/AdminUploadToMiscForm'; // Using the correct form name
import AdminMiscCategoryForm from '../components/admin/AdminMiscCategoryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import Modal from '../components/shared/Modal';
import { Download, FileText as FileIconLucide, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp, Archive as ArchiveIcon, Move, AlertTriangle, MessageSquare } from 'lucide-react'; // Added MessageSquare
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; 

const API_BASE_URL = 'http://127.0.0.1:7000'; // Not actively used for constructing URLs here

interface OutletContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

const MiscView: React.FC = () => {
  const { searchTerm, setSearchTerm } = useOutletContext<OutletContextType>();
const { isAuthenticated, user } = useAuth();
const role = user?.role; // Access role safely, as user can be null
  const [categories, setCategories] = useState<MiscCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errorCategories, setErrorCategories] = useState<string | null>(null);
  
  const [miscFiles, setMiscFiles] = useState<MiscFile[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [errorFiles, setErrorFiles] = useState<string | null>(null);
  
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalMiscFiles, setTotalMiscFiles] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string>('user_provided_title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MiscCategory | null>(null);
  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false); // For AdminMiscFileForm
  const [editingMiscFile, setEditingMiscFile] = useState<MiscFile | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<MiscCategory | null>(null);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [isProcessingCategory, setIsProcessingCategory] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<MiscFile | null>(null);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [isProcessingSingleItem, setIsProcessingSingleItem] = useState(false);

  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showCategoryFilter, setShowCategoryFilter] = useState(true);

  // Bulk Action States
  const [selectedMiscFileIds, setSelectedMiscFileIds] = useState<Set<number>>(new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState<boolean>(false);
  const [isMovingSelected, setIsMovingSelected] = useState<boolean>(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState<boolean>(false);
  const [modalSelectedCategoryId, setModalSelectedCategoryId] = useState<number | null>(null);
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState<boolean>(false);

  // State for Comment Section
  const [selectedMiscFileForComments, setSelectedMiscFileForComments] = useState<MiscFile | null>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);

  const filtersAreActive = useMemo(() => {
    return activeCategoryId !== null || searchTerm !== '';
  }, [activeCategoryId, searchTerm]);

  const handleClearAllFiltersAndSearch = useCallback(() => {
    setActiveCategoryId(null);
    if (setSearchTerm) setSearchTerm('');
    setCurrentPage(1); 
  }, [setSearchTerm]);

  const loadMiscCategories = useCallback(async () => {
    setIsLoadingCategories(true); setErrorCategories(null);
    try {
      const data = await fetchMiscCategories(); setCategories(data);
    } catch (err: any) {
      setCategories([]); const msg = err.response?.data?.msg || err.message || 'Failed to load categories.';
      setErrorCategories(msg); showErrorToast(msg);
    } finally { setIsLoadingCategories(false); }
  }, []);

  useEffect(() => { if (isAuthenticated) loadMiscCategories(); else setCategories([]); }, [isAuthenticated, loadMiscCategories]);

  const fetchAndSetMiscFiles = useCallback(async (pageToLoad: number, isNewQuery: boolean = false) => {
    if (isNewQuery) setIsLoadingInitial(true);
    setErrorFiles(null);

    try {
      const response: PaginatedMiscFilesResponse = await fetchMiscFiles(
        activeCategoryId || undefined, pageToLoad, itemsPerPage, sortBy, sortOrder
      );
      setMiscFiles(response.misc_files);
      setTotalPages(response.total_pages);
      setTotalMiscFiles(response.total_misc_files);
      setCurrentPage(response.page);
      setItemsPerPage(response.per_page);

      const newFavs = new Map<number, { favoriteId: number | undefined }>();
      if (isAuthenticated && response.misc_files) response.misc_files.forEach(f => newFavs.set(f.id, { favoriteId: f.favorite_id }));
      setFavoritedItems(newFavs);
    } catch (err: any) {
      const msg = err.response?.data?.msg || err.message || 'Failed to fetch files.';
      if (isNewQuery) { setErrorFiles(msg); setMiscFiles([]); setTotalPages(0); setTotalMiscFiles(0); }
      else showErrorToast(msg);
    } finally {
      if (isNewQuery) setIsLoadingInitial(false);
    }
  }, [activeCategoryId, itemsPerPage, sortBy, sortOrder, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) fetchAndSetMiscFiles(1, true);
    else { setMiscFiles([]); setIsLoadingInitial(false); }
  }, [isAuthenticated, activeCategoryId, sortBy, sortOrder, fetchAndSetMiscFiles]);
  
  useEffect(() => { setSelectedMiscFileIds(new Set()); }, [activeCategoryId, sortBy, sortOrder, searchTerm, currentPage]);

  const handleCategoryFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveCategoryId(event.target.value ? parseInt(event.target.value) : null); setCurrentPage(1);
  };
  const handlePageChange = (newPage: number) => { setCurrentPage(newPage); fetchAndSetMiscFiles(newPage, true);};
  const handleSort = (key: string) => { setSortBy(key); setSortOrder(prev => (sortBy === key && prev === 'asc' ? 'desc' : 'asc')); setCurrentPage(1); };

  const handleMiscFileAddedOrUpdated = (file: MiscFile, isEdit: boolean) => {
    setShowAddOrEditForm(false); setEditingMiscFile(null);
    showSuccessToast(`File "${file.user_provided_title || file.original_filename}" ${isEdit ? 'updated' : 'uploaded'}.`);
    fetchAndSetMiscFiles(1, true);
    // If the file's category matches the active filter or if no filter is active, it will appear.
    // If it was moved to a new category, and that category is not active, the user might need to change filters.
    // For simplicity, we don't auto-switch the category filter here.
  };
  const handleCategoryOperationSuccess = (message: string) => { setShowCategoryForm(false); setEditingCategory(null); showSuccessToast(message); loadMiscCategories(); };
  
  const openAddOrEditFileForm = (file?: MiscFile) => { setEditingMiscFile(file || null); setShowAddOrEditForm(true); setShowCategoryForm(false); };
  const closeAdminFileForm = () => { setEditingMiscFile(null); setShowAddOrEditForm(false); };
  const openAddCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(true); setShowAddOrEditForm(false); };
  const closeCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(false); };
  const closeDeleteCategoryConfirm = () => { setCategoryToDelete(null); setShowDeleteCategoryConfirm(false);};
  const openDeleteFileConfirm = (file: MiscFile) => { setFileToDelete(file); setShowDeleteFileConfirm(true); };
  const closeDeleteFileConfirm = () => { setFileToDelete(null); setShowDeleteFileConfirm(false);};
  
  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;
    setIsProcessingCategory(true);
    try {
      await deleteAdminMiscCategory(categoryToDelete.id);
      showSuccessToast(`Category "${categoryToDelete.name}" deleted.`);
      closeDeleteCategoryConfirm(); loadMiscCategories();
      if (activeCategoryId === categoryToDelete.id) setActiveCategoryId(null); // Reset filter if active category deleted
    } catch (err: any) { showErrorToast(err.response?.data?.msg || "Delete failed."); }
    finally { setIsProcessingCategory(false); }
  };
  
  const handleDeleteFileConfirm = async () => {
    if (!fileToDelete) return;
    setIsProcessingSingleItem(true);
    if (selectedMiscFileForComments && selectedMiscFileForComments.id === fileToDelete.id) {
      setSelectedMiscFileForComments(null);
    }
    try {
      await deleteAdminMiscFile(fileToDelete.id);
      showSuccessToast(`File "${fileToDelete.user_provided_title || fileToDelete.original_filename}" deleted.`);
      closeDeleteFileConfirm(); fetchAndSetMiscFiles(1, true);
    } catch (err: any) { showErrorToast(err.message || "Delete failed."); closeDeleteFileConfirm(); }
    finally { setIsProcessingSingleItem(false); }
  };

  const filteredMiscFilesBySearch = useMemo(() => {
    if (!searchTerm) return miscFiles;
    const lower = searchTerm.toLowerCase();
    return miscFiles.filter(f => (f.user_provided_title||'').toLowerCase().includes(lower) || f.original_filename.toLowerCase().includes(lower) || (f.user_provided_description||'').toLowerCase().includes(lower) || (f.category_name||'').toLowerCase().includes(lower));
  }, [miscFiles, searchTerm]);

  const handleSelectItem = (id: number, isSelected: boolean) => setSelectedMiscFileIds(prev => { const n = new Set(prev); if (isSelected) n.add(id); else n.delete(id); return n; });
  const handleSelectAllItems = (isSelected: boolean) => { const n = new Set<number>(); if (isSelected) filteredMiscFilesBySearch.forEach(f => n.add(f.id)); setSelectedMiscFileIds(n); };

  const handleBulkDeleteMiscFilesClick = () => { if (selectedMiscFileIds.size === 0) { showErrorToast("No items selected."); return; } setShowBulkDeleteConfirmModal(true); };
  const confirmBulkDeleteMiscFiles = async () => {
    setShowBulkDeleteConfirmModal(false); setIsDeletingSelected(true);
    if (selectedMiscFileForComments && selectedMiscFileIds.has(selectedMiscFileForComments.id)) {
      setSelectedMiscFileForComments(null);
    }
    try {
      const res = await bulkDeleteItems(Array.from(selectedMiscFileIds), 'misc_file');
      showSuccessToast(res.msg || `${res.deleted_count} file(s) deleted.`);
      setSelectedMiscFileIds(new Set()); fetchAndSetMiscFiles(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk delete failed."); }
    finally { setIsDeletingSelected(false); }
  };

  const handleBulkDownloadMiscFiles = async () => {
    if (selectedMiscFileIds.size === 0) { showErrorToast("No items selected."); return; }
    setIsDownloadingSelected(true);
    try {
      const blob = await bulkDownloadItems(Array.from(selectedMiscFileIds), 'misc_file');
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      const ts = new Date().toISOString().replace(/:/g, '-'); a.download = `bulk_download_misc_files_${ts}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showSuccessToast('Download started.');
    } catch (e: any) { showErrorToast(e.message || "Bulk download failed."); }
    finally { setIsDownloadingSelected(false); }
  };
  
  const handleOpenBulkMoveMiscFilesModal = () => {
    if (selectedMiscFileIds.size === 0) { showErrorToast("No items selected."); return; }
    if (categories.length === 0) { showErrorToast("Categories unavailable for move."); return; }
    setModalSelectedCategoryId(null); setShowBulkMoveModal(true);
  };
  const handleConfirmBulkMoveMiscFiles = async () => {
    if (!modalSelectedCategoryId) { showErrorToast("Select target category."); return; }
    setShowBulkMoveModal(false); setIsMovingSelected(true);
    try {
      const res = await bulkMoveItems(Array.from(selectedMiscFileIds), 'misc_file', { target_misc_category_id: modalSelectedCategoryId });
      showSuccessToast(res.msg || `${res.moved_count} file(s) moved.`);
      setSelectedMiscFileIds(new Set()); fetchAndSetMiscFiles(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk move failed."); }
    finally { setIsMovingSelected(false); setModalSelectedCategoryId(null); }
  };

  const formatDate = (dateStr: string | null | undefined) => dateStr ? new Date(dateStr).toLocaleDateString('en-CA') : '-';
  const formatFileSize = (bytes: number|null|undefined) => {
    if (bytes == null) return 'N/A';
    if (bytes === 0) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const columns: ColumnDef<MiscFile>[] = [
    { key: 'user_provided_title', header: 'Title', sortable: true, render: f => f.user_provided_title || <span className="italic text-gray-500 dark:text-gray-400">{f.original_filename}</span> },
    { key: 'original_filename', header: 'Original Filename', sortable: true },
    { key: 'category_name', header: 'Category', sortable: true },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: f => f.uploaded_by_username||'N/A' },
    { key: 'file_size', header: 'Size', sortable: true, render: f => formatFileSize(f.file_size) },
    { key: 'created_at', header: 'Uploaded At', sortable: true, render: f => formatDate(f.created_at) },
    { 
      key: 'file_path', 
      header: 'Link', 
      render: (f: MiscFile) => {
        const isEffectivelyDownloadable = f.is_downloadable !== false; // Default to true if undefined
        if (!isEffectivelyDownloadable) {
          return (
            <span className="flex items-center text-gray-400 cursor-not-allowed" title="Download not permitted">
              <Download size={14} className="mr-1"/>Download
            </span>
          );
        }
        return (
          <a 
            href={`${API_BASE_URL}${f.file_path}`} 
            target="_blank" // Misc files are always served, so target _blank is fine
            rel="noopener noreferrer" 
            className="flex items-center text-blue-600 hover:text-blue-800"
            onClick={(e) => e.stopPropagation()}
            title="Download file"
          >
            <Download size={14}className="mr-1"/>Download
          </a>
        );
      }
    },
    { 
      key: 'actions' as any, 
      header: 'Actions', 
      render: (f: MiscFile) => (
        <div className="flex space-x-1 items-center">
          {isAuthenticated && (
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                handleFavoriteToggle(f, 'misc_file');
              }} 
              className={`p-1 rounded-md ${favoritedItems.get(f.id)?.favoriteId ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`} 
              title={favoritedItems.get(f.id)?.favoriteId ? "Remove Favorite" : "Add Favorite"}
            >
              <Star size={16} className={favoritedItems.get(f.id)?.favoriteId ? "fill-current" : ""} />
            </button>
          )}
          {isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedMiscFileForComments && selectedMiscFileForComments.id === f.id) {
                  setSelectedMiscFileForComments(null);
                } else {
                  setSelectedMiscFileForComments(f);
                  setTimeout(() => commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
                }
              }}
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-md"
              title={selectedMiscFileForComments && selectedMiscFileForComments.id === f.id ? "Hide Comments" : "View Comments"}
            >
              <MessageSquare size={16} />
              <span className="ml-1 text-xs">({f.comment_count ?? 0})</span>
            </button>
          )}
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={e => { e.stopPropagation(); openAddOrEditFileForm(f); }} className="p-1 text-blue-600 hover:text-blue-800 rounded-md" title="Edit">
                <Edit3 size={16} />
              </button>
              <button onClick={e => { e.stopPropagation(); openDeleteFileConfirm(f); }} className="p-1 text-red-600 hover:text-red-800 rounded-md" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )
    },
  ];
  const loadMiscFilesCallback = useCallback(() => { fetchAndSetMiscFiles(1, true); }, [fetchAndSetMiscFiles]);

  const handleFavoriteToggle = async (item: MiscFile, itemType: FavoriteItemType) => {
    if (!isAuthenticated) { showErrorToast("Log in to manage favorites."); return; }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavs = new Map(favoritedItems);
    if (isCurrentlyFavorited) tempFavs.set(item.id, { favoriteId: undefined }); else tempFavs.set(item.id, { favoriteId: -1 });
    setFavoritedItems(tempFavs);
    try {
      const name = item.user_provided_title || item.original_filename;
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        showSuccessToast(`"${name}" removed from favorites.`);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: undefined }); return n; });
      } else {
        const newFav = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: newFav.id }); return n; });
        showSuccessToast(`"${name}" added to favorites.`);
      }
    } catch (e: any) {
      showErrorToast(e?.response?.data?.msg || e.message || "Failed to update favorite.");
      setFavoritedItems(prev => { const n=new Map(prev); if(isCurrentlyFavorited)n.set(item.id,{favoriteId:currentStatus?.favoriteId}); else n.set(item.id,{favoriteId:undefined}); return n;});
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div><h2 className="text-2xl font-bold text-gray-800 dark:text-white">Miscellaneous Files</h2><p className="text-gray-600 mt-1 dark:text-gray-300">Manage and browse categorized files.</p></div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button 
  onClick={showCategoryForm && !editingCategory ? closeCategoryForm : openAddCategoryForm} 
  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
>
  <PlusCircle size={18} className="mr-2"/>
  {showCategoryForm && !editingCategory ? 'Cancel' : 'Add/Edit Category'}
</button>

<button 
  onClick={showAddOrEditForm && !editingMiscFile ? closeAdminFileForm : () => openAddOrEditFileForm()} 
  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
>
  <PlusCircle size={18} className="mr-2"/>
  {showAddOrEditForm && !editingMiscFile ? 'Cancel' : 'Upload New File'}
</button>
          </div>
        )}
      </div>

      {showCategoryForm && (<div className="my-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow"><AdminMiscCategoryForm categoryToEdit={editingCategory} onSuccess={(cat)=>handleCategoryOperationSuccess(`Category "${cat.name}" saved.`)} onCancel={closeCategoryForm}/></div>)}
      {showAddOrEditForm && (<div className="my-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow"><AdminUploadToMiscForm fileToEdit={editingMiscFile} onUploadSuccess={(f)=>handleMiscFileAddedOrUpdated(f,false)} onFileUpdated={(f)=>handleMiscFileAddedOrUpdated(f,true)} onCancelEdit={closeAdminFileForm}/></div>)}

      {selectedMiscFileIds.size > 0 && (
        <div className="my-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selectedMiscFileIds.size} item(s) selected</span>
            {(role==='admin'||role==='super_admin')&&(<button onClick={handleBulkDeleteMiscFilesClick} disabled={isDeletingSelected} className="btn-danger-xs flex items-center"><Trash2 size={14} className="mr-1.5"/>Delete</button>)}
            {isAuthenticated && (<button onClick={handleBulkDownloadMiscFiles} disabled={isDownloadingSelected} className="btn-success-xs flex items-center"><Download size={14} className="mr-1.5"/>Download</button>)}
            {(role==='admin'||role==='super_admin')&&(<button onClick={handleOpenBulkMoveMiscFilesModal} disabled={isMovingSelected} className="btn-warning-xs flex items-center"><Move size={14} className="mr-1.5"/>Move</button>)}
          </div>
        </div>
      )}

      <div className="my-4">
        <button onClick={()=>setShowCategoryFilter(p => !p)} className="flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md text-sm font-medium mb-2">
          {showCategoryFilter ? <ChevronUp size={18}className="mr-2"/> : <Filter size={18}className="mr-2"/>} Category Filter
        </button>
        {showCategoryFilter && (
          <>
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sr-only">Filter by Category</label>
            <select id="category-filter" value={activeCategoryId??''} onChange={handleCategoryFilterChange} className="block w-full sm:w-1/3 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm" disabled={isLoadingCategories||categories.length===0}>
              <option value="">All Categories</option>
              {categories.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </>
        )}
      </div>

      {isLoadingInitial ? (<div className="py-10"><LoadingState message="Loading files..." /></div>)
        : errorFiles && miscFiles.length === 0 && !isLoadingInitial ? (<ErrorState message={errorFiles} onRetry={loadMiscFilesCallback} />)
        : !isLoadingInitial && !errorFiles && miscFiles.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow-sm my-6">
            <ArchiveIcon size={48} className="mx-auto text-yellow-500 dark:text-yellow-400 mb-4" />
            <p className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-3">{filtersAreActive ? "No Files Found Matching Criteria" : "No Files Available"}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 px-4">{filtersAreActive ? "Try adjusting or clearing your search/filter settings." : 
             (role==='admin'||role==='super_admin') ? "Upload new files to get started." : "Please check back later."}</p>
            {filtersAreActive && (<button onClick={handleClearAllFiltersAndSearch} className="mt-6 btn-primary text-sm">Clear All Filters & Search</button>)}
          </div>
        ) : (
          <DataTable columns={columns} data={filteredMiscFilesBySearch} rowClassName="group" isLoading={isLoadingInitial || isProcessingSingleItem} currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} itemsPerPage={itemsPerPage} totalItems={totalMiscFiles} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} isSelectionEnabled={true} selectedItemIds={selectedMiscFileIds} onSelectItem={handleSelectItem} onSelectAllItems={handleSelectAllItems} />
      )}

      {showDeleteCategoryConfirm && categoryToDelete && (<ConfirmationModal isOpen={showDeleteCategoryConfirm} title="Delete Category" message={`Delete category "${categoryToDelete.name}"? Files in it won't be deleted but will become uncategorized.`} onConfirm={handleDeleteCategoryConfirm} onCancel={closeDeleteCategoryConfirm} isConfirming={isProcessingCategory} confirmButtonText="Delete" confirmButtonVariant="danger"/>)}
      {showDeleteFileConfirm && fileToDelete && (<ConfirmationModal isOpen={showDeleteFileConfirm} title="Delete File" message={`Delete "${fileToDelete.user_provided_title||fileToDelete.original_filename}"?`} onConfirm={handleDeleteFileConfirm} onCancel={closeDeleteFileConfirm} isConfirming={isProcessingSingleItem} confirmButtonText="Delete" confirmButtonVariant="danger"/>)}
      {showBulkDeleteConfirmModal && (<ConfirmationModal isOpen={showBulkDeleteConfirmModal} title={`Delete ${selectedMiscFileIds.size} File(s)`} message={`Delete ${selectedMiscFileIds.size} selected items?`} onConfirm={confirmBulkDeleteMiscFiles} onCancel={()=>setShowBulkDeleteConfirmModal(false)} isConfirming={isDeletingSelected} confirmButtonText="Delete Selected" confirmButtonVariant="danger"/>)}
      
      {showBulkMoveModal && (
        <Modal isOpen={showBulkMoveModal} onClose={()=>setShowBulkMoveModal(false)} title={`Move ${selectedMiscFileIds.size} File(s)`}>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Select target category:</p>
            <div className="mb-4">
              <label htmlFor="modalCategoryMove" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Category*</label>
              <select id="modalCategoryMove" value={modalSelectedCategoryId??''} onChange={e=>setModalSelectedCategoryId(e.target.value?parseInt(e.target.value):null)} className="input-class w-full" disabled={isMovingSelected||categories.length===0}>
                <option value="">Select Category...</option>
                {categories.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              {categories.length===0&&<p className="text-xs text-red-500 mt-1">Categories unavailable.</p>}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={()=>setShowBulkMoveModal(false)} className="btn-secondary" disabled={isMovingSelected}>Cancel</button>
              <button type="button" onClick={handleConfirmBulkMoveMiscFiles} className="btn-primary" disabled={isMovingSelected||!modalSelectedCategoryId}>{isMovingSelected?'Moving...':'Confirm Move'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Comment Section */}
      {isAuthenticated && selectedMiscFileForComments && (
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          {/* The close button that might have been here is removed as per instructions */}
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            Comments for: <span className="font-bold text-blue-600 dark:text-blue-400">{selectedMiscFileForComments.user_provided_title || selectedMiscFileForComments.original_filename}</span>
          </h3>
          <CommentSection
            itemId={selectedMiscFileForComments.id}
            itemType="misc_file" // Ensure this matches backend expectations
          />
        </div>
      )}
      {!isAuthenticated && selectedMiscFileForComments && (
        // This section might also have had a close button, ensure it's removed or was never there.
        // Based on previous instructions, it likely had a close button.
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-gray-600 dark:text-gray-400">Please log in to view and manage comments.</p>
        </div>
      )}
    </div>
  );
};

export default MiscView;