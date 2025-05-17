// src/views/MiscView.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMiscCategories, // addAdminMiscCategory is now handled by the form
  fetchMiscFiles, // For editing via AdminMiscCategoryForm
  deleteAdminMiscCategory,
  deleteAdminMiscFile // Added for file deletion functionality
} from '../services/api';
import { MiscCategory, MiscFile } from '../types'; // AddCategoryPayload is used by AdminMiscCategoryForm
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import AdminUploadToMiscForm from '../components/admin/AdminUploadToMiscForm'; // For uploading files
import AdminMiscCategoryForm from '../components/admin/AdminMiscCategoryForm'; // For Add/Edit Category
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { Download, FileText, CalendarDays, ChevronDown, ChevronUp, PlusCircle, Edit3, Trash2 } from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:5000'; // Consider importing from a central config

const MiscView: React.FC = () => {
  const { isAuthenticated, role } = useAuth();
  const [categories, setCategories] = useState<MiscCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errorCategories, setErrorCategories] = useState<string | null>(null);

  // State for showing/hiding the Add/Edit Category Form and the category being edited
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MiscCategory | null>(null);

  // State for file uploads and display
  const [categoryFiles, setCategoryFiles] = useState<Record<number, MiscFile[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState<Record<number, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const [showGeneralUploadForm, setShowGeneralUploadForm] = useState(false);

  // State for Delete Category Confirmation
  const [categoryToDelete, setCategoryToDelete] = useState<MiscCategory | null>(null);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [deleteCategoryError, setDeleteCategoryError] = useState<string | null>(null);
  
  // State for Individual File Deletion
  const [fileToDelete, setFileToDelete] = useState<MiscFile | null>(null);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);

  const loadMiscCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setErrorCategories(null);
    try {
      const data = await fetchMiscCategories();
      setCategories(data);
    } catch (err: any) {
      setErrorCategories(err.message || 'Failed to load misc categories.');
      console.error("Error loading misc categories:", err);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadMiscCategories();
  }, [loadMiscCategories]);

  const fetchFilesForCategory = useCallback(async (categoryId: number, forceRefresh = false) => {
    if (!forceRefresh && categoryFiles[categoryId] && !isLoadingFiles[categoryId]) {
      // Files already loaded and not forcing refresh, do nothing
      return;
    }
    
    setIsLoadingFiles(prev => ({ ...prev, [categoryId]: true }));
    try {
      const files = await fetchMiscFiles(categoryId);
      setCategoryFiles(prev => ({ ...prev, [categoryId]: files }));
    } catch (err) {
      console.error(`Failed to load files for category ${categoryId}`, err);
    } finally {
      setIsLoadingFiles(prev => ({ ...prev, [categoryId]: false }));
    }
  }, [categoryFiles, isLoadingFiles]);

  const toggleCategoryFiles = (categoryId: number) => {
    const isCurrentlyExpanded = !!expandedCategories[categoryId];
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !isCurrentlyExpanded }));
    if (!isCurrentlyExpanded) {
      fetchFilesForCategory(categoryId);
    }
  };

  const handleMiscFileUploadSuccess = (uploadedFile: MiscFile) => {
    fetchFilesForCategory(uploadedFile.misc_category_id, true); // Force refresh after upload
    setShowGeneralUploadForm(false); // Close general form if it was open
    setExpandedCategories(prev => ({...prev, [uploadedFile.misc_category_id]: true})); // Ensure category is open
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return "Invalid Date";
    }
  };

  // --- Category Add/Edit/Delete Handlers ---
  const handleOpenAddCategoryForm = () => {
    setEditingCategory(null);
    setShowCategoryForm(true);
  };

  const handleOpenEditCategoryForm = (category: MiscCategory) => {
    setEditingCategory(category);
    setShowCategoryForm(true);
  };

  const handleCloseCategoryForm = () => {
    setEditingCategory(null);
    setShowCategoryForm(false);
  };

  const handleCategoryOperationSuccess = () => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    loadMiscCategories(); // Refresh list
  };

  const handleOpenDeleteCategoryConfirm = (category: MiscCategory) => {
    setCategoryToDelete(category);
    setDeleteCategoryError(null);
    setShowDeleteCategoryConfirm(true);
  };

  const handleCloseDeleteCategoryConfirm = () => {
    setCategoryToDelete(null);
    setShowDeleteCategoryConfirm(false);
    setDeleteCategoryError(null);
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;

    // If a blocking error is already displayed, clicking "Delete" again might do nothing
    // or we can prevent re-attempt if the specific error is present.
    if (deleteCategoryError && deleteCategoryError.includes("Cannot delete category")) {
      // Optionally, you could just close the modal here if the button text is "Cannot Delete"
      // handleCloseDeleteCategoryConfirm();
      return; // Prevent re-attempting delete if already known it can't be deleted
    }

    setIsDeletingCategory(true);
    setDeleteCategoryError(null); // Clear for new attempt
    try {
      await deleteAdminMiscCategory(categoryToDelete.id);
      handleCloseDeleteCategoryConfirm();
      loadMiscCategories();
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || "Failed to delete category.";
      setDeleteCategoryError(errorMsg);
      // The modal will now display this errorMsg. The user can then only "Cancel".
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // --- File Deletion Handlers ---
  const handleOpenDeleteFileConfirm = (file: MiscFile) => {
    setFileToDelete(file);
    setDeleteFileError(null); // Clear previous errors
    setShowDeleteFileConfirm(true);
  };

  const handleCloseDeleteFileConfirm = () => {
    setFileToDelete(null);
    setShowDeleteFileConfirm(false);
    setDeleteFileError(null);
  };

  const handleDeleteFileConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    setDeleteFileError(null);
    try {
      await deleteAdminMiscFile(fileToDelete.id);
      handleCloseDeleteFileConfirm();
      // Refresh the file list for the specific category
      fetchFilesForCategory(fileToDelete.misc_category_id, true); // Force refresh
    } catch (err: any) {
      setDeleteFileError(err.response?.data?.msg || err.message || "Failed to delete file.");
    } finally {
      setIsDeletingFile(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Miscellaneous Content</h2>
        <p className="text-gray-600">Browse categorized miscellaneous files and resources.</p>
      </div>

      {isAuthenticated && role === 'admin' && (
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          {!showCategoryForm && (
            <button
              onClick={handleOpenAddCategoryForm}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <PlusCircle size={18} className="mr-2" /> Add New Misc Category
            </button>
          )}

          {showCategoryForm && (
            <div className="my-4">
              <AdminMiscCategoryForm
                categoryToEdit={editingCategory}
                onSuccess={handleCategoryOperationSuccess}
                onCancel={handleCloseCategoryForm}
              />
            </div>
          )}

          <hr className="my-6" />
          <button
            onClick={() => setShowGeneralUploadForm(prev => !prev)}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <PlusCircle size={18} className="mr-2" /> {showGeneralUploadForm ? 'Cancel General Upload' : 'Upload New Misc File (General)'}
          </button>
          {showGeneralUploadForm && (
            <div className="mt-4">
              <AdminUploadToMiscForm onUploadSuccess={handleMiscFileUploadSuccess} />
            </div>
          )}
        </section>
      )}

      <section className="space-y-6">
        <h3 className="text-xl font-semibold text-gray-800">Categories</h3>
        {isLoadingCategories ? (
          <LoadingState message="Loading categories..." />
        ) : errorCategories ? (
          <ErrorState message={errorCategories} onRetry={loadMiscCategories} />
        ) : categories.length > 0 ? (
          categories.map(category => (
            <div key={category.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 sm:p-6 flex justify-between items-center group">
                <div className="flex-1 cursor-pointer" onClick={() => toggleCategoryFiles(category.id)}>
                  <h4 className="text-lg font-medium text-blue-700 hover:text-blue-800">{category.name}</h4>
                  {category.description && <p className="text-sm text-gray-600">{category.description}</p>}
                </div>
                <div className="flex items-center space-x-2">
                  {isAuthenticated && role === 'admin' && (
                    <>
                      <button
                        onClick={() => handleOpenEditCategoryForm(category)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100"
                        title="Edit Category"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleOpenDeleteCategoryConfirm(category)}
                        className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100"
                        title="Delete Category"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button onClick={() => toggleCategoryFiles(category.id)} className="p-1.5 text-gray-500 hover:text-gray-700">
                    {expandedCategories[category.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>
              {expandedCategories[category.id] && (
                <div className="border-t border-gray-200 p-4 sm:p-6">
                  {isLoadingFiles[category.id] ? (<LoadingState message="Loading files..." />) :
                    categoryFiles[category.id] && categoryFiles[category.id]!.length > 0 ? (
                      <ul className="space-y-3">
                        {categoryFiles[category.id]!.map(file => (
                          <li key={file.id} className="pb-3 border-b border-gray-100 last:border-b-0 flex flex-col sm:flex-row justify-between items-start group relative">
                            <div className="flex-1 flex items-start pr-4"> {/* Ensure text can wrap */}
                              <FileText size={20} className="text-gray-500 mr-3 mt-1 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800 break-all">{file.user_provided_title || file.original_filename}</p>
                                {file.user_provided_description && <p className="text-xs text-gray-600 mt-0.5 break-words">{file.user_provided_description}</p>}
                                <p className="text-xs text-gray-500 mt-1 flex items-center flex-wrap">
                                  <CalendarDays size={12} className="mr-1" />
                                  {formatDate(file.created_at ?? null)}
                                  {file.file_size !== null && typeof file.file_size !== 'undefined' && (
                                    <><span className="mx-1.5">|</span>{(file.file_size / (1024 * 1024)).toFixed(2)} MB</>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 sm:mt-0 flex items-center space-x-2 flex-shrink-0">
                              {/* Admin buttons for individual file management */}
                              {isAuthenticated && role === 'admin' && (
                                <>
                                  <button 
                                    onClick={() => { alert(`Edit file ${file.id} - TBD`); }}
                                    className="p-1.5 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-50"
                                    title="Edit File Details"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => handleOpenDeleteFileConfirm(file)}
                                    className="p-1.5 text-red-500 hover:text-red-700 rounded-full hover:bg-red-50"
                                    title="Delete File"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                              <a
                                href={`${API_BASE_URL}${file.file_path}`}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                              >
                                <Download size={14} className="mr-1.5" /> Download
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (<p className="text-sm text-gray-500">No files in this category yet.</p>)}
                  {isAuthenticated && role === 'admin' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <details>
                        <summary className="text-sm font-medium text-blue-600 hover:underline cursor-pointer">Upload to "{category.name}"</summary>
                        <div className="mt-3">
                          <AdminUploadToMiscForm
                            preselectedCategoryId={category.id}
                            onUploadSuccess={handleMiscFileUploadSuccess}
                          />
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="bg-white p-6 rounded-lg shadow-sm border text-center">
            <p className="text-gray-500">
              No miscellaneous categories found.
              {isAuthenticated && role === 'admin' && !showCategoryForm && " You can add one above."}
            </p>
          </div>
        )}
      </section>

      {/* Delete Category Confirmation Modal */}
      {showDeleteCategoryConfirm && categoryToDelete && (
        <ConfirmationModal
          isOpen={showDeleteCategoryConfirm}
          title="Delete Category"
          message={
            deleteCategoryError ? 
            <span className="text-red-600">{deleteCategoryError}</span> : // Display the error here
            `Are you sure you want to delete the category "${categoryToDelete.name}"? This action cannot be undone.`
          }
          onConfirm={handleDeleteCategoryConfirm} // Always pass the handler
          onCancel={handleCloseDeleteCategoryConfirm}
          isConfirming={isDeletingCategory}
          confirmButtonText={
            // Change button text if deletion is known to be blocked by backend rule
            deleteCategoryError && deleteCategoryError.includes("Cannot delete category") 
              ? "Close" // Or "OK", as delete won't proceed
              : "Delete"
          }
          confirmButtonVariant="danger"
        />
      )}

      {/* Delete File Confirmation Modal */}
      {showDeleteFileConfirm && fileToDelete && (
        <ConfirmationModal
          isOpen={showDeleteFileConfirm}
          title="Delete File"
          message={
            deleteFileError ?
            <span className="text-red-600">{deleteFileError}</span> :
            `Are you sure you want to delete the file "${fileToDelete.user_provided_title || fileToDelete.original_filename}"? This action cannot be undone.`
          }
          onConfirm={handleDeleteFileConfirm}
          onCancel={handleCloseDeleteFileConfirm}
          isConfirming={isDeletingFile}
          confirmButtonText="Delete"
          confirmButtonVariant="danger"
        />
      )}
    </div>
  );
};

export default MiscView;