// src/views/DocumentsView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink, PlusCircle, Edit3, Trash2 } from 'lucide-react'; // Added Edit3, Trash2
import { fetchDocuments, fetchSoftware, deleteAdminDocument } from '../services/api'; // Added deleteAdminDocument
import { Document as DocumentType, Software } from '../types';
import DataTable from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import AdminDocumentEntryForm from '../components/admin/AdminDocumentEntryForm';
// Simple Confirmation Modal (you might want a more styled one later)
import ConfirmationModal from '../components/shared/ConfirmationModal';
interface OutletContextType {
  searchTerm: string;
}

const DocumentsView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const { isAuthenticated, role } = useAuth();

  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddDocumentForm, setShowAddDocumentForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentType | null>(null); // For editing

  // For Delete Confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docsData = await fetchDocuments(selectedSoftwareId === null ? undefined : selectedSoftwareId);
      setDocuments(docsData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch documents. Please try again later.');
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
      }
    };
    loadSoftwareForFilters();
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  const handleDocumentAdded = (newDocument: DocumentType) => {
    setShowAddDocumentForm(false);
    // Optimistic update or simply reload
    // setDocuments(prevDocs => [newDocument, ...prevDocs.filter(d => d.id !== newDocument.id)]);
    loadDocuments();
  };

  const handleDocumentUpdated = (updatedDocument: DocumentType) => {
    setEditingDocument(null); // Close the form
    // Optimistic update or simply reload
    // setDocuments(prevDocs => prevDocs.map(d => d.id === updatedDocument.id ? updatedDocument : d));
    loadDocuments();
  };

  const openEditForm = (doc: DocumentType) => {
    setShowAddDocumentForm(false); // Close add form if open
    setEditingDocument(doc);
  };

  const closeEditForm = () => {
    setEditingDocument(null);
  };

  const openDeleteConfirm = (doc: DocumentType) => {
    setDocumentToDelete(doc);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setDocumentToDelete(null);
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    setError(null); // Clear previous errors
    try {
      await deleteAdminDocument(documentToDelete.id);
      closeDeleteConfirm();
      loadDocuments(); // Refresh list
      // Optionally show a success message
    } catch (err: any) {
      setError(err.message || "Failed to delete document.");
      console.error("Delete error:", err);
      // Keep modal open on error or close it? For now, let's close.
      closeDeleteConfirm();
    } finally {
      setIsDeleting(false);
    }
  };


  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.doc_name.toLowerCase().includes(lowerSearchTerm) ||
      (doc.description || '').toLowerCase().includes(lowerSearchTerm) ||
      (doc.software_name || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [documents, searchTerm]);

  const columns = [
    { key: 'doc_name', header: 'Name' },
    { key: 'doc_type', header: 'Type' },
    { key: 'software_name', header: 'Software' },
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
          href={document.download_link} // This is the external URL or /official_uploads/docs/...
          target={document.is_external_link || !document.download_link?.startsWith('/') ? "_blank" : "_self"}
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          Download
          <ExternalLink size={14} className="ml-1" />
        </a>
      )
    },
    // NEW: Actions column for admin
    ...(isAuthenticated && role === 'admin' ? [{
      key: 'actions',
      header: 'Actions',
      render: (document: DocumentType) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openEditForm(document)}
            className="p-1 text-blue-600 hover:text-blue-800"
            title="Edit Document"
          >
            <Edit3 size={16} />
          </button>
          <button
            onClick={() => openDeleteConfirm(document)}
            className="p-1 text-red-600 hover:text-red-800"
            title="Delete Document"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }] : [])
  ];

  const handleRetryFetchDocuments = () => {
      loadDocuments();
      if(softwareList.length === 0) {
        const loadSoftwareForFilters = async () => { /* ... */ };
        loadSoftwareForFilters();
      }
  }

  // If editing a document, show the form. Otherwise, show the "Add New" button or the add form.
  const renderAdminFormArea = () => {
    if (editingDocument) {
      return (
        <div className="my-6 p-4 bg-gray-50 rounded-lg shadow">
          <AdminDocumentEntryForm
            documentToEdit={editingDocument}
            onDocumentUpdated={handleDocumentUpdated}
            onCancelEdit={closeEditForm}
          />
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


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Documents</h2>
          <p className="text-gray-600 mt-1">Browse and download documentation</p>
        </div>
        {isAuthenticated && role === 'admin' && !editingDocument && ( // Hide "Add New" if editing
          <button
            onClick={() => { setShowAddDocumentForm(prev => !prev); setEditingDocument(null); }} // Ensure editingDoc is null
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusCircle size={18} className="mr-2" />
            {showAddDocumentForm ? 'Cancel Add Document' : 'Add New Document'}
          </button>
        )}
      </div>

      {/* Render either the edit form or the add form (if toggled) */}
      {renderAdminFormArea()}

      {softwareList.length > 0 && (!error || documents.length > 0) && (
        <FilterTabs
          software={softwareList}
          selectedSoftwareId={selectedSoftwareId}
          onSelectFilter={handleFilterChange}
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error && documents.length === 0 ? ( // Only show full error state if no documents loaded at all
        <ErrorState message={error} onRetry={handleRetryFetchDocuments} />
      ) : (
        <>
        {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>} {/* Inline error if some data is still shown */}
        <DataTable
          data={filteredDocuments}
          columns={columns}
          isLoading={isLoading} // Pass isLoading to DataTable for its internal skeleton
        />
        </>
      )}

      {/* Delete Confirmation Modal */}
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