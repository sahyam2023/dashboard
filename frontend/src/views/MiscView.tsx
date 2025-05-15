// src/views/MiscView.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchMiscCategories, addAdminMiscCategory, fetchMiscFiles } from '../services/api';
import { MiscCategory, AddCategoryPayload, MiscFile } from '../types';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import AdminUploadToMiscForm from '../components/admin/AdminUploadToMiscForm';
import { Download, FileText, CalendarDays, ChevronDown, ChevronUp, PlusCircle } from 'lucide-react';

const API_BASE_URL = 'http://127.0.0.1:5000';

const MiscView: React.FC = () => {
  const { isAuthenticated, role } = useAuth();
  const [categories, setCategories] = useState<MiscCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errorCategories, setErrorCategories] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  // FIX 1: Use these state variables for error/success messages
  const [addCategoryError, setAddCategoryError] = useState<string | null>(null);
  const [addCategorySuccess, setAddCategorySuccess] = useState<string | null>(null);

  const [categoryFiles, setCategoryFiles] = useState<Record<number, MiscFile[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState<Record<number, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const [showGeneralUploadForm, setShowGeneralUploadForm] = useState(false);

  // FIX 1 (cont.): Removed unused fileRefreshTrigger state

  const loadMiscCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setErrorCategories(null);
    try {
      const data = await fetchMiscCategories();
      setCategories(data);
    } catch (err: any) {
      setErrorCategories(err.message || 'Failed to load misc categories.');
      console.error("Error loading misc categories:", err); // Log error
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadMiscCategories();
  }, [loadMiscCategories]);

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      setAddCategoryError("Category name is required.");
      return;
    }
    setIsAddingCategory(true);
    setAddCategoryError(null); // Clear previous errors/success
    setAddCategorySuccess(null);
    try {
      const payload: AddCategoryPayload = {
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || undefined,
      };
      const addedCategory = await addAdminMiscCategory(payload);
      setAddCategorySuccess(`Category "${addedCategory.name}" added successfully!`);
      setNewCategoryName('');
      setNewCategoryDescription('');
      loadMiscCategories(); // Refresh category list
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        setAddCategoryError(err.response.data.msg);
      } else {
        setAddCategoryError(err.message || "Failed to add category.");
      }
      console.error("Error adding category:", err); // Log error
    } finally {
      setIsAddingCategory(false);
    }
  };

  const fetchFilesForCategory = useCallback(async (categoryId: number) => {
    setIsLoadingFiles(prev => ({ ...prev, [categoryId]: true }));
    try {
      const files = await fetchMiscFiles(categoryId);
      setCategoryFiles(prev => ({ ...prev, [categoryId]: files }));
    } catch (err) {
      console.error(`Failed to load files for category ${categoryId}`, err);
      // Optionally set an error state per category for file loading
      // setErrorFiles(prev => ({...prev, [categoryId]: 'Failed to load files for this category.'}))
    } finally {
      setIsLoadingFiles(prev => ({ ...prev, [categoryId]: false }));
    }
  }, []);


  const toggleCategoryFiles = (categoryId: number) => {
    const isCurrentlyExpanded = !!expandedCategories[categoryId];
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !isCurrentlyExpanded }));

    // Fetch files only if expanding and not already fetched or currently loading
    if (!isCurrentlyExpanded && !categoryFiles[categoryId] && !isLoadingFiles[categoryId]) {
      fetchFilesForCategory(categoryId);
    }
  };

  const handleMiscFileUploadSuccess = (uploadedFile: MiscFile) => {
    const categoryId = uploadedFile.misc_category_id;
    // Refresh files for the specific category
    fetchFilesForCategory(categoryId); // Call the memoized fetch function
    setShowGeneralUploadForm(false); // Close general form if it was open
    // Optionally set a success message for file upload
  };

  const formatDate = (dateString: string | null): string => { // Accept string | null
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', { // More detailed format
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch(e) {
        return "Invalid Date";
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
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Add New Misc Category</h3>
          <form onSubmit={handleAddCategorySubmit} className="space-y-4">
            {/* FIX 1 (cont.): Display addCategoryError and addCategorySuccess */}
            {addCategoryError && <div className="p-3 bg-red-100 text-red-700 rounded">{addCategoryError}</div>}
            {addCategorySuccess && <div className="p-3 bg-green-100 text-green-700 rounded">{addCategorySuccess}</div>}
            <div>
              <label htmlFor="newCategoryName" className="block text-sm font-medium text-gray-700">Name*</label>
              <input
                type="text" id="newCategoryName" value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)} required disabled={isAddingCategory}
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="newCategoryDescription" className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                id="newCategoryDescription" value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)} rows={2} disabled={isAddingCategory}
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button type="submit" disabled={isAddingCategory}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              {isAddingCategory ? 'Adding...' : 'Add Category'}
            </button>
          </form>
          <hr className="my-6"/>
           <button
            onClick={() => setShowGeneralUploadForm(prev => !prev)}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
          >
            <PlusCircle size={18} className="mr-2" /> {showGeneralUploadForm ? 'Cancel Upload' : 'Upload New Misc File'}
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
              <div
                className="p-4 sm:p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                onClick={() => toggleCategoryFiles(category.id)}
              >
                <div>
                  <h4 className="text-lg font-medium text-blue-700">{category.name}</h4>
                  {category.description && <p className="text-sm text-gray-600">{category.description}</p>}
                </div>
                {expandedCategories[category.id] ? <ChevronUp size={20} className="text-gray-500"/> : <ChevronDown size={20} className="text-gray-500"/>}
              </div>
              {expandedCategories[category.id] && (
                <div className="border-t border-gray-200 p-4 sm:p-6">
                  {isLoadingFiles[category.id] ? (
                    <LoadingState message="Loading files..." />
                  ) : categoryFiles[category.id] && categoryFiles[category.id]!.length > 0 ? (
                    <ul className="space-y-3">
                      {categoryFiles[category.id]!.map(file => (
                        <li key={file.id} className="pb-3 border-b border-gray-100 last:border-b-0 flex flex-col sm:flex-row justify-between items-start">
                          <div className="flex items-start">
                            <FileText size={20} className="text-gray-500 mr-3 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">{file.user_provided_title || file.original_filename}</p>
                              {file.user_provided_description && <p className="text-xs text-gray-600 mt-0.5">{file.user_provided_description}</p>}
                              <p className="text-xs text-gray-500 mt-1 flex items-center">
                                <CalendarDays size={12} className="mr-1" /> {formatDate(file.uploaded_at)}
                                {file.file_size !== null && file.file_size !== undefined && ( // FIX 2: Check file_size
                                  <>
                                    <span className="mx-1.5">|</span>
                                    {(file.file_size / (1024*1024)).toFixed(2)} MB
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <a
                            href={`${API_BASE_URL}${file.file_path}`}
                            target="_blank" rel="noopener noreferrer"
                            className="mt-2 sm:mt-0 ml-0 sm:ml-4 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                          >
                            <Download size={14} className="mr-1.5" /> Download
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No files in this category yet.</p>
                  )}
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
              {isAuthenticated && role === 'admin' && " You can add one above."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default MiscView;