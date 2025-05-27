import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp, Download, Move, AlertTriangle, FileText, MessageSquare } from 'lucide-react'; 
import { 
  fetchDocuments, 
  fetchSoftware, 
  deleteAdminDocument, 
  PaginatedDocumentsResponse,
  addFavoriteApi,
  removeFavoriteApi,
  FavoriteItemType,
  bulkDeleteItems,
  bulkDownloadItems,
  bulkMoveItems,
  BulkItemType,
} from '../services/api'; 
import { Document as DocumentType, Software } from '../types'; 
import DataTable, { ColumnDef } from '../components/DataTable'; 
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState'; 
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminDocumentEntryForm from '../components/admin/AdminDocumentEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import Modal from '../components/shared/Modal';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils';
import CommentSection from '../components/comments/CommentSection';

interface OutletContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void; 
}

const DocumentsView: React.FC = () => {
  const ITEMS_PER_PAGE = 15;
  const { searchTerm, setSearchTerm } = useOutletContext<OutletContextType>(); 
const { isAuthenticated, user } = useAuth();
const role = user?.role; // Access role safely, as user can be null
  const [showAddDocumentForm, setShowAddDocumentForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); 
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);

  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);

  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalDocuments, setTotalDocuments] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false); 

  const [sortBy, setSortBy] = useState<string>('doc_name'); 
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); 

  const [docTypeFilter, setDocTypeFilter] = useState<string>('');
  const [createdFromFilter, setCreatedFromFilter] = useState<string>('');
  const [createdToFilter, setCreatedToFilter] = useState<string>('');
  const [updatedFromFilter, setUpdatedFromFilter] = useState<string>('');
  const [updatedToFilter, setUpdatedToFilter] = useState<string>('');

  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<number>>(new Set());
  const [showBulkMoveModal, setShowBulkMoveModal] = useState<boolean>(false);
  const [targetSoftwareForMove, setTargetSoftwareForMove] = useState<number | null>(null);
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState<boolean>(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);
  const [isDownloadingSelected, setIsDownloadingSelected] = useState<boolean>(false);
  const [isMovingSelected, setIsMovingSelected] = useState<boolean>(false);

  const [selectedDocumentForComments, setSelectedDocumentForComments] = useState<DocumentType | null>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);

  const filtersAreActive = useMemo(() => {
    return (
      selectedSoftwareId !== null ||
      docTypeFilter !== '' ||
      createdFromFilter !== '' ||
      createdToFilter !== '' ||
      updatedFromFilter !== '' ||
      updatedToFilter !== '' ||
      searchTerm !== ''
    );
  }, [selectedSoftwareId, docTypeFilter, createdFromFilter, createdToFilter, updatedFromFilter, updatedToFilter, searchTerm]);

  const handleClearAllFiltersAndSearch = useCallback(() => {
    setSelectedSoftwareId(null);
    setDocTypeFilter('');
    setCreatedFromFilter('');
    setCreatedToFilter('');
    setUpdatedFromFilter('');
    setUpdatedToFilter('');
    if (setSearchTerm) { 
      setSearchTerm(''); 
    }
    // fetchAndSetDocuments(1, true); // Main useEffect will handle this
  }, [setSearchTerm]);

const fetchAndSetDocuments = useCallback(async (pageToLoad: number, isNewQuery: boolean = false) => {
  if (isNewQuery) {
    setIsLoadingInitial(true);
    setError(null);
  } else {
    setIsLoadingMore(true);
  }

  try {
    const response: PaginatedDocumentsResponse = await fetchDocuments(
      selectedSoftwareId === null ? undefined : selectedSoftwareId,
      pageToLoad, ITEMS_PER_PAGE, sortBy, sortOrder,
      docTypeFilter || undefined, createdFromFilter || undefined, createdToFilter || undefined,
      updatedFromFilter || undefined, updatedToFilter || undefined
    );
    const newDocs = response.documents;
    setDocuments(prevDocuments => {
      const finalDocs = isNewQuery ? newDocs : [...prevDocuments, ...newDocs];
      // Update favoritedItems based on the finalDocs
      setFavoritedItems(prevFavs => {
        const updatedFavs = new Map(); // Start fresh or with prevFavs depending on logic for *all* docs vs new ones
        if (isAuthenticated && finalDocs) {
          for (const doc of finalDocs) {
            // Ensure all docs in view have their favorite status reflected
            updatedFavs.set(doc.id, { favoriteId: doc.favorite_id });
          }
        }
        // If you only want to update based on newDocs and merge with prevFavs for existing ones:
        // const updatedFavs = new Map(prevFavs);
        // if (isAuthenticated && newDocs) {
        //   for (const doc of newDocs) {
        //     updatedFavs.set(doc.id, { favoriteId: doc.favorite_id });
        //   }
        // }
        return updatedFavs;
      });
      return finalDocs;
    });
    setTotalDocuments(response.total_documents);
    setCurrentPage(response.page); 
    setHasMore(response.page < response.total_pages); 
    
  } catch (err: any) {
    console.error(`Failed to load documents (page ${pageToLoad}):`, err);
    const errorMessage = err.response?.data?.msg || err.message || 'Failed to fetch documents.';
    if (isNewQuery) { 
      setError(errorMessage);
      setDocuments([]); 
      setHasMore(false);
    } else {
      showErrorToast(errorMessage); 
      setHasMore(false); 
    }
  } finally {
    if (isNewQuery) setIsLoadingInitial(false);
    else setIsLoadingMore(false);
  }
}, [
  selectedSoftwareId, ITEMS_PER_PAGE, sortBy, sortOrder, docTypeFilter, 
  createdFromFilter, createdToFilter, updatedFromFilter, updatedToFilter, 
  isAuthenticated
]);
  
useEffect(() => {
  if (!isAuthenticated) {
    setDocuments([]); setFavoritedItems(new Map()); setCurrentPage(1);
    setHasMore(false); setIsLoadingInitial(false); return;
  }
  fetchAndSetDocuments(1, true); 
}, [
  isAuthenticated, selectedSoftwareId, sortBy, sortOrder, 
  docTypeFilter, createdFromFilter, createdToFilter, updatedFromFilter, updatedToFilter,
  fetchAndSetDocuments 
]);

useEffect(() => {
  setSelectedDocumentIds(new Set());
}, [selectedSoftwareId, sortBy, sortOrder, docTypeFilter, createdFromFilter, createdToFilter, updatedFromFilter, updatedToFilter, searchTerm, currentPage]);

useEffect(() => {
    const loadSoftwareForFilters = async () => {
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
      } catch (err) {
        console.error("Failed to load software for filters", err);
        showErrorToast("Failed to load software list for filtering.");
      }
    };
    if (isAuthenticated) loadSoftwareForFilters();
  }, [isAuthenticated]);

  const handleFilterChange = (softwareId: number | null) => setSelectedSoftwareId(softwareId);
  const handleSort = (columnKey: string) => {
    const newSortOrder = sortBy === columnKey && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(columnKey); setSortOrder(newSortOrder);
  };
  const handlePageChange = useCallback((newPage: number) => {
    fetchAndSetDocuments(newPage, true); setSelectedDocumentIds(new Set()); 
  }, [fetchAndSetDocuments]);

  const handleDocumentAdded = (newDocument: DocumentType) => {
    setShowAddDocumentForm(false); showSuccessToast(`Document "${newDocument.doc_name}" added.`);
    fetchAndSetDocuments(1, true);
  };
  const handleDocumentUpdated = (updatedDocument: DocumentType) => {
    setEditingDocument(null); showSuccessToast(`Document "${updatedDocument.doc_name}" updated.`);
    fetchAndSetDocuments(1, true);
  };

  const openEditForm = (doc: DocumentType) => { setShowAddDocumentForm(false); setEditingDocument(doc); };
  const closeEditForm = () => setEditingDocument(null);
  const openDeleteConfirm = (doc: DocumentType) => { setDocumentToDelete(doc); setShowDeleteConfirm(true); };
  const closeDeleteConfirm = () => { setDocumentToDelete(null); setShowDeleteConfirm(false); };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    // If the document being deleted is also selected for comments, clear it
    if (selectedDocumentForComments && documentToDelete.id === selectedDocumentForComments.id) {
      setSelectedDocumentForComments(null);
    }
    try {
      await deleteAdminDocument(documentToDelete.id);
      showSuccessToast(`Document "${documentToDelete.doc_name}" deleted.`);
      closeDeleteConfirm(); fetchAndSetDocuments(1, true); 
    } catch (err: any) { showErrorToast(err.message || "Failed to delete document."); closeDeleteConfirm(); }
    finally { setIsDeleting(false); }
  };

  const filteredDocumentsBySearch = useMemo(() => {
    if (!searchTerm) return documents; 
    const lowerSearchTerm = searchTerm.toLowerCase();
    return documents.filter(doc => 
      doc.doc_name.toLowerCase().includes(lowerSearchTerm) ||
      (doc.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (doc.software_name || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [documents, searchTerm]);

  const handleSelectItem = (itemId: number, isSelected: boolean) => {
    setSelectedDocumentIds(prev => { const n = new Set(prev); if (isSelected) n.add(itemId); else n.delete(itemId); return n; });
  };
  const handleSelectAllItems = (isSelected: boolean) => {
    const n = new Set<number>(); if (isSelected) filteredDocumentsBySearch.forEach(d => n.add(d.id)); setSelectedDocumentIds(n);
  };

  const handleBulkDeleteClick = () => { if (selectedDocumentIds.size === 0) { showErrorToast("No items selected."); return; } setShowBulkDeleteConfirmModal(true); };
  const confirmBulkDelete = async () => {
    setShowBulkDeleteConfirmModal(false); setIsDeletingSelected(true); 
    try {
      const res = await bulkDeleteItems(Array.from(selectedDocumentIds), 'document' as BulkItemType);
      showSuccessToast(res.msg || `${res.deleted_count} item(s) deleted.`);
      setSelectedDocumentIds(new Set()); 
      // If any of the bulk-deleted documents was the one selected for comments, clear it
      if (selectedDocumentForComments && selectedDocumentIds.has(selectedDocumentForComments.id)) {
        setSelectedDocumentForComments(null);
      }
      fetchAndSetDocuments(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk delete failed."); }
    finally { setIsDeletingSelected(false); }
  };

  const handleBulkDownload = async () => {
    if (selectedDocumentIds.size === 0) { showErrorToast("No items selected."); return; }
    setIsDownloadingSelected(true); 
    try {
      const blob = await bulkDownloadItems(Array.from(selectedDocumentIds), 'document' as BulkItemType);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      const ts = new Date().toISOString().replace(/:/g, '-'); a.download = `bulk_download_document_${ts}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showSuccessToast('Download started.');
    } catch (e: any) { showErrorToast(e.message || "Bulk download failed."); }
    finally { setIsDownloadingSelected(false); }
  };
  
  const handleOpenBulkMoveModal = () => {
    if (selectedDocumentIds.size === 0) { showErrorToast("No items selected."); return; }
    if (softwareList.length === 0) { showErrorToast("Software list unavailable."); return; }
    setTargetSoftwareForMove(null); setShowBulkMoveModal(true);
  };
  const handleConfirmBulkMoveDocuments = async () => {
    if (!targetSoftwareForMove) { showErrorToast("Select target software."); return; }
    setShowBulkMoveModal(false); setIsMovingSelected(true); 
    try {
      const res = await bulkMoveItems(Array.from(selectedDocumentIds), 'document' as BulkItemType, { target_software_id: targetSoftwareForMove });
      showSuccessToast(res.msg || `${res.moved_count} item(s) moved.`);
      setSelectedDocumentIds(new Set()); fetchAndSetDocuments(1, true);
    } catch (e: any) { showErrorToast(e.message || "Bulk move failed."); }
    finally { setIsMovingSelected(false); setTargetSoftwareForMove(null); }
  };

  const columns: ColumnDef<DocumentType>[] = [
    { key: 'doc_name', header: 'Name', sortable: true }, { key: 'doc_type', header: 'Type', sortable: true },
    { key: 'software_name', header: 'Software', sortable: true },
    { key: 'description', header: 'Description', render: (d: DocumentType) => <span className="text-sm text-gray-600 block max-w-xs truncate" title={d.description||''}>{d.description||'-'}</span> },
    { 
      key: 'download_link', 
      header: 'Download', 
      render: (d: DocumentType) => {
        // Check if the document is an external link or an uploaded file that is downloadable
        const canDirectlyDownload = d.is_external_link || d.is_downloadable;
        // For uploaded files, if is_downloadable is explicitly false, it's not downloadable.
        // If is_downloadable is undefined (for older data or if backend missed it), default to allowing download for non-external links.
        const isEffectivelyDownloadable = d.is_external_link || d.is_downloadable !== false;

        if (!isEffectivelyDownloadable && !d.is_external_link) { // It's an uploaded file and not downloadable
          return (
            <span className="flex items-center text-gray-400 cursor-not-allowed" title="Download not permitted">
              <Download size={14} className="mr-1"/>Link
            </span>
          );
        }
        // For external links or downloadable files
        return (
          <a 
            href={d.download_link} 
            target={d.is_external_link || !d.download_link?.startsWith('/') ? "_blank" : "_self"} 
            rel="noopener noreferrer" 
            className={`flex items-center ${canDirectlyDownload ? 'text-blue-600 hover:text-blue-800' : 'text-gray-400 cursor-not-allowed'}`} 
            onClick={(e) => {
              if (!canDirectlyDownload) e.preventDefault(); // Prevent action if not downloadable
              e.stopPropagation();
            }}
            title={canDirectlyDownload ? (d.is_external_link ? "Open external link" : "Download file") : "Download not permitted"}
          >
            <Download size={14} className="mr-1"/>Link
          </a>
        );
      } 
    },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (d: DocumentType) => d.uploaded_by_username||'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (d: DocumentType) => d.updated_by_username||'N/A' },
    { key: 'created_at', header: 'Created At', sortable: true, render: (d: DocumentType) => d.created_at?new Date(d.created_at).toLocaleDateString('en-CA'):'-' },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (d: DocumentType) => d.updated_at?new Date(d.updated_at).toLocaleDateString('en-CA'):'-' },
    { key: 'actions' as any, header: 'Actions', render: (d: DocumentType) => (
      <div className="flex space-x-1 items-center">
        {isAuthenticated && (
          <button onClick={e => { e.stopPropagation(); handleFavoriteToggle(d, 'document')}} className={`p-1 rounded-md ${favoritedItems.get(d.id)?.favoriteId ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`} title={favoritedItems.get(d.id)?.favoriteId ? "Remove Favorite" : "Add Favorite"}><Star size={16} className={favoritedItems.get(d.id)?.favoriteId ? "fill-current" : ""} /></button>
        )}
        {(role === 'admin' || role === 'super_admin') && (
          <>
            <button onClick={e => { e.stopPropagation(); openEditForm(d)}} className="p-1 text-blue-600 hover:text-blue-800 rounded-md" title="Edit"><Edit3 size={16} /></button>
            <button onClick={e => { e.stopPropagation(); openDeleteConfirm(d)}} className="p-1 text-red-600 hover:text-red-800 rounded-md" title="Delete"><Trash2 size={16} /></button>
          </>
        )}
         {isAuthenticated && ( // Comments button visible to all authenticated users
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (selectedDocumentForComments && selectedDocumentForComments.id === d.id) {
                  setSelectedDocumentForComments(null);
                } else {
                  setSelectedDocumentForComments(d);
                  setTimeout(() => commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
                }
              }}
              className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-md"
              title={selectedDocumentForComments && selectedDocumentForComments.id === d.id ? "Hide Comments" : "View Comments"}
            >
              <MessageSquare size={16} />
              <span className="ml-1 text-xs">({d.comment_count ?? 0})</span>
            </button>
          )}
      </div>
    )},
  ];
  
  const totalPagesComputed = Math.ceil(totalDocuments / ITEMS_PER_PAGE);
  const loadDocumentsCallback = useCallback(() => { fetchAndSetDocuments(1, true); }, [fetchAndSetDocuments]);

  const renderAdminFormArea = () => {
    if (editingDocument) return <div className="my-6 p-4 bg-gray-50 rounded-lg shadow dark:bg-gray-700"><AdminDocumentEntryForm documentToEdit={editingDocument} onDocumentUpdated={handleDocumentUpdated} onCancelEdit={closeEditForm} /></div>;
    if (showAddDocumentForm) return <div className="my-6 p-4 bg-gray-50 rounded-lg shadow dark:bg-gray-700"><AdminDocumentEntryForm onDocumentAdded={handleDocumentAdded} onCancelEdit={() => setShowAddDocumentForm(false)} /></div>;
    return null;
  };

  const handleFavoriteToggle = async (item: DocumentType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) { showErrorToast("Please log in to manage favorites."); return; }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavs = new Map(favoritedItems);
    if (isCurrentlyFavorited) tempFavs.set(item.id, { favoriteId: undefined }); else tempFavs.set(item.id, { favoriteId: -1 });
    setFavoritedItems(tempFavs);
    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        showSuccessToast(`"${item.doc_name}" removed from favorites.`);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: undefined }); return n; });
      } else {
        const newFav = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => { const n = new Map(prev); n.set(item.id, { favoriteId: newFav.id }); return n; });
        showSuccessToast(`"${item.doc_name}" added to favorites.`);
      }
    } catch (e: any) {
      showErrorToast(e?.response?.data?.msg || e.message || "Failed to update favorite.");
      setFavoritedItems(prev => { const n=new Map(prev); if(isCurrentlyFavorited)n.set(item.id,{favoriteId:currentStatus?.favoriteId}); else n.set(item.id,{favoriteId:undefined}); return n;});
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Documents</h2>
          <p className="text-gray-600 mt-1 dark:text-gray-300">Browse and manage official documents and resources.</p>
        </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && !editingDocument && (
          <button onClick={() => { setShowAddDocumentForm(p => !p); setEditingDocument(null);}}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <PlusCircle size={18} className="mr-2" />{showAddDocumentForm ? 'Cancel' : 'Add New Document'}
          </button>
        )}
      </div>
      {renderAdminFormArea()}
      {selectedDocumentIds.size > 0 && (
        <div className="my-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{selectedDocumentIds.size} item(s) selected</span>
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleBulkDeleteClick} disabled={isDeletingSelected} className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm disabled:opacity-50 flex items-center"><Trash2 size={14} className="mr-1.5"/>Delete</button>)}
            {isAuthenticated && (<button onClick={handleBulkDownload} disabled={isDownloadingSelected} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm disabled:opacity-50 flex items-center"><Download size={14} className="mr-1.5"/>Download</button>)}
            {(role === 'admin' || role === 'super_admin') && (<button onClick={handleOpenBulkMoveModal} disabled={isMovingSelected} className="px-3 py-1.5 text-xs font-medium text-black bg-yellow-400 hover:bg-yellow-500 rounded-md shadow-sm disabled:opacity-50 flex items-center"><Move size={14} className="mr-1.5"/>Move</button>)}
          </div>
        </div>
      )}
      {softwareList.length > 0 && <FilterTabs software={softwareList} selectedSoftwareId={selectedSoftwareId} onSelectFilter={handleFilterChange} />}
      <div className="mb-4"><button onClick={() => setShowAdvancedFilters(p => !p)} className="flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md text-sm font-medium">{showAdvancedFilters?(<><ChevronUp size={18}className="mr-2"/>Hide</>):(<><Filter size={18}className="mr-2"/>Show</>)} Advanced Filters</button></div>
      {showAdvancedFilters && (
        <div className="my-4 p-4 border dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
          <div><label htmlFor="docTypeFilterInput" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Doc Type</label><input id="docTypeFilterInput" type="text" value={docTypeFilter} onChange={e=>setDocTypeFilter(e.target.value)} placeholder="e.g., Manual" className="input-class"/></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Created</label><div className="flex items-center gap-2"><input type="date" value={createdFromFilter} onChange={e=>setCreatedFromFilter(e.target.value)} className="input-class"/><span className="text-gray-500 dark:text-gray-400">to</span><input type="date" value={createdToFilter} onChange={e=>setCreatedToFilter(e.target.value)} className="input-class"/></div></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Updated</label><div className="flex items-center gap-2"><input type="date" value={updatedFromFilter} onChange={e=>setUpdatedFromFilter(e.target.value)} className="input-class"/><span className="text-gray-500 dark:text-gray-400">to</span><input type="date" value={updatedToFilter} onChange={e=>setUpdatedToFilter(e.target.value)} className="input-class"/></div></div>
          <div className="flex items-end gap-2 pt-5"><button onClick={()=>fetchAndSetDocuments(1,true)} className="btn-primary text-sm">Apply</button><button onClick={handleClearAllFiltersAndSearch} className="btn-secondary text-sm">Clear</button></div>
        </div>
      )}
      {isLoadingInitial ? (
        <div className="py-10"><LoadingState message="Loading documents..." /></div>
      ) : error && documents.length === 0 && !isLoadingInitial ? (
        <ErrorState message={error} onRetry={loadDocumentsCallback} />
      ) : !isLoadingInitial && !error && documents.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg shadow-sm my-6">
          <FileText size={48} className="mx-auto text-yellow-500 dark:text-yellow-400 mb-4" />
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-3">
            {filtersAreActive ? "No Documents Found Matching Criteria" : "No Documents Available"}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 px-4">
            {filtersAreActive ? "Try adjusting or clearing your search/filter settings." : 
             (role==='admin'||role==='super_admin') ? "Add new documents to get started." : "Please check back later."}
          </p>
          {filtersAreActive && (<button onClick={handleClearAllFiltersAndSearch} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium">Clear All Filters & Search</button>)}
        </div>
      ) : (
        <DataTable columns={columns} data={filteredDocumentsBySearch} rowClassName="group" isLoading={isLoadingInitial||isLoadingMore} currentPage={currentPage} totalPages={totalPagesComputed} onPageChange={handlePageChange} itemsPerPage={ITEMS_PER_PAGE} totalItems={totalDocuments} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} isSelectionEnabled={true} selectedItemIds={selectedDocumentIds} onSelectItem={handleSelectItem} onSelectAllItems={handleSelectAllItems} />
      )}
      {showDeleteConfirm && documentToDelete && (<ConfirmationModal isOpen={showDeleteConfirm} title="Delete Document" message={`Delete "${documentToDelete.doc_name}"?`} onConfirm={handleDeleteConfirm} onCancel={closeDeleteConfirm} isConfirming={isDeleting} confirmButtonText="Delete" confirmButtonVariant="danger"/>)}
      {showBulkDeleteConfirmModal && (<ConfirmationModal isOpen={showBulkDeleteConfirmModal} title={`Delete ${selectedDocumentIds.size} Document(s)`} message={`Delete ${selectedDocumentIds.size} selected items?`} onConfirm={confirmBulkDelete} onCancel={()=>setShowBulkDeleteConfirmModal(false)} isConfirming={isDeletingSelected} confirmButtonText="Delete Selected" confirmButtonVariant="danger"/>)}
      {showBulkMoveModal && (
        <Modal isOpen={showBulkMoveModal} onClose={()=>setShowBulkMoveModal(false)} title={`Move ${selectedDocumentIds.size} Document(s)`}>
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Select target software:</p>
            <div className="mb-4">
              <label htmlFor="targetSoftware" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Software</label>
              <select id="targetSoftware" value={targetSoftwareForMove??''} onChange={e=>setTargetSoftwareForMove(e.target.value?parseInt(e.target.value):null)} className="input-class w-full" disabled={softwareList.length===0||isMovingSelected}>
                <option value="">Select Software...</option>
                {softwareList.map(sw=>(<option key={sw.id} value={sw.id}>{sw.name}</option>))}
              </select>
              {softwareList.length===0&&<p className="text-xs text-red-500 mt-1">Software list unavailable.</p>}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button type="button" onClick={()=>setShowBulkMoveModal(false)} className="btn-secondary" disabled={isMovingSelected}>Cancel</button>
              <button type="button" onClick={handleConfirmBulkMoveDocuments} className="btn-primary" disabled={isMovingSelected||!targetSoftwareForMove}>{isMovingSelected?'Moving...':'Confirm Move'}</button>
            </div>
          </div>
        </Modal>
      )}

      {isAuthenticated && selectedDocumentForComments && (
        <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          {/* The close button that might have been here is removed as per instructions */}
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            Comments for: <span className="font-bold text-blue-600 dark:text-blue-400">{selectedDocumentForComments.doc_name}</span>
          </h3>
          <CommentSection
            itemId={selectedDocumentForComments.id}
            itemType="document"
          />
        </div>
      )}
       {!isAuthenticated && selectedDocumentForComments && (
          // This section might also have had a close button, ensure it's removed or was never there.
          // Based on previous instructions, it likely had a close button.
          <div ref={commentSectionRef} className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-gray-600 dark:text-gray-400">Please log in to view and manage comments.</p>
          </div>
        )}
    </div>
  );
};

export default DocumentsView;