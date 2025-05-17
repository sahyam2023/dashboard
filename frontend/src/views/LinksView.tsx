// src/views/LinksView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchLinks,
  fetchSoftware,
  // fetchVersionsForSoftware, // No longer needed directly in this view if AdminLinkEntryForm handles it
  deleteAdminLink // Import delete function
} from '../services/api';
import {
  Link as LinkType,
  Software
  // AddLinkPayloadFlexible, EditLinkPayloadFlexible are used by AdminLinkEntryForm
} from '../types';
import FilterTabs from '../components/FilterTabs';
import LinkCard from '../components/LinkCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminLinkEntryForm from '../components/admin/AdminLinkEntryForm'; // Ensure this is the updated form
import ConfirmationModal from '../components/shared/ConfirmationModal'; // For delete confirmation
import { PlusCircle, Edit3, Trash2 } from 'lucide-react'; // Icons for buttons

interface OutletContextType {
  searchTerm: string;
}

const LinksView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [links, setLinks] = useState<LinkType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for managing the Add/Edit form visibility and data
  const [showAddOrEditForm, setShowAddOrEditForm] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkType | null>(null);

  // State for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState<LinkType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const linksData = await fetchLinks(
        selectedSoftwareId === null ? undefined : selectedSoftwareId
      );
      setLinks(linksData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch links.');
      console.error("Error fetching links:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSoftwareId]);

  useEffect(() => {
    const loadSoftwareForFilters = async () => {
      try {
        const softwareData = await fetchSoftware();
        setSoftwareList(softwareData);
      } catch (err) {
        console.error("Failed to load software for filters", err);
        // Optionally set an error state for software loading if critical
      }
    };
    loadSoftwareForFilters();
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]); // selectedSoftwareId is a dependency of loadLinks

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  const handleOperationSuccess = () => { // Called after successful Add or Update
    setShowAddOrEditForm(false);
    setEditingLink(null);
    loadLinks(); // Refresh the list
  };
  
  const openAddForm = () => {
    setEditingLink(null); // Ensure not in edit mode
    setShowAddOrEditForm(true);
  };

  const openEditForm = (link: LinkType) => {
    setEditingLink(link);
    setShowAddOrEditForm(true);
  };

  const closeAdminForm = () => {
    setEditingLink(null);
    setShowAddOrEditForm(false);
  };

  const openDeleteConfirm = (link: LinkType) => {
    setLinkToDelete(link);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setLinkToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!linkToDelete) return;
    setIsDeleting(true);
    setError(null); // Clear previous general errors
    try {
      await deleteAdminLink(linkToDelete.id);
      closeDeleteConfirm();
      loadLinks(); // Refresh list after delete
    } catch (err: any) {
      // Set error specific to delete operation if needed, or use general error state
      setError(err.response?.data?.msg || err.message || "Failed to delete link.");
      console.error("Delete error:", err);
      closeDeleteConfirm(); // Close modal even on error
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredLinks = useMemo(() => {
    if (!searchTerm) {
      return links;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return links.filter(link =>
      link.title.toLowerCase().includes(lowerSearchTerm) ||
      (link.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (link.software_name || '').toLowerCase().includes(lowerSearchTerm) ||
      (link.version_number || '').toLowerCase().includes(lowerSearchTerm) // Link version_number is now mandatory string
    );
  }, [links, searchTerm]);

  const handleRetryFetch = () => {
      loadLinks();
      if(softwareList.length === 0) {
        const loadSoftwareForFilters = async () => {
             try { const sw = await fetchSoftware(); setSoftwareList(sw); } catch (e) { console.error(e); }
        };
        loadSoftwareForFilters();
      }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Links</h2>
          <p className="text-gray-600 mt-1">Useful links and resources</p>
        </div>
        {isAuthenticated && role === 'admin' && (
          <button
             onClick={showAddOrEditForm && !editingLink ? closeAdminForm : openAddForm} // Toggle Add form or open it
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddOrEditForm && !editingLink ? 'Cancel Add Link' : 'Add New Link'}
          </button>
        )}
      </div>

      {/* Admin Form for Adding or Editing a Link */}
      {showAddOrEditForm && isAuthenticated && role === 'admin' && (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminLinkEntryForm
            linkToEdit={editingLink} // Pass null for "Add" mode, or the link object for "Edit"
            onLinkAdded={handleOperationSuccess}
            onLinkUpdated={handleOperationSuccess}
            onCancelEdit={closeAdminForm}
          />
        </div>
      )}

      {/* Filters */}
      {softwareList.length > 0 && (!error || links.length > 0) && ( // Show filters if data or no critical error
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {/* Links Display */}
      {isLoading ? (
        <LoadingState />
      ) : error && links.length === 0 ? ( // Show full error state only if no data could be loaded
        <ErrorState message={error} onRetry={handleRetryFetch} />
      ) : (
        <>
          {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>} {/* Inline error */}
          {filteredLinks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredLinks.map((link) => (
                <div key={link.id} className="relative group bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
                  <LinkCard link={link} />
                  {isAuthenticated && role === 'admin' && (
                    <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-md shadow-lg border border-gray-100 z-10">
                      <button
                        onClick={() => openEditForm(link)}
                        className="p-1.5 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-50"
                        title="Edit Link"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(link)}
                        className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-50"
                        title="Delete Link"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
             <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm border">
              <p className="text-gray-500">
                No links found{selectedSoftwareId ? ` for ${softwareList.find(s=>s.id === selectedSoftwareId)?.name || 'selected software'}` : ''}
                {searchTerm && ` matching "${searchTerm}"`}.
                {isAuthenticated && role === 'admin' && !showAddOrEditForm && " You can add one."}
              </p>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
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