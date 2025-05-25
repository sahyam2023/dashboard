import React, { useState, useCallback, useEffect } from 'react';
import AdminVersionsTable from '../components/admin/versions/AdminVersionsTable';
import AdminVersionForm from '../components/admin/versions/AdminVersionForm';
import { AdminSoftwareVersion, Software } from '../services/api'; 
import { deleteAdminVersion, fetchSoftware } from '../services/api'; 
import ConfirmationModal from '../components/shared/ConfirmationModal'; 
import Modal from '../components/shared/Modal'; 
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; // Import toast utilities
import { Box, Typography } from '@mui/material'; // Added
import { Tags as TagsIcon } from 'lucide-react'; // Added

// No need for LoadingState/ErrorState here as table handles its own, and errors are toasts

const AdminVersionsPage: React.FC = () => {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AdminSoftwareVersion | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Used to trigger table refresh

  // Software list for filter dropdown
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [isLoadingSoftwareList, setIsLoadingSoftwareList] = useState(true); // Added
  const [errorLoadingSoftwareList, setErrorLoadingSoftwareList] = useState<string | null>(null); // Added
  const [selectedSoftwareFilter, setSelectedSoftwareFilter] = useState<number | null>(null);
  // No explicit isInitialLoad or error state for the table itself, as AdminVersionsTable handles its loading/error state.
  // Errors from actions (delete, add, edit) will be handled by toasts.

  useEffect(() => {
    const loadSoftware = async () => {
      setIsLoadingSoftwareList(true);
      setErrorLoadingSoftwareList(null);
      try {
        const data = await fetchSoftware();
        setSoftwareList(data);
      } catch (error: any) {
        console.error("Failed to load software list for filtering:", error);
        const errMsg = error.response?.data?.msg || "Failed to load software list for filtering.";
        showErrorToast(errMsg);
        setErrorLoadingSoftwareList(errMsg); // Set error state
        setSoftwareList([]); // Ensure list is empty on error
      } finally {
        setIsLoadingSoftwareList(false);
      }
    };
    loadSoftware();
  }, []);

  const handleOpenAddForm = () => {
    setEditingVersion(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditForm = (version: AdminSoftwareVersion) => {
    setEditingVersion(version);
    setIsFormModalOpen(true);
  };

  const handleFormSubmitSuccess = () => {
    setIsFormModalOpen(false);
    setEditingVersion(null);
    setRefreshKey(prevKey => prevKey + 1);
    showSuccessToast(editingVersion ? 'Version updated successfully!' : 'Version added successfully!');
  };

  const handleFormCancel = () => {
    setIsFormModalOpen(false);
    setEditingVersion(null);
  };

  const handleDeleteRequest = (versionId: number) => {
    setVersionToDelete(versionId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (versionToDelete === null) return;
    try {
      await deleteAdminVersion(versionToDelete);
      showSuccessToast('Version deleted successfully!');
      setRefreshKey(prevKey => prevKey + 1);
    } catch (error: any) {
      const apiErrorMessage = error.response?.data?.msg || error.message || 'Failed to delete version.';
      showErrorToast(apiErrorMessage);
      console.error('Error deleting version:', error);
    } finally {
      setShowDeleteConfirm(false);
      setVersionToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setVersionToDelete(null);
  };

  return (
    <div className="container mx-auto p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-semibold text-gray-800 dark:text-gray-100 mb-8">Manage Software Versions</h1>

      {/* Feedback messages are now handled by toasts, so the feedbackMessage div is removed */}

      <div className="mb-6 flex justify-between items-center">
        <button
          onClick={handleOpenAddForm}
          className="px-6 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Add New Version
        </button>
        
        { !isLoadingSoftwareList && !errorLoadingSoftwareList && softwareList.length > 0 && (
          <div className="w-1/4">
            <label htmlFor="softwareFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Software:</label>
            <select
              id="softwareFilter"
              value={selectedSoftwareFilter || ''}
              onChange={(e) => {
                setSelectedSoftwareFilter(e.target.value ? Number(e.target.value) : null);
                setRefreshKey(prevKey => prevKey + 1); // Trigger table refresh on filter change
              }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600"
            >
              <option value="">All Software</option>
              {softwareList.map(sw => (
                <option key={sw.id} value={sw.id}>{sw.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      {/* AdminVersionsTable will handle its own loading and error states internally,
          or display "no data" if the fetch returns empty. Errors during fetch
          within AdminVersionsTable should use toasts if they are non-initial. */}
      {/* Conditional rendering for table or empty state for software list itself */}
      {isLoadingSoftwareList ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 3, mt: 2, backgroundColor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
          <Typography color="text.secondary">Loading software list for filtering...</Typography>
        </Box>
      ) : errorLoadingSoftwareList ? (
         <Box sx={{ textAlign: 'center', mt: 4, p: 3, border: '1px dashed', borderColor: 'error.main', borderRadius: 1 }}>
            <TagsIcon size={60} className="text-red-500 mb-4 mx-auto" />
            <Typography variant="h6" color="error.main" sx={{ mb: 1 }}>
              Could not load software list.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {errorLoadingSoftwareList} Please try refreshing the page or contact support.
            </Typography>
          </Box>
      ) : softwareList.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 4, p: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <TagsIcon size={60} className="text-gray-400 dark:text-gray-500 mb-4 mx-auto" />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            No software found.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add software first to manage their versions.
          </Typography>
        </Box>
      ) : (
        <AdminVersionsTable
          onEdit={handleOpenEditForm}
          onDelete={handleDeleteRequest}
          refreshKey={refreshKey}
          softwareIdFilter={selectedSoftwareFilter}
          // The table itself should manage its initial load error state and subsequent toast-based errors
          // And its own "no versions for this software" message
        />
      )}

      {isFormModalOpen && (
        <Modal 
            isOpen={isFormModalOpen} 
            onClose={handleFormCancel} 
            title={editingVersion ? 'Edit Software Version' : 'Add New Software Version'}
        >
          <AdminVersionForm
            initialData={editingVersion}
            onSubmitSuccess={handleFormSubmitSuccess}
            onCancel={handleFormCancel}
          />
        </Modal>
      )}

      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          title="Confirm Deletion"
          message="Are you sure you want to delete this version? This action cannot be undone. Associated items (patches, links) might prevent deletion if they reference this version."
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
};

export default AdminVersionsPage;
