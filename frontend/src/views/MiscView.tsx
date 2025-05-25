// src/views/MiscView.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMiscCategories,
  fetchMiscFiles,
  deleteAdminMiscCategory,
  deleteAdminMiscFile,
  PaginatedMiscFilesResponse,
  addFavoriteApi,
  removeFavoriteApi,
  FavoriteItemType
} from '../services/api';
import { MiscCategory, MiscFile } from '../types';
import DataTable, { ColumnDef } from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import AdminUploadToMiscForm from '../components/admin/AdminUploadToMiscForm';
import AdminMiscCategoryForm from '../components/admin/AdminMiscCategoryForm';
import ConfirmationModal from '../components/shared/ConfirmationModal';
import { Download, FileText, CalendarDays, PlusCircle, Edit3, Trash2, Star, Filter, ChevronUp, Archive as ArchiveIcon } from 'lucide-react'; // Added Filter, ChevronUp, ArchiveIcon
import { Box, Typography } from '@mui/material'; // Added Box and Typography
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; 

const API_BASE_URL = 'http://127.0.0.1:5000';

const MiscView: React.FC = () => {
  const { isAuthenticated, role } = useAuth();

  const [categories, setCategories] = useState<MiscCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errorCategories, setErrorCategories] = useState<string | null>(null);
  
  const [miscFiles, setMiscFiles] = useState<MiscFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [errorFiles, setErrorFiles] = useState<string | null>(null);
  const [isInitialFilesLoad, setIsInitialFilesLoad] = useState(true);
  
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalMiscFiles, setTotalMiscFiles] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string>('user_provided_title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MiscCategory | null>(null);
  const [showGeneralUploadForm, setShowGeneralUploadForm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<MiscCategory | null>(null);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<MiscFile | null>(null);
  const [showDeleteFileConfirm, setShowDeleteFileConfirm] = useState(false);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [favoritedItems, setFavoritedItems] = useState<Map<number, { favoriteId: number | undefined }>>(new Map());
  const [showCategoryFilter, setShowCategoryFilter] = useState(false); // State for category filter toggle, default to false

  const loadMiscCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setErrorCategories(null);
    try {
      const data = await fetchMiscCategories();
      setCategories(data);
    } catch (err: any) {
      setCategories([]);
      const catErrorMessage = err.response?.data?.msg || err.message || 'Failed to load misc categories.';
      setErrorCategories(catErrorMessage); 
      showErrorToast(catErrorMessage); 
      console.error("Error loading misc categories:", err);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => { loadMiscCategories(); }, [loadMiscCategories]);

  const loadMiscFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    if (isInitialFilesLoad) { setErrorFiles(null); }

    try {
      const response: PaginatedMiscFilesResponse = await fetchMiscFiles(
        activeCategoryId || undefined, currentPage, itemsPerPage, sortBy, sortOrder
      );
      setMiscFiles(response.misc_files);
      setTotalPages(response.total_pages);
      setTotalMiscFiles(response.total_misc_files);
      setCurrentPage(response.page);
      setItemsPerPage(response.per_page);

      const newFavoritedItems = new Map<number, { favoriteId: number | undefined }>();
      if (isAuthenticated && response.misc_files && response.misc_files.length > 0) {
        for (const file of response.misc_files) {
          if (file.favorite_id) { newFavoritedItems.set(file.id, { favoriteId: file.favorite_id }); } 
          else { newFavoritedItems.set(file.id, { favoriteId: undefined }); }
        }
      }
      setFavoritedItems(newFavoritedItems);

      if (isInitialFilesLoad) { setIsInitialFilesLoad(false); }
    } catch (err: any) {
      console.error("Failed to load miscellaneous files:", err);
      const filesErrorMessage = err.response?.data?.msg || err.message || 'Failed to fetch miscellaneous files.';
      if (isInitialFilesLoad) {
        setErrorFiles(filesErrorMessage); setMiscFiles([]); setTotalPages(0); setTotalMiscFiles(0); setFavoritedItems(new Map());
      } else {
        showErrorToast(filesErrorMessage); 
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, [
    activeCategoryId, currentPage, itemsPerPage, sortBy, sortOrder, 
    isAuthenticated, isInitialFilesLoad
  ]);

  useEffect(() => { loadMiscFiles(); }, [loadMiscFiles]);
  useEffect(() => { if (!isAuthenticated) { setFavoritedItems(new Map()); } }, [isAuthenticated]);

  const handleCategoryFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const categoryId = event.target.value ? parseInt(event.target.value, 10) : null;
    setActiveCategoryId(categoryId); setCurrentPage(1); setIsInitialFilesLoad(true); 
  };

  const handlePageChange = (newPage: number) => { setCurrentPage(newPage); };
  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) { setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc')); } 
    else { setSortBy(columnKey); setSortOrder('asc'); }
    setCurrentPage(1); setIsInitialFilesLoad(true); // Re-fetch on sort with initial load true
  };

  const handleMiscFileUploadSuccess = (uploadedFile: MiscFile) => {
    setShowGeneralUploadForm(false);
    showSuccessToast(`File "${uploadedFile.user_provided_title || uploadedFile.original_filename}" uploaded successfully.`);
    if (activeCategoryId === null || activeCategoryId === uploadedFile.misc_category_id) {
      loadMiscFiles();
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try { return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } 
    catch (e) { return "Invalid Date"; }
  };
  
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || typeof bytes === 'undefined') return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleOpenAddCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(true); setFeedbackMessage(null); };
  const handleOpenEditCategoryForm = (category: MiscCategory) => { setEditingCategory(category); setShowCategoryForm(true); setFeedbackMessage(null);};
  const handleCloseCategoryForm = () => { setEditingCategory(null); setShowCategoryForm(false); };
  const handleCategoryOperationSuccess = (message: string) => {
    setShowCategoryForm(false); setEditingCategory(null); showSuccessToast(message); loadMiscCategories(); 
  };
  const handleOpenDeleteCategoryConfirm = (category: MiscCategory) => { setCategoryToDelete(category); setShowDeleteCategoryConfirm(true); setFeedbackMessage(null); };
  const handleCloseDeleteCategoryConfirm = () => { setCategoryToDelete(null); setShowDeleteCategoryConfirm(false);};
  
  const handleDeleteCategoryConfirm = async () => {
    if (!categoryToDelete) return;
    setIsDeletingCategory(true);
    try {
      await deleteAdminMiscCategory(categoryToDelete.id);
      showSuccessToast(`Category "${categoryToDelete.name}" deleted successfully.`);
      handleCloseDeleteCategoryConfirm(); loadMiscCategories();
      if (activeCategoryId === categoryToDelete.id) { setActiveCategoryId(null); setIsInitialFilesLoad(true); }
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || "Failed to delete category.";
      showErrorToast(errorMsg); 
      if (!errorMsg.includes("Cannot delete category") && !errorMsg.includes("contains files")) {
        handleCloseDeleteCategoryConfirm(); 
      }
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleOpenDeleteFileConfirm = (file: MiscFile) => { setFileToDelete(file); setShowDeleteFileConfirm(true); setFeedbackMessage(null);};
  const handleCloseDeleteFileConfirm = () => { setFileToDelete(null); setShowDeleteFileConfirm(false);};
  
  const handleDeleteFileConfirm = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      await deleteAdminMiscFile(fileToDelete.id);
      showSuccessToast(`File "${fileToDelete.user_provided_title || fileToDelete.original_filename}" deleted successfully.`);
      handleCloseDeleteFileConfirm();
      if (miscFiles.length === 1 && currentPage > 1) { setCurrentPage(currentPage - 1); } 
      else { loadMiscFiles(); }
    } catch (err: any) {
      showErrorToast(err.response?.data?.msg || err.message || "Failed to delete file.");
      handleCloseDeleteFileConfirm(); 
    } finally {
      setIsDeletingFile(false);
    }
  };

  const columns: ColumnDef<MiscFile>[] = [
    { key: 'user_provided_title', header: 'Title', sortable: true },
    { key: 'original_filename', header: 'Original Filename', sortable: true },
    { key: 'category_name', header: 'Category', sortable: true },
    { key: 'uploaded_by_username', header: 'Uploaded By', sortable: true, render: (file) => file.uploaded_by_username || 'N/A' },
    { key: 'updated_by_username', header: 'Updated By', sortable: false, render: (file) => file.updated_by_username || 'N/A' },
    { key: 'file_size', header: 'Size', sortable: true, render: (file) => formatFileSize(file.file_size) },
    { key: 'created_at', header: 'Uploaded At', sortable: true, render: (file) => formatDate(file.created_at) },
    { key: 'updated_at', header: 'Updated At', sortable: true, render: (file) => formatDate(file.updated_at) },
    { key: 'file_path', header: 'Link', render: (file) => ( <a href={`${API_BASE_URL}${file.file_path}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:text-blue-800" onClick={(e) => e.stopPropagation()}> Download <Download size={14} className="ml-1" /> </a> ) },
    ...(isAuthenticated ? [{
      key: 'actions' as keyof MiscFile | 'actions', header: 'Actions',
      render: (file: MiscFile) => (
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button onClick={(e) => { e.stopPropagation(); handleFavoriteToggle(file, 'misc_file' as FavoriteItemType);}} className={`p-1 ${favoritedItems.get(file.id)?.favoriteId ? 'text-yellow-500' : 'text-gray-400'} hover:text-yellow-600`} title={favoritedItems.get(file.id)?.favoriteId ? "Remove from Favorites" : "Add to Favorites"}> <Star size={16} className={favoritedItems.get(file.id)?.favoriteId ? "fill-current" : ""} /> </button>
          {(role === 'admin' || role === 'super_admin') && (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleOpenDeleteFileConfirm(file);}} className="p-1 text-red-600 hover:text-red-800" title="Delete File"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ),
    }] : [])
  ];

  const handleFavoriteToggle = async (item: MiscFile, itemType: FavoriteItemType) => {
    if (!isAuthenticated) { showErrorToast("Please log in to manage favorites."); return; }
    const currentStatus = favoritedItems.get(item.id);
    const isCurrentlyFavorited = !!currentStatus?.favoriteId;
    const tempFavoritedItems = new Map(favoritedItems);
    if (isCurrentlyFavorited) { tempFavoritedItems.set(item.id, { favoriteId: undefined }); } 
    else { tempFavoritedItems.set(item.id, { favoriteId: -1 }); }
    setFavoritedItems(tempFavoritedItems);

    try {
      if (isCurrentlyFavorited && typeof currentStatus?.favoriteId === 'number') {
        await removeFavoriteApi(item.id, itemType);
        showSuccessToast(`"${item.user_provided_title || item.original_filename}" removed from favorites.`);
        setFavoritedItems(prev => { const newMap = new Map(prev); newMap.set(item.id, { favoriteId: undefined }); return newMap; });
      } else {
        const newFavorite = await addFavoriteApi(item.id, itemType);
        showSuccessToast(`"${item.user_provided_title || item.original_filename}" added to favorites.`);
        setFavoritedItems(prev => { const newMap = new Map(prev); newMap.set(item.id, { favoriteId: newFavorite.id }); return newMap; });
      }
    } catch (error: any) {
      showErrorToast(error?.response?.data?.msg || error.message || "Failed to update favorite status.");
      setFavoritedItems(prev => { 
        const newMap = new Map(prev);
        if (isCurrentlyFavorited) { newMap.set(item.id, { favoriteId: currentStatus?.favoriteId });} 
        else { newMap.set(item.id, { favoriteId: undefined }); }
        return newMap;
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start sm:items-center mb-6 flex-col sm:flex-row">
        <div> <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Miscellaneous Files</h2> <p className="text-gray-600 mt-1 dark:text-gray-300">Browse and download categorized miscellaneous files.</p> </div>
         {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
            <div className="flex space-x-3 mt-4 sm:mt-0">
                 <button onClick={() => {setShowCategoryForm(prev => !prev); setEditingCategory(null); setShowGeneralUploadForm(false); setFeedbackMessage(null);}} className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                    <PlusCircle size={18} className="mr-2" /> {showCategoryForm && !editingCategory ? 'Cancel Add Category' : 'Add/Edit Category'}
                </button>
                 <button onClick={() => {setShowGeneralUploadForm(prev => !prev); setShowCategoryForm(false); setEditingCategory(null); setFeedbackMessage(null);}} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <PlusCircle size={18} className="mr-2" /> {showGeneralUploadForm ? 'Cancel Upload' : 'Upload New File'}
                </button>
            </div>
        )}
      </div>

      {feedbackMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded text-sm">{feedbackMessage}</div>}

      {showCategoryForm && isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-4 p-4 bg-gray-50 rounded-lg shadow">
          <AdminMiscCategoryForm
            categoryToEdit={editingCategory}
            onSuccess={(category: MiscCategory) => handleCategoryOperationSuccess(`Category "${category.name}" saved successfully.`)}
            onCancel={handleCloseCategoryForm}
          />
        </div>
      )}
      {showGeneralUploadForm && isAuthenticated && (role === 'admin' || role === 'super_admin') && ( <div className="my-4 p-4 bg-gray-50 rounded-lg shadow"> <AdminUploadToMiscForm onUploadSuccess={handleMiscFileUploadSuccess} /> </div> )}
      
      {isAuthenticated && (role === 'admin' || role === 'super_admin') && (
        <div className="my-8 p-4 border border-gray-200 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Manage Categories</h3>
          {isLoadingCategories && <LoadingState type="table" count={3} message="Loading categories..." />}
          {errorCategories && !isLoadingCategories && categories.length === 0 && <ErrorState message={errorCategories} onRetry={loadMiscCategories} />}
          {!isLoadingCategories && !errorCategories && categories.length === 0 && ( <p className="text-sm text-gray-500">No categories found. Add one using the "Add/Edit Category" button above.</p> )}
          {!isLoadingCategories && !errorCategories && categories.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50"><tr><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th></tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categories.map(category => (
                    <tr key={category.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{category.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-md" title={category.description || ''}>{category.description || <span className="italic text-gray-400">No description</span>}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => handleOpenEditCategoryForm(category)} className="text-blue-600 hover:text-blue-800 p-1" title="Edit Category"><Edit3 size={16} /></button>
                          <button onClick={() => handleOpenDeleteCategoryConfirm(category)} className="text-red-600 hover:text-red-800 p-1" title="Delete Category"><Trash2 size={16} /></button>
                        </div>
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
        <button
          onClick={() => setShowCategoryFilter(!showCategoryFilter)}
          className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md text-sm font-medium mb-2"
        >
          {showCategoryFilter ? ( <><ChevronUp size={18} className="mr-2" /> Hide Category Filter</> ) : ( <><Filter size={18} className="mr-2" /> Show Category Filter</> )}
        </button>
        {showCategoryFilter && (
          <>
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Category:</label>
            <select id="category-filter" value={activeCategoryId === null ? '' : activeCategoryId} onChange={handleCategoryFilterChange} className="block w-full sm:w-1/3 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm" disabled={isLoadingCategories || categories.length === 0}>
              <option value="">All Categories</option>
              {categories.map(category => ( <option key={category.id} value={category.id}>{category.name}</option> ))}
            </select>
          </>
        )}
      </div>

      {isInitialFilesLoad && isLoadingFiles ? ( <LoadingState /> ) : errorFiles && isInitialFilesLoad && miscFiles.length === 0 ? ( <ErrorState message={errorFiles} onRetry={loadMiscFiles} /> ) : !isLoadingFiles && miscFiles.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 4, p: 3 }}>
          <ArchiveIcon size={60} className="text-gray-400 dark:text-gray-500 mb-4" />
          <Typography variant="h6" color="text.secondary">
            {activeCategoryId ? "No files found in this category." : "No files found."}
          </Typography>
        </Box>
      ) : (
        <>
          <DataTable columns={columns} data={miscFiles} rowClassName="group" isLoading={isLoadingFiles && !isInitialFilesLoad} currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} itemsPerPage={itemsPerPage} totalItems={totalMiscFiles} sortColumn={sortBy} sortOrder={sortOrder} onSort={handleSort} />
        </>
      )}

      {showDeleteCategoryConfirm && categoryToDelete && ( <ConfirmationModal isOpen={showDeleteCategoryConfirm} title="Delete Category" message={`Are you sure you want to delete the category "${categoryToDelete.name}"? This action cannot be undone.`} onConfirm={handleDeleteCategoryConfirm} onCancel={handleCloseDeleteCategoryConfirm} isConfirming={isDeletingCategory} confirmButtonText={"Delete"} confirmButtonVariant="danger" /> )}
      {showDeleteFileConfirm && fileToDelete && ( <ConfirmationModal isOpen={showDeleteFileConfirm} title="Delete File" message={`Are you sure you want to delete the file "${fileToDelete.user_provided_title || fileToDelete.original_filename}"?`} onConfirm={handleDeleteFileConfirm} onCancel={handleCloseDeleteFileConfirm} isConfirming={isDeletingFile} confirmButtonText="Delete" confirmButtonVariant="danger" /> )}
    </div>
  );
};

export default MiscView;