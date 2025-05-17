// src/components/admin/AdminUploadToMiscForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  uploadAdminMiscFile,
  editAdminMiscFile, // NEW: Import edit function
  fetchMiscCategories
} from '../../services/api';
import { MiscCategory, MiscFile } from '../../types';
import { UploadCloud, FileText as FileIconLucide, X } from 'lucide-react'; // Using FileText

interface AdminUploadToMiscFormProps {
  fileToEdit?: MiscFile | null; // NEW: For edit mode
  preselectedCategoryId?: number | string | null; // For add mode, to preselect category
  onUploadSuccess?: (uploadedFile: MiscFile) => void; // For add mode success
  onFileUpdated?: (updatedFile: MiscFile) => void; // NEW: For edit mode success
  onCancelEdit?: () => void; // NEW: To cancel edit mode
}

const AdminUploadToMiscForm: React.FC<AdminUploadToMiscFormProps> = ({
  fileToEdit,
  preselectedCategoryId,
  onUploadSuccess,
  onFileUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!fileToEdit;

  const [miscCategories, setMiscCategories] = useState<MiscCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // For new/replacement file
  const [existingFileName, setExistingFileName] = useState<string | null>(null); // Display current file in edit mode
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();

  // Fetch categories for the dropdown
  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingCategories(true);
      fetchMiscCategories()
        .then(setMiscCategories)
        .catch(() => setError('Failed to load misc categories.'))
        .finally(() => setIsFetchingCategories(false));
    }
  }, [isAuthenticated, role]);

  // Pre-fill form for edit mode or set preselected category for add mode
  useEffect(() => {
    setError(null); setSuccessMessage(null); // Clear messages when mode changes
    if (isEditMode && fileToEdit) {
      setSelectedCategoryId(fileToEdit.misc_category_id.toString());
      setTitle(fileToEdit.user_provided_title || '');
      setDescription(fileToEdit.user_provided_description || '');
      setExistingFileName(fileToEdit.original_filename);
      setSelectedFile(null); // User must re-select to replace file
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      // Add mode: use preselectedCategoryId if provided
      setSelectedCategoryId(preselectedCategoryId ? preselectedCategoryId.toString() : '');
      setTitle('');
      setDescription('');
      setExistingFileName(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isEditMode, fileToEdit, preselectedCategoryId]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      if (isEditMode) setExistingFileName(null); // If new file chosen, don't show old name
      setError(null); setSuccessMessage(null);
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // If editing and there was an existing file, re-show its name
    if (isEditMode && fileToEdit) {
      setExistingFileName(fileToEdit.original_filename);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCategoryId) { setError('Please select a misc category.'); return; }
    // File is mandatory for ADD mode, optional for EDIT mode (if only changing metadata)
    if (!isEditMode && !selectedFile) { setError('Please select a file to upload.'); return; }
    
    // Title defaults to filename if empty during ADD, but for EDIT, user might want to clear it
    // const finalTitle = (title.trim() || (selectedFile ? selectedFile.name : (isEditMode && fileToEdit ? fileToEdit.original_filename : '')));
    // Let backend handle title defaulting if not provided, or ensure frontend sends one.
    // For now, if title is empty, we send empty. `user_provided_title` is nullable.

    if (!isAuthenticated || role !== 'admin') { setError('Not authorized.'); return; }

    setIsLoading(true); setError(null); setSuccessMessage(null);

    const formData = new FormData();
    formData.append('misc_category_id', selectedCategoryId);
    formData.append('user_provided_title', title.trim()); // Send empty string if title is empty
    formData.append('user_provided_description', description.trim());

    if (selectedFile) { // Only append 'file' if a new one is chosen (for add or replace)
      formData.append('file', selectedFile);
    }

    try {
      let resultFile: MiscFile;
      if (isEditMode && fileToEdit) {
        resultFile = await editAdminMiscFile(fileToEdit.id, formData);
        setSuccessMessage(`File "${resultFile.user_provided_title || resultFile.original_filename}" updated successfully!`);
        if (onFileUpdated) onFileUpdated(resultFile);
        // Optionally keep form open with updated data or call onCancelEdit
      } else { // Add mode
        if (!selectedFile) { // Should have been caught by validation, but safeguard
             setError("A file is required for new uploads."); setIsLoading(false); return;
        }
        resultFile = await uploadAdminMiscFile(formData);
        setSuccessMessage(`File "${resultFile.original_filename}" uploaded successfully!`);
        // Reset form fields for add mode
        setTitle('');
        setDescription('');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        // Keep category selected if not preselected, or clear if desired
        // if (!preselectedCategoryId) setSelectedCategoryId(''); 
        if (onUploadSuccess) onUploadSuccess(resultFile);
      }
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || `File operation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isAuthenticated || role !== 'admin') {
      return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-800">
          {isEditMode ? 'Edit Miscellaneous File' : 'Upload File to Misc Category'}
        </h3>
        {isEditMode && onCancelEdit && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800">
            Cancel Edit
          </button>
        )}
      </div>
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      {/* Category Selection Dropdown (Always show, preselect if editing or preselectedCategoryId) */}
      <div>
        <label htmlFor="miscFileCategory" className="block text-sm font-medium text-gray-700">Misc Category*</label>
        {isFetchingCategories ? <p className="text-sm text-gray-500">Loading categories...</p> : (
          <select
            id="miscFileCategory"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            required
            disabled={isLoading || miscCategories.length === 0}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="" disabled>Select a category</option>
            {miscCategories.map(cat => (
              <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* File Input Area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {isEditMode ? 'Replace File (Optional)' : 'Select File*'}
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor="misc-file-upload-input" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                <span>{selectedFile ? 'Change file' : 'Upload a file'}</span>
                <input id="misc-file-upload-input" name="file" type="file" className="sr-only"
                       onChange={handleFileChange} ref={fileInputRef} 
                       required={!isEditMode} // Required only for add mode
                       disabled={isLoading} />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">Any allowed file type.</p>
          </div>
        </div>
        {(selectedFile || (isEditMode && existingFileName)) && (
          <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
            <div className='flex items-center space-x-2 overflow-hidden'>
               <FileIconLucide size={18} className="text-gray-500 flex-shrink-0" />
               <span className="text-sm text-gray-700 truncate">
                 {selectedFile ? selectedFile.name : existingFileName}
               </span>
               {isEditMode && existingFileName && !selectedFile && <span className="text-xs text-gray-500 ml-2">(current file)</span>}
            </div>
            {selectedFile && (
                <button type="button" onClick={clearFileSelection} disabled={isLoading} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                    <X size={16} />
                </button>
            )}
          </div>
        )}
      </div>

      {/* Title Input */}
      <div>
        <label htmlFor="misc-file-title" className="block text-sm font-medium text-gray-700">File Title (Optional)</label>
        <input type="text" id="misc-file-title" value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder={isEditMode && fileToEdit ? fileToEdit.original_filename : "Defaults to filename if blank"}
               disabled={isLoading}
               className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      {/* Description Input */}
      <div>
        <label htmlFor="misc-file-description" className="block text-sm font-medium text-gray-700">File Description (Optional)</label>
        <textarea id="misc-file-description" rows={3} value={description}
                  onChange={(e) => setDescription(e.target.value)} disabled={isLoading}
                  className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      <div className="flex space-x-3">
        <button type="submit" 
                disabled={isLoading || (!isEditMode && !selectedFile) || !selectedCategoryId}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
          {isLoading ? (isEditMode ? 'Updating...' : 'Uploading...') : (isEditMode ? 'Update File Details' : 'Upload to Misc')}
        </button>
        {isEditMode && onCancelEdit && (
            <button type="button" onClick={onCancelEdit} disabled={isLoading}
                    className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                Cancel
            </button>
        )}
      </div>
    </form>
  );
};

export default AdminUploadToMiscForm;