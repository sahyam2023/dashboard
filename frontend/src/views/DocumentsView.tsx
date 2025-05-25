import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp } from 'lucide-react';
import { 
  fetchDocuments, 
  fetchSoftware, 
  deleteAdminDocument, 
  PaginatedDocumentsResponse,
  addFavoriteApi,
  removeFavoriteApi,
  getFavoriteStatusApi,
  FavoriteItemType 
} from '../services/api'; 
import { Document as DocumentType, Software } from '../types'; 
import DataTable, { ColumnDef } from '../components/DataTable'; 
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState'; // Can be replaced by DataTable's isLoading
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminDocumentEntryForm from '../components/admin/AdminDocumentEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { showErrorToast } from '../utils/toastUtils';

interface OutletContextType {
  searchTerm: string;
}

const DocumentsView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  // Note: The old `isLoading` and `isInitialLoad` are replaced by `isLoadingInitial` and `isLoadingMore`.
  // `totalPages` and `itemsPerPage` (as state for DataTable) are no longer primary drivers for pagination.

  // UI State for Forms and Modals
  const [showAddDocumentForm, setShowAddDocumentForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Favorite State
  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // State for filter toggle

// Core data fetching function
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
      pageToLoad,
      ITEMS_PER_PAGE,
      sortBy,
      sortOrder,
      docTypeFilter || undefined,
      createdFromFilter || undefined,
      createdToFilter || undefined,
      updatedFromFilter || undefined,
      updatedToFilter || undefined
    );

    const newDocs = response.documents;
    // Use functional update for documents to correctly handle appending for favorites update
    setDocuments(prevDocs => isNewQuery ? newDocs : [...prevDocs, ...newDocs]);
    setTotalDocuments(response.total_documents);
    setCurrentPage(response.page + 1); 
    setHasMore(response.page < response.total_pages);
    
    // Update favoritedItems based on the potentially updated documents list
    // This needs to happen after setDocuments has effectively completed or use the new list directly
    // For simplicity with async state updates, consider passing the new full list to update favorites
    setFavoritedItems(prevFavs => {
        const updatedFavs = new Map(prevFavs);
        // Construct the current full list based on whether it's a new query or appending
        const currentFullDocs = isNewQuery ? newDocs : [...documents, ...newDocs]; // 'documents' here refers to state before this update when appending
        if (isAuthenticated && currentFullDocs) {
            for (const doc of currentFullDocs) { 
                if (doc.favorite_id) updatedFavs.set(doc.id, { favoriteId: doc.favorite_id });
                else updatedFavs.set(doc.id, { favoriteId: undefined }); 
            }
        }
        return updatedFavs;
    });


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
    if (isNewQuery) {
      setIsLoadingInitial(false);
    } else {
      setIsLoadingMore(false);
    }
  }
}, [
  selectedSoftwareId,
  ITEMS_PER_PAGE, 
  sortBy,
  sortOrder,
  docTypeFilter,
  createdFromFilter,
  createdToFilter,
  updatedFromFilter,
  updatedToFilter,
  isAuthenticated,
  documents // Added documents as dependency because it's used in favorite items update logic for appending
]);
  
// Effect for initial load and when critical filters/sort change
useEffect(() => {
  if (!isAuthenticated) {
    setDocuments([]);
    setFavoritedItems(new Map());
    setCurrentPage(1);
    setHasMore(false);
    setIsLoadingInitial(false);
    return;
  }
  setDocuments([]); 
  setCurrentPage(1);  
  setHasMore(true);   
  fetchAndSetDocuments(1, true); 
}, [
  isAuthenticated, 
  selectedSoftwareId, 
  sortBy, 
  sortOrder, 
  docTypeFilter, 
  createdFromFilter, 
  createdToFilter, 
  updatedFromFilter, 
  updatedToFilter,
  fetchAndSetDocuments // fetchAndSetDocuments is now a dependency
]);


// Handler for applying advanced filters - triggers the useEffect above
const handleApplyAdvancedFilters = () => {
  // The state changes for filters (docTypeFilter, etc.) will trigger the useEffect.
};

// Handler for clearing advanced filters - triggers the useEffect above
const handleClearAdvancedFilters = () => {
  setDocTypeFilter('');
  setCreatedFromFilter('');
  setCreatedToFilter('');
  setUpdatedFromFilter('');
  setUpdatedToFilter('');
  // If setSelectedSoftwareId(null) is also part of clear, it will also trigger the effect.
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

// handleFilterChange, handleSort will now just update state, letting the main useEffect handle refetch.
  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  // handlePageChange is removed for infinite scroll

  const handleSort = (columnKey: string) => {
    const newSortOrder = sortBy === columnKey && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(columnKey);
    setSortOrder(newSortOrder);
  };

  const handleDocumentAdded = (newDocument: DocumentType) => {
    setShowAddDocumentForm(false);
    setFeedbackMessage(`Document "${newDocument.doc_name}" added successfully.`);
    // Refresh the list from page 1 to show the new document
    setDocuments([]); setCurrentPage(1); setHasMore(true); fetchAndSetDocuments(1, true);
  };

  const handleDocumentUpdated = (updatedDocument: DocumentType) => {
    setEditingDocument(null);
    setFeedbackMessage(`Document "${updatedDocument.doc_name}" updated successfully.`);
    setDocuments([]); setCurrentPage(1); setHasMore(true); fetchAndSetDocuments(1, true);
  };

  const openEditForm = (doc: DocumentType) => {
    setShowAddDocumentForm(false);
    setEditingDocument(doc);
    setFeedbackMessage(null);
  };

  const closeEditForm = () => {
    setEditingDocument(null);
  };

  const openDeleteConfirm = (doc: DocumentType) => {
    setDocumentToDelete(doc);
    setShowDeleteConfirm(true);
    setFeedbackMessage(null);
  };

  const closeDeleteConfirm = () => {
    setDocumentToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAdminDocument(documentToDelete.id);
      setFeedbackMessage(`Document "${documentToDelete.doc_name}" deleted successfully.`);
      closeDeleteConfirm();
      // If on the last page and it becomes empty, go to previous page
      if (documents.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1); // This will trigger a re-fetch via useEffect
      } else {
        loadDocuments(); // Otherwise, just re-fetch
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete document.");
      closeDeleteConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDocumentsBySearch = useMemo(() => {
    // Client-side search on the currently fetched page of documents
    if (!searchTerm) return documents;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.doc_name.toLowerCase().includes(lowerSearchTerm) ||
      (doc.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (doc.software_name || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [documents, searchTerm]);

  const columns: ColumnDef<DocumentType>[] = [
    { key: 'doc_name', header: 'Name', sortable: true },
    { key: 'doc_type', header: 'Type', sortable: true },
    { key: 'software_name', header: 'Software', sortable: true },
    { key: 'description', header: 'Description', render: (doc: DocumentType) => (
      <span className="text-sm text-gray-600 block max-w-xs truncate" title={doc.description || ''}>
        {doc.description || '-'}
      </span>
    )},
    {
      key: 'download_link',
      header: 'Download',
      render: (document: DocumentType) => (
        <a
          href={document.download_link}
          target={document.is_external_link || !document.download_link?.startsWith('/') ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          Download
          <ExternalLink size={14} className="ml-1" />
        </a>
      )
    },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (doc) => doc.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (doc) => doc.updated_by_username || 'N/A' }, // Not typically sorted
    { key: 'created_at', header: 'Created At', sortable: true, render: (doc) => doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-CA') : '-' },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (doc) => doc.updated_at ? new Date(doc.updated_at).toLocaleDateString('en-CA') : '-' },
    ...(isAuthenticated ? [{ // Changed condition to isAuthenticated for favorite button
      key: 'actions' as keyof DocumentType | 'actions',
      header: 'Actions',
      render: (document: DocumentType) => (
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFavoriteToggle(document, 'document' as FavoriteItemType);
            }}
            className={`p-1 ${favoritedItems.get(document.id)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`}
            title={favoritedItems.get(document.id)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star size={16} className={favoritedItems.get(document.id)?.favoriteId ? "fill-current" : ""} />
          </button>
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEditForm(document);}} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Document"><Edit3 size={16} /></button>
              <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(document);}} className="p-1 text-red-600 hover:text-red-800" title="Delete Document"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ),
    }] : [])
  ];
  
  const renderAdminFormArea = () => {
    if (editingDocument) {
      return (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminDocumentEntryForm documentToEdit={editingDocument} onDocumentUpdated={handleDocumentUpdated} onCancelEdit={closeEditForm} />
        </div>
      );
    }
    if (showAddDocumentForm) {
      return (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminDocumentEntryForm onDocumentAdded={handleDocumentAdded} onCancelEdit={() => setShowAddDocumentForm(false)} />
        </div>
      );
    }
    return null;
  };

  const handleFavoriteToggle = async (item: DocumentType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) {
      setFeedbackMessage("Please log in to manage favorites.");
      return;
    }

    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    
    // Optimistic UI update
    const tempFavoritedItems = new Map(favoritedItems);
    if (isCurrentlyFavorited) {
      tempFavoritedItems.set(item.id, { favoriteId: undefined });
    } else {
      // For optimistic add, we don't have the real favorite_id yet.
      // We can use a placeholder or handle it by refetching status.
      // Here, we'll just mark it as favorited and update with real ID later.
      tempFavoritedItems.set(item.id, { favoriteId: -1 }); // Placeholder for "favorited"
    }
    setFavoritedItems(tempFavoritedItems);
    setFeedbackMessage(null); // Clear previous messages

    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        setFeedbackMessage(`"${item.doc_name}" removed from favorites.`);
        // UI already updated optimistically for removal, confirm by ensuring it's undefined
        setFavoritedItems(prev => {
            const newMap = new Map(prev);
            newMap.set(item.id, { favoriteId: undefined });
            return newMap;
        });
      } else {
        const newFavorite = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => {
          const newMap = new Map(prev);
          newMap.set(item.id, { favoriteId: newFavorite.id }); // Update with real ID
          return newMap;
        });
        setFeedbackMessage(`"${item.doc_name}" added to favorites.`);
      }
    } catch (error: any) {
      console.error("Failed to toggle favorite:", error);
      setFeedbackMessage(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      // Revert optimistic update
      setFavoritedItems(prev => {
        const newMap = new Map(prev);
        if (isCurrentlyFavorited) { // Failed to remove, so it's still favorited (revert to original state)
            newMap.set(item.id, { favoriteId: currentStatus?.favoriteId });
        } else { // Failed to add, so it's not favorited
            newMap.set(item.id, { favoriteId: undefined });
        }
        return newMap;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Documents</h2>
          <p className="text-gray-600 mt-1">Browse and download documentation</p>
        </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && !editingDocument && (
          <button
            onClick={() => { setShowAddDocumentForm(prev => !prev); setEditingDocument(null); setFeedbackMessage(null); }}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddDocumentForm ? 'Cancel Add Document' : 'Add New Document'}
          </button>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}
      {renderAdminFormArea()}

      {softwareList.length > 0 && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {/* Toggle Button for Advanced Filters */}
      <div className="mb-4">
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md text-sm font-medium"
        >
          {showAdvancedFilters ? (
            <>
              <ChevronUp size={18} className="mr-2" /> Hide Advanced Filters
            </>
          ) : (
            <>
              <Filter size={18} className="mr-2" /> Show Advanced Filters
            </>
          )}
        </button>
      </div>

      {/* Advanced Filter UI - Conditionally Rendered */}
      {showAdvancedFilters && (
        <div className="my-4 p-4 border rounded-md bg-gray-50 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
          {/* Document Type Filter */}
          <div className="flex flex-col">
          <label htmlFor="docTypeFilterInput" className="text-sm font-medium text-gray-700 mb-1">Document Type</label>
          <input
            id="docTypeFilterInput"
            type="text"
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            placeholder="e.g., Manual, Guide"
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {/* Created At Filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Created Between</label>
          <div className="flex items-center gap-2">
            <input type="date" value={createdFromFilter} onChange={(e) => setCreatedFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            <span className="text-gray-500">and</span>
            <input type="date" value={createdToFilter} onChange={(e) => setCreatedToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
          </div>
        </div>
        
        {/* Updated At Filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Updated Between</label>
          <div className="flex items-center gap-2">
            <input type="date" value={updatedFromFilter} onChange={(e) => setUpdatedFromFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            <span className="text-gray-500">and</span>
            <input type="date" value={updatedToFilter} onChange={(e) => setUpdatedToFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
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
      </div>
      )} 


      {isInitialLoad && isLoading ? ( // Show LoadingState only on initial load
        <LoadingState />
      ) : error && isInitialLoad && documents.length === 0 ? ( // Ensure ErrorState shows only if no data and initial error
        <ErrorState message={error} onRetry={loadDocuments} />
      ) : (
        <>
          {/* Toasts will handle non-initial load errors. No specific inline error display needed here. */}
          <DataTable
            columns={columns}
            data={filteredDocumentsBySearch}
            rowClassName="group" // Added group class for row hover effect
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            totalItems={totalDocuments}
            sortColumn={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </>
      )}

      {showDeleteConfirm && documentToDelete && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Delete Document"
          message={`Are you sure you want to delete the document "${documentToDelete.doc_name}"? This action cannot be undone.`}
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

export default DocumentsView;