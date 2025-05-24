// src/views/MiscView.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMiscCategories,
  fetchMiscFiles,
  deleteAdminMiscCategory,
  deleteAdminMiscFile,
  PaginatedMiscFilesResponse, // Import PaginatedMiscFilesResponse
  addFavoriteApi, // Added
  removeFavoriteApi, // Added
  getFavoriteStatusApi, // Added
  FavoriteItemType // Added
} from '../services/api';
import { MiscCategory, MiscFile } from '../types';
import DataTable, { ColumnDef } from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState'; // Added import
import AdminUploadToMiscForm from '../components/admin/AdminUploadToMiscForm';
import AdminMiscCategoryForm from '../components/admin/AdminMiscCategoryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { Download, FileText, CalendarDays, PlusCircle, Edit3, Trash2, Star } from 'lucide-react'; // Keep existing icons, Added Star

const API_BASE_URL = 'http://127.0.0.1:5000'; // Consider importing from a central config

const MiscView: React.FC = () => {
  const { isAuthenticated, role } = useAuth();

  // Categories State
  const [categories, setCategories] = useState<MiscCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errorCategories, setErrorCategories] = useState<string | null>(null);
  
  // Misc Files State (Data and Table Controls)
  const [miscFiles, setMiscFiles] = useState<MiscFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true); // Single loading state for files table
  const [errorFiles, setErrorFiles] = useState<string | null>(null);
  
  // Filter State
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalMiscFiles, setTotalMiscFiles] = useState<number>(0);

  // Sorting State
  const [sortBy, setSortBy] = useState<string>('user_provided_title'); // Default sort column
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // UI State for Forms and Modals
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MiscCategory | null>(null);
  const [showGeneralUploadForm, setShowGeneralUploadForm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<MiscCategory | null>(null);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [deleteCategoryError, setDeleteCategoryError] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<MiscFile | null>(null);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Favorite State
  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());

  const loadMiscCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setErrorCategories(null);
    try {
      const data = await fetchMiscCategories();
      setCategories(data);
    } catch (err: any) {
      setCategories([]); // Add this line
      setErrorCategories(err.message || 'Failed to load misc categories.');
      console.error("Error loading misc categories:", err);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadMiscCategories();
  }, [loadMiscCategories]);

  const loadMiscFiles = useCallback(async () => {
  setIsLoadingFiles(true);
  setErrorFiles(null);
  // setFeedbackMessage(null); // Optional: Clear previous feedback if needed

  try {
    const response: PaginatedMiscFilesResponse = await fetchMiscFiles(
      activeCategoryId || undefined,
      currentPage,
      itemsPerPage,
      sortBy,
      sortOrder
    );

    setMiscFiles(response.misc_files);
    setTotalPages(response.total_pages);
    setTotalMiscFiles(response.total_misc_files);
    setCurrentPage(response.page);
    setItemsPerPage(response.per_page);

    // Initialize favoritedItems directly from fetched misc files (SUCCESS PATH)
    const newFavoritedItems = new Map<number, { favoriteId: number | undefined }>();
    if (isAuthenticated && response.misc_files && response.misc_files.length > 0) {
      for (const file of response.misc_files) {
        if (file.favorite_id) {
          newFavoritedItems.set(file.id, { favoriteId: file.favorite_id });
        } else {
          newFavoritedItems.set(file.id, { favoriteId: undefined });
        }
      }
    }
    setFavoritedItems(newFavoritedItems);

  } catch (err: any) { // This is the SINGLE, CORRECT catch block
    console.error("Failed to load miscellaneous files:", err);
    setMiscFiles([]);
    setErrorFiles(err.message || 'Failed to fetch miscellaneous files. Please try again later.');

    // Reset pagination and other related states
    setTotalPages(0);
    setTotalMiscFiles(0);
    // setCurrentPage(1); // Optionally reset to page 1
    // setItemsPerPage(10); // Optionally reset per_page

    // Clear favoritedItems as the file list is now empty or inconsistent
    setFavoritedItems(new Map());
  } finally {
    setIsLoadingFiles(false);
  }
}, [
  activeCategoryId,
  currentPage,
  itemsPerPage,
  sortBy,
  sortOrder,
  isAuthenticated
]); // Added isAuthenticated

  useEffect(() => {
    loadMiscFiles();
  }, [loadMiscFiles]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFavoritedItems(new Map()); 
    }
    // loadMiscFiles will be called by the main useEffect watching `loadMiscFiles` itself.
  }, [isAuthenticated]);

  // REMOVED N+1 useEffect for getFavoriteStatusApi calls

  const handleCategoryFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const categoryId = event.target.value ? parseInt(event.target.value, 10) : null;
    setActiveCategoryId(categoryId);
    setCurrentPage(1); // Reset to first page
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

  const handleMiscFileUploadSuccess = (uploadedFile: MiscFile) => {
    setShowGeneralUploadForm(false);
    setFeedbackMessage(`File "${uploadedFile.user_provided_title || uploadedFile.original_filename}" uploaded successfully.`);
    // If the upload was for the currently active category (or if no category is active), refresh
    if (activeCategoryId === null || activeCategoryId === uploadedFile.misc_category_id) {
      loadMiscFiles();
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return "Invalid Date"; }
  };
  
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || typeof bytes === 'undefined') return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  // --- Category Add/Edit/Delete Handlers (mostly preserved) ---
  const handleOpenAddCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(true); setFeedbackMessage(null); };
  const handleOpenEditCategoryForm = (category: MiscCategory) => { setEditingCategory(category); setShowCategoryForm(true); setFeedbackMessage(null);};
  const handleCloseCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(false); };
  const handleCategoryOperationSuccess = (message: string) => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    setFeedbackMessage(message);
    loadMiscCategories(); 
  };
  const handleOpenDeleteCategoryConfirm = (category: MiscCategory) => { setCategoryToDelete(category); setDeleteCategoryError(null); setShowDeleteCategoryConfirm(true); setFeedbackMessage(null); };
  const handleCloseDeleteCategoryConfirm = () => { setCategoryToDelete(null); setShowDeleteCategoryConfirm(false); setDeleteCategoryError(null);};
  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;
    if (deleteCategoryError && deleteCategoryError.includes("Cannot delete category")) return;
    setIsDeletingCategory(true);
    setDeleteCategoryError(null);
    try {
      await deleteAdminMiscCategory(categoryToDelete.id);
      setFeedbackMessage(`Category "${categoryToDelete.name}" deleted successfully.`);
      handleCloseDeleteCategoryConfirm();
      loadMiscCategories();
      if (activeCategoryId === categoryToDelete.id) { // If deleted category was the active filter
        setActiveCategoryId(null); // Reset filter, which will trigger loadMiscFiles
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || "Failed to delete category.";
      setDeleteCategoryError(errorMsg);
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // --- File Deletion Handlers (mostly preserved) ---
  const handleOpenDeleteFileConfirm = (file: MiscFile) => { setFileToDelete(file); setDeleteFileError(null); setShowDeleteFileConfirm(true); setFeedbackMessage(null);};
  const handleCloseDeleteFileConfirm = () => { setFileToDelete(null); setShowDeleteFileConfirm(false); setDeleteFileError(null);};
  const handleDeleteFileConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    setDeleteFileError(null);
    try {
      await deleteAdminMiscFile(fileToDelete.id);
      setFeedbackMessage(`File "${fileToDelete.user_provided_title || fileToDelete.original_filename}" deleted successfully.`);
      handleCloseDeleteFileConfirm();
      if (miscFiles.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1); // Will trigger loadMiscFiles
      } else {
        loadMiscFiles(); // Refresh current page
      }
    } catch (err: any) {
      setDeleteFileError(err.response?.data?.msg || err.message || "Failed to delete file.");
    } finally {
      setIsDeletingFile(false);
    }
  };

  const columns: ColumnDef<MiscFile>[] = [
    { key: 'user_provided_title', header: 'Title', sortable: true },
    { key: 'original_filename', header: 'Original Filename', sortable: true },
    { key: 'category_name', header: 'Category', sortable: true }, // Backend sorts by mc.name
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (file) => file.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (file) => file.updated_by_username || 'N/A' },
    { key: 'file_size', header: 'Size', sortable: true, render: (file) => formatFileSize(file.file_size) },
    { key: 'created_at', header: 'Uploaded At', sortable: true, render: (file) => formatDate(file.created_at) },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (file) => formatDate(file.updated_at) },
    {
      key: 'file_path',
      header: 'Link',
      render: (file) => (
        <a
          href={`${API_BASE_URL}${file.file_path}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          Download <Download size={14} className="ml-1" />
        </a>
      )
    },
    ...(isAuthenticated ? [{ // Changed condition to isAuthenticated for favorite button
      key: 'actions' as keyof MiscFile | 'actions',
      header: 'Actions',
      render: (file: MiscFile) => (
        <div className="flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFavoriteToggle(file, 'misc_file' as FavoriteItemType);
            }}
            className={`p-1 ${favoritedItems.get(file.id)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`}
            title={favoritedItems.get(file.id)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star size={16} className={favoritedItems.get(file.id)?.favoriteId ? "fill-current" : ""} />
          </button>
          {(role === 'admin' || role === 'super_admin') && (
            <>
              {/* TODO: Implement Edit Misc File functionality if needed */}
              {/* <button onClick={(e) => { e.stopPropagation(); alert('Edit TBD: '+file.id) }} className="p-1 text-blue-600 hover:text-blue-800" title="Edit File"><Edit3 size={16} /></button> */}
              <button onClick={(e) => { e.stopPropagation(); handleOpenDeleteFileConfirm(file);}} className="p-1 text-red-600 hover:text-red-800" title="Delete File"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ),
    }] : [])
  ];

  const handleFavoriteToggle = async (item: MiscFile, itemType: FavoriteItemType) => {
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
        setFeedbackMessage(`"${item.user_provided_title || item.original_filename}" removed from favorites.`);
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
        setFeedbackMessage(`"${item.user_provided_title || item.original_filename}" added to favorites.`);
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
    <div className="space-y-8">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Miscellaneous Files</h2>
          <p className="text-gray-600 mt-1">Browse and download categorized miscellaneous files.</p>
        </div>
         {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
            <div className="flex space-x-3 mt-4 sm:mt-0">
                 <button
                    onClick={() => {setShowCategoryForm(prev => !prev); setEditingCategory(null); setShowGeneralUploadForm(false); setFeedbackMessage(null);}}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                    <PlusCircle size={18} className="mr-2" />
                    {showCategoryForm && !editingCategory ? 'Cancel Add Category' : 'Add/Edit Category'}
                </button>
                 <button
                    onClick={() => {setShowGeneralUploadForm(prev => !prev); setShowCategoryForm(false); setEditingCategory(null); setFeedbackMessage(null);}}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                    <PlusCircle size={18} className="mr-2" />
                    {showGeneralUploadForm ? 'Cancel Upload' : 'Upload New File'}
                </button>
            </div>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}

      {showCategoryForm && isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-4 p-4 bg-gray-50 rounded-lg shadow">
          <AdminMiscCategoryForm categoryToEdit={editingCategory} onSuccess={() => handleCategoryOperationSuccess(editingCategory ? "Category updated." : "Category added.")} onCancel={handleCloseCategoryForm} />
        </div>
      )}
      {showGeneralUploadForm && isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-4 p-4 bg-gray-50 rounded-lg shadow">
          <AdminUploadToMiscForm onUploadSuccess={handleMiscFileUploadSuccess} />
        </div>
      )}
      
      {/* Category Filter Dropdown */}

      {/* Manage Categories Section */}
      {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-8 p-4 border border-gray-200 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Manage Categories</h3>
          {isLoadingCategories && <LoadingState type="table" count={3} message="Loading categories..." />}
          {errorCategories && <p className="text-sm text-red-500">{errorCategories}</p>}
          {!isLoadingCategories && !errorCategories && categories.length === 0 && (
            <p className="text-sm text-gray-500">No categories found. Add one using the "Add/Edit Category" button above.</p>
          )}
          {!isLoadingCategories && !errorCategories && categories.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categories.map(category => (
                    <tr key={category.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{category.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-md" title={category.description || ''}>
                        {category.description || <span className="italic text-gray-400">No description</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleOpenEditCategoryForm(category)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="Edit Category"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteCategoryConfirm(category)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Delete Category"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="my-4">
        <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Category:</label>
        <select
          id="category-filter"
          value={activeCategoryId === null ? '' : activeCategoryId}
          onChange={handleCategoryFilterChange}
          className="block w-full sm:w-1/3 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
          disabled={isLoadingCategories}
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        {isLoadingCategories && <LoadingState type="general" count={1} message="Loading filter options..." />}
        {errorCategories && <p className="text-sm text-red-500 mt-1">{errorCategories}</p>}
      </div>

      {/* DataTable for Misc Files */}
      {errorFiles && miscFiles.length === 0 && !isLoadingFiles ? (
        <ErrorState message={errorFiles} onRetry={loadMiscFiles} />
      ) : (
        <>
          {errorFiles && <div className="p-3 my-2 bg-red-100 text-red-700 rounded text-sm">{errorFiles}</div>}
          <DataTable
            columns={columns}
            data={miscFiles} // DataTable expects the raw data
            isLoading={isLoadingFiles}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            totalItems={totalMiscFiles}
            sortColumn={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </>
      )}

      {showDeleteCategoryConfirm && categoryToDelete && (
        <ConfirmationModal
          isOpen={showDeleteCategoryConfirm}
          title="Delete Category"
          message={ deleteCategoryError ? <span className="text-red-600">{deleteCategoryError}</span> : `Are you sure you want to delete the category "${categoryToDelete.name}"? This action cannot be undone.`}
          onConfirm={handleDeleteCategoryConfirm}
          onCancel={handleCloseDeleteCategoryConfirm}
          isConfirming={isDeletingCategory}
          confirmButtonText={deleteCategoryError && deleteCategoryError.includes("Cannot delete category") ? "Close" : "Delete"}
          confirmButtonVariant="danger"
        />
      )}

      {showDeleteFileConfirm && fileToDelete && (
        <ConfirmationModal
          isOpen={showDeleteFileConfirm}
          title="Delete File"
          message={deleteFileError ? <span className="text-red-600">{deleteFileError}</span> : `Are you sure you want to delete the file "${fileToDelete.user_provided_title || fileToDelete.original_filename}"?`}
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