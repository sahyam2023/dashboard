// src/views/LinksView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchLinks,
  fetchSoftware,
  fetchVersionsForSoftware, // For version dropdown
  deleteAdminLink,
  PaginatedLinksResponse, // Import PaginatedLinksResponse
  addFavoriteApi, // Added
  removeFavoriteApi, // Added
  getFavoriteStatusApi, // Added
  FavoriteItemType // Added
} from '../services/api';
import {
  Link as LinkType,
  Software,
  SoftwareVersion // For version dropdown
} from '../types';
import DataTable, { ColumnDef } from '../components/DataTable'; // Import DataTable and ColumnDef
import FilterTabs from '../components/FilterTabs';
// Removed LinkCard as we are moving to DataTable
// import LoadingState from '../components/LoadingState'; // DataTable has its own
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminLinkEntryForm from '../components/admin/AdminLinkEntryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { PlusCircle, Edit3, Trash2, ExternalLink, Star } from 'lucide-react'; // Added Star

interface OutletContextType {
  searchTerm: string;
}

const LinksView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  // Data and Table State
  const [links, setLinks] = useState<LinkType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [versionList, setVersionList] = useState<SoftwareVersion[]>([]); // For version dropdown

  // Filter State
  const [activeSoftwareId, setActiveSoftwareId] = useState<number | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<number | null>(null);

  // Advanced Filter States
  const [linkTypeFilter, setLinkTypeFilter] = useState<string>('');
  const [createdFromFilter, setCreatedFromFilter] = useState<string>('');
  const [createdToFilter, setCreatedToFilter] = useState<string>('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalLinks, setTotalLinks] = useState<number>(0);

  // Sorting State
  const [sortBy, setSortBy] = useState<string>('title'); // Default sort column
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Loading and Error State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State for Forms and Modals
  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<LinkType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Favorite State
  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());

  const loadLinks = useCallback(async () => {
  setIsLoading(true);
  setError(null);
  // setFeedbackMessage(null); // Optional: Clear previous feedback if needed

  try {
    const response: PaginatedLinksResponse = await fetchLinks(
      activeSoftwareId || undefined,
      activeVersionId || undefined,
      currentPage,
      itemsPerPage,
      sortBy,
      sortOrder,
      linkTypeFilter || undefined,
      createdFromFilter || undefined,
      createdToFilter || undefined
    );

    setLinks(response.links);
    setTotalPages(response.total_pages);
    setTotalLinks(response.total_links);
    setCurrentPage(response.page);
    setItemsPerPage(response.per_page);

    // Initialize favoritedItems directly from fetched links (SUCCESS PATH)
    const newFavoritedItems = new Map<number, { favoriteId: number | undefined }>();
    if (isAuthenticated && response.links && response.links.length > 0) {
      for (const link of response.links) {
        if (link.favorite_id) {
          newFavoritedItems.set(link.id, { favoriteId: link.favorite_id });
        } else {
          newFavoritedItems.set(link.id, { favoriteId: undefined });
        }
      }
    }
    setFavoritedItems(newFavoritedItems);

  } catch (err: any) { // This is the SINGLE, CORRECT catch block
    console.error("Failed to load links:", err);
    setLinks([]);
    setError(err.message || 'Failed to fetch links. Please try again later.');

    // Reset pagination and other related states
    setTotalPages(0);
    setTotalLinks(0);
    // setCurrentPage(1); // Optionally reset to page 1
    // setItemsPerPage(10); // Optionally reset per_page

    // Clear favoritedItems as the link list is now empty or inconsistent
    setFavoritedItems(new Map());
  } finally {
    setIsLoading(false);
  }
}, [
  activeSoftwareId,
  activeVersionId,
  currentPage,
  itemsPerPage,
  sortBy,
  sortOrder,
  linkTypeFilter,
  createdFromFilter,
  createdToFilter,
  isAuthenticated
]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFavoritedItems(new Map()); 
    }
    // loadLinks will be called by the main useEffect watching `loadLinks` itself.
  }, [isAuthenticated]);

  // REMOVED N+1 useEffect for getFavoriteStatusApi calls

  // Handler for applying advanced filters
  const handleApplyAdvancedFilters = () => {
    setCurrentPage(1); // This will trigger loadLinks due to dependency
  };

  // Handler for clearing advanced filters
  const handleClearAdvancedFilters = () => {
    setLinkTypeFilter('');
    setCreatedFromFilter('');
    setCreatedToFilter('');
    // Consider if activeSoftwareId and activeVersionId should be cleared here too.
    // For now, only clearing new advanced filters as per instruction.
    // setActiveSoftwareId(null); 
    // setActiveVersionId(null);
    setCurrentPage(1); // This will trigger loadLinks
  };

  useEffect(() => {
    const loadSoftwareAndInitialLinks = async () => {
      setIsLoading(true);
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
        // Initial load of links can happen here or rely on the second useEffect
      } catch (err) {
        console.error("Failed to load software for filters", err);
        setError("Failed to load software filters. Links may not display correctly.");
      }
      // No finally setIsLoading(false) here, let loadLinks handle it
    };
    loadSoftwareAndInitialLinks();
  }, []);
  
  useEffect(() => {
    loadLinks();
  }, [loadLinks]); // Dependencies are now managed by useCallback for loadLinks

  useEffect(() => {
    // Fetch versions when activeSoftwareId changes
    if (activeSoftwareId) {
      const loadVersions = async () => {
        try {
          const versionsData = await fetchVersionsForSoftware(activeSoftwareId);
          setVersionList(versionsData);
        } catch (err) {
          console.error("Failed to load versions for software:", activeSoftwareId, err);
          setVersionList([]); // Clear previous versions on error
        }
      };
      loadVersions();
    } else {
      setVersionList([]); // Clear versions if no software is selected
    }
  }, [activeSoftwareId]);


  const handleSoftwareFilterChange = (softwareId: number | null) => {
    setActiveSoftwareId(softwareId);
    setActiveVersionId(null); // Reset version when software changes
    setCurrentPage(1);
  };

  const handleVersionFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const versionId = event.target.value ? parseInt(event.target.value, 10) : null;
    setActiveVersionId(versionId);
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
    setEditingLink(null);
    setFeedbackMessage(message);
    loadLinks(); // Refresh
  };
  
  const openAddForm = () => {
    setEditingLink(null);
    setShowAddOrEditForm(true);
    setFeedbackMessage(null);
  };

  const openEditForm = (link: LinkType) => {
    setEditingLink(link);
    setShowAddOrEditForm(true);
    setFeedbackMessage(null);
  };

  const closeAdminForm = () => {
    setEditingLink(null);
    setShowAddOrEditForm(false);
  };

  const openDeleteConfirm = (link: LinkType) => {
    setLinkToDelete(link);
    setShowDeleteConfirm(true);
    setFeedbackMessage(null);
  };

  const closeDeleteConfirm = () => {
    setLinkToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAdminLink(linkToDelete.id);
      setFeedbackMessage(`Link "${linkToDelete.title}" deleted successfully.`);
      closeDeleteConfirm();
      if (links.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        loadLinks();
      }
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || "Failed to delete link.");
      closeDeleteConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  // Client-side search on the currently fetched page of links
  const filteredLinksBySearch = useMemo(() => {
    if (!searchTerm) return links;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return links.filter(link =>
      link.title.toLowerCase().includes(lowerSearchTerm) ||
      (link.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (link.software_name || '').toLowerCase().includes(lowerSearchTerm) ||
      (link.version_number || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [links, searchTerm]);

  const columns: ColumnDef<LinkType>[] = [
    { key: 'title', header: 'Title', sortable: true },
    { key: 'software_name', header: 'Software', sortable: true },
    { key: 'version_name', header: 'Version', sortable: true },
    { key: 'description', header: 'Description', render: (link: LinkType) => (
        <span className="text-sm text-gray-600 block max-w-xs truncate" title={link.description || ''}>
          {link.description || '-'}
        </span>
      ) 
    },
    { 
      key: 'url', 
      header: 'URL', 
      render: (link: LinkType) => (
        <a
          href={link.url}
          target={link.is_external_link || !link.url?.startsWith('/') ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          {link.url.length > 50 ? `${link.url.substring(0, 50)}...` : link.url}
          {(link.is_external_link || !link.url?.startsWith('/')) && <ExternalLink size={14} className="ml-1 flex-shrink-0" />}
        </a>
      ) 
    },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (link) => link.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (link) => link.updated_by_username || 'N/A' },
    { key: 'created_at', header: 'Created At', sortable: true, render: (link) => link.created_at ? new Date(link.created_at).toLocaleDateString('en-CA') : '-' },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (link) => link.updated_at ? new Date(link.updated_at).toLocaleDateString('en-CA') : '-' },
    ...(isAuthenticated ? [{ // Changed condition to isAuthenticated for favorite button
      key: 'actions' as keyof LinkType | 'actions',
      header: 'Actions',
      render: (link: LinkType) => (
        <div className="flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFavoriteToggle(link, 'link' as FavoriteItemType);
            }}
            className={`p-1 ${favoritedItems.get(link.id)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`}
            title={favoritedItems.get(link.id)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star size={16} className={favoritedItems.get(link.id)?.favoriteId ? "fill-current" : ""} />
          </button>
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={(e) => { e.stopPropagation(); openEditForm(link);}} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Link"><Edit3 size={16} /></button>
              <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(link);}} className="p-1 text-red-600 hover:text-red-800" title="Delete Link"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ),
    }] : [])
  ];

  const handleFavoriteToggle = async (item: LinkType, itemType: FavoriteItemType) => {
    if (!isAuthenticated) {
      setFeedbackMessage("Please log in to manage favorites.");
      return;
    }

    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    
    const tempFavoritedItems = new Map(favoritedItems);
    if (isCurrentlyFavorited) {
      tempFavoritedItems.set(item.id, { favoriteId: undefined });
    } else {
      tempFavoritedItems.set(item.id, { favoriteId: -1 }); // Placeholder
    }
    setFavoritedItems(tempFavoritedItems);
    setFeedbackMessage(null);

    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        setFeedbackMessage(`"${item.title}" removed from favorites.`);
        setFavoritedItems(prev => {
            const newMap = new Map(prev);
            newMap.set(item.id, { favoriteId: undefined });
            return newMap;
        });
      } else {
        const newFavorite = await addFavoriteApi(item.id, itemType);
        setFavoritedItems(prev => {
          const newMap = new Map(prev);
          newMap.set(item.id, { favoriteId: newFavorite.id });
          return newMap;
        });
        setFeedbackMessage(`"${item.title}" added to favorites.`);
      }
    } catch (error: any) {
      console.error("Failed to toggle favorite:", error);
      setFeedbackMessage(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      setFavoritedItems(prev => {
        const newMap = new Map(prev);
        if (isCurrentlyFavorited) {
            newMap.set(item.id, { favoriteId: currentStatus?.favoriteId });
        } else {
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
          <h2 className="text-2xl font-bold text-gray-800">Links</h2>
          <p className="text-gray-600 mt-1">Useful links and resources</p>
        </div>
        {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
          <button
             onClick={showAddOrEditForm && !editingLink ? closeAdminForm : openAddForm}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddOrEditForm && !editingLink ? 'Cancel Add Link' : 'Add New Link'}
          </button>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}

      {showAddOrEditForm && isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminLinkEntryForm
            linkToEdit={editingLink}
            onLinkAdded={() => handleOperationSuccess('Link added successfully.')}
            onLinkUpdated={() => handleOperationSuccess('Link updated successfully.')}
            onCancelEdit={closeAdminForm}
          />
        </div>
      )}

      <div className="flex space-x-4 items-center">
        {softwareList.length > 0 && (
          <FilterTabs
            software={softwareList}
            selectedSoftwareId={activeSoftwareId}
            onSelectFilter={handleSoftwareFilterChange}
          />
        )}
        {activeSoftwareId && versionList.length > 0 && (
          <div className="relative">
            <select
              value={activeVersionId || ''}
              onChange={handleVersionFilterChange}
              className="block appearance-none w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded-md leading-tight focus:outline-none focus:bg-white focus:border-blue-500 shadow-sm text-sm"
            >
              <option value="">All Versions for {softwareList.find(s=>s.id === activeSoftwareId)?.name || 'Selected Software'}</option>
              {versionList.map(version => (
                <option key={version.id} value={version.id}>
                  {version.version_number}
                </option>
              ))}
            </select>
             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filter UI */}
      <div className="my-4 p-4 border rounded-md bg-gray-50 space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4">
        {/* Link Type Filter */}
        <div className="flex flex-col">
          <label htmlFor="linkTypeFilterSelect" className="text-sm font-medium text-gray-700 mb-1">Link Type</label>
          <select
            id="linkTypeFilterSelect"
            value={linkTypeFilter}
            onChange={(e) => setLinkTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="external">External</option>
            <option value="uploaded">Uploaded File</option>
          </select>
        </div>

        {/* Created At Filter */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Created Between</label>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={createdFromFilter} 
              onChange={(e) => setCreatedFromFilter(e.target.value)} 
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
            />
            <span className="text-gray-500">and</span>
            <input 
              type="date" 
              value={createdToFilter} 
              onChange={(e) => setCreatedToFilter(e.target.value)} 
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
            />
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


      {error && links.length === 0 && !isLoading ? (
        <ErrorState message={error} onRetry={loadLinks} />
      ) : (
        <>
          {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
          <DataTable
            columns={columns}
            data={filteredLinksBySearch} // Use client-side search results
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            totalItems={totalLinks}
            sortColumn={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </>
      )}

      {showDeleteConfirm && linkToDelete && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Delete Link"
          message={`Are you sure you want to delete the link "${linkToDelete.title}"? This action cannot be undone.`}
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

export default LinksView;