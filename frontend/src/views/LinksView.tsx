// src/views/LinksView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchLinks,
  fetchSoftware,
  fetchVersionsForSoftware, // For version dropdown
  deleteAdminLink,
  PaginatedLinksResponse // Import PaginatedLinksResponse
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
import { PlusCircle, Edit3, Trash2, ExternalLink } from 'lucide-react';

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

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response: PaginatedLinksResponse = await fetchLinks(
        activeSoftwareId || undefined,
        activeVersionId || undefined,
        currentPage,
        itemsPerPage,
        sortBy,
        sortOrder
      );
      setLinks(response.links);
      setTotalPages(response.total_pages);
      setTotalLinks(response.total_links);
      setCurrentPage(response.page);
      setItemsPerPage(response.per_page);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch links.');
      console.error("Error fetching links:", err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSoftwareId, activeVersionId, currentPage, itemsPerPage, sortBy, sortOrder]);

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
      (link.version_name || '').toLowerCase().includes(lowerSearchTerm)
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
    { key: 'created_at', header: 'Created At', sortable: true, render: (link) => link.created_at ? new Date(link.created_at).toLocaleDateString() : '-' },
    ...(isAuthenticated && role === 'admin' ? [{
      key: 'actions' as keyof LinkType | 'actions',
      header: 'Actions',
      render: (link: LinkType) => (
        <div className="flex space-x-2">
          <button onClick={(e) => { e.stopPropagation(); openEditForm(link);}} className="p-1 text-blue-600 hover:text-blue-800" title="Edit Link"><Edit3 size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(link);}} className="p-1 text-red-600 hover:text-red-800" title="Delete Link"><Trash2 size={16} /></button>
        </div>
      ),
    }] : [])
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Links</h2>
          <p className="text-gray-600 mt-1">Useful links and resources</p>
        </div>
        {isAuthenticated && role === 'admin' && (
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

      {showAddOrEditForm && isAuthenticated && role === 'admin' && (
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