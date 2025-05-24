import React, { useState, useCallback, useEffect } from 'react';
import AdminVersionsTable from '../components/admin/versions/AdminVersionsTable';
import AdminVersionForm from '../components/admin/versions/AdminVersionForm';
import { AdminSoftwareVersion, Software } from '../services/api'; 
import { deleteAdminVersion, fetchSoftware } from '../services/api'; 
import ConfirmationModal from '../components/shared/ConfirmationModal'; 
import Modal from '../components/shared/Modal'; 

const AdminVersionsPage: React.FC = () => {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AdminSoftwareVersion | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Used to trigger table refresh
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Optional: For filtering table by software if desired
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareFilter, setSelectedSoftwareFilter] = useState<number | null>(null);


  // Fetch software list for potential filtering (optional feature)
  useEffect(() => {
    const loadSoftware = async () => {
      try {
        const data = await fetchSoftware();
        setSoftwareList(data);
      } catch (error) {
        console.error("Failed to load software list for filtering:", error);
        // Optionally set a feedback message here
      }
    };
    loadSoftware();
  }, []);


  const handleOpenAddForm = () => {
    setEditingVersion(null);
    setIsFormModalOpen(true);
    setFeedbackMessage(null);
  };

  const handleOpenEditForm = (version: AdminSoftwareVersion) => {
    setEditingVersion(version);
    setIsFormModalOpen(true);
    setFeedbackMessage(null);
  };

  const handleFormSubmitSuccess = () => {
    setIsFormModalOpen(false);
    setEditingVersion(null);
    setRefreshKey(prevKey => prevKey + 1); // Trigger table refresh
    setFeedbackMessage({ type: 'success', message: editingVersion ? 'Version updated successfully!' : 'Version added successfully!' });
    setTimeout(() => setFeedbackMessage(null), 3000); // Clear message after 3 seconds
  };

  const handleFormCancel = () => {
    setIsFormModalOpen(false);
    setEditingVersion(null);
  };

  const handleDeleteRequest = (versionId: number) => {
    setVersionToDelete(versionId);
    setShowDeleteConfirm(true);
    setFeedbackMessage(null);
  };

  const confirmDelete = async () => {
    if (versionToDelete === null) return;
    try {
      await deleteAdminVersion(versionToDelete);
      setFeedbackMessage({ type: 'success', message: 'Version deleted successfully!' });
      setRefreshKey(prevKey => prevKey + 1); // Refresh table
    } catch (error: any) {
      const apiErrorMessage = error.response?.data?.msg || error.message || 'Failed to delete version.';
      setFeedbackMessage({ type: 'error', message: apiErrorMessage });
      console.error('Error deleting version:', error);
    } finally {
      setShowDeleteConfirm(false);
      setVersionToDelete(null);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setVersionToDelete(null);
  };

  return (
    <div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-semibold text-gray-800 mb-8">Manage Software Versions</h1>

      {feedbackMessage && (
        <div className={`p-4 mb-4 text-sm rounded-lg ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role="alert">
          {feedbackMessage.message}
        </div>
      )}

      <div className="mb-6 flex justify-between items-center">
        <button
          onClick={handleOpenAddForm}
          className="px-6 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Add New Version
        </button>
        
        {/* Optional: Software Filter Dropdown */}
        {softwareList.length > 0 && (
          <div className="w-1/4">
            <label htmlFor="softwareFilter" className="block text-sm font-medium text-gray-700">Filter by Software:</label>
            <select
              id="softwareFilter"
              value={selectedSoftwareFilter || ''}
              onChange={(e) => setSelectedSoftwareFilter(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">All Software</option>
              {softwareList.map(sw => (
                <option key={sw.id} value={sw.id}>{sw.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      <AdminVersionsTable
        onEdit={handleOpenEditForm}
        onDelete={handleDeleteRequest}
        refreshKey={refreshKey}
        softwareIdFilter={selectedSoftwareFilter}
      />

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
          message="Are you sure you want to delete this version? This action cannot be undone. Associated patches or links might prevent deletion if they reference this version."
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          confirmButtonText="Delete"
          confirmButtonVariant="danger" // Changed from confirmButtonColor
        />
      )}
    </div>
  );
};

export default AdminVersionsPage;
