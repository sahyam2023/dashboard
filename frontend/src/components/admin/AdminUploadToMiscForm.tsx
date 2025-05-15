// src/components/admin/AdminUploadToMiscForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext'; // Adjust path
import { uploadAdminMiscFile, fetchMiscCategories } from '../../services/api'; // Adjust path
import { MiscCategory, MiscFile } from '../../types'; // Adjust path
import { UploadCloud, File as FileIcon, X } from 'lucide-react';

interface AdminUploadToMiscFormProps {
  // Optional: If form is tied to a pre-selected category
  preselectedCategoryId?: number | string | null;
  onUploadSuccess?: (uploadedFile: MiscFile) => void;
}

const AdminUploadToMiscForm: React.FC<AdminUploadToMiscFormProps> = ({
  preselectedCategoryId,
  onUploadSuccess,
}) => {
  const [miscCategories, setMiscCategories] = useState<MiscCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    preselectedCategoryId ? preselectedCategoryId.toString() : ''
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (isAuthenticated && role === 'admin' && !preselectedCategoryId) { // Fetch categories if not preselected
      setIsFetchingCategories(true);
      fetchMiscCategories()
        .then(setMiscCategories)
        .catch(() => setError('Failed to load misc categories for selection.'))
        .finally(() => setIsFetchingCategories(false));
    } else if (preselectedCategoryId) {
      // If category is preselected, no need to fetch all for a dropdown
      setSelectedCategoryId(preselectedCategoryId.toString());
    }
  }, [isAuthenticated, role, preselectedCategoryId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) { setError('Please select a file.'); return; }
    if (!selectedCategoryId) { setError('Please select a misc category.'); return; }
    if (!isAuthenticated) { setError('You must be logged in.'); return; }
    if (role !== 'admin') { setError('Only admins can upload misc files.'); return; }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('misc_category_id', selectedCategoryId);
    formData.append('user_provided_title', title || selectedFile.name);
    formData.append('user_provided_description', description);

    try {
      const uploadedFile = await uploadAdminMiscFile(formData);
      setSuccessMessage(`File "${uploadedFile.original_filename}" uploaded successfully to category!`);
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      // If category wasn't preselected, maybe clear selection or keep it for next upload
      // if (!preselectedCategoryId) setSelectedCategoryId(''); 
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onUploadSuccess) onUploadSuccess(uploadedFile);
    } catch (err: any) {
      setError(err.message || 'File upload failed.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // If used as a general form, but user is not admin, show nothing or a message
  if (!isAuthenticated || role !== 'admin') {
      return null; // Or a <p>Not authorized</p> message
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800">Upload File to Misc Category</h3>
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      {/* Category Selection Dropdown (if not preselected) */}
      {!preselectedCategoryId && (
        <div>
          <label htmlFor="miscCategory" className="block text-sm font-medium text-gray-700">Misc Category*</label>
          {isFetchingCategories ? <p className="text-sm text-gray-500">Loading categories...</p> : (
            <select
              id="miscCategory"
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
      )}

      {/* File Input Area (similar to the one you had) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Select File*</label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          {/* ... (dropzone UI from your FileUploadForm) ... */}
          <div className="space-y-1 text-center">
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor="misc-file-upload" className="relative cursor-pointer ...">
                <span>Upload a file</span>
                <input id="misc-file-upload" name="file" type="file" className="sr-only"
                       onChange={handleFileChange} ref={fileInputRef} required disabled={isLoading} />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">Allowed types...</p>
          </div>
        </div>
        {selectedFile && (
          <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 ...">
            <div className='flex items-center space-x-2 overflow-hidden'>
               <FileIcon size={18} className="text-gray-500 flex-shrink-0" />
               <span className="text-sm text-gray-700 truncate">{selectedFile.name}</span>
            </div>
            <button type="button" onClick={clearFileSelection} disabled={isLoading}><X size={16} /></button>
          </div>
        )}
      </div>

      {/* Title Input */}
      <div>
        <label htmlFor="misc-file-title" className="block text-sm font-medium text-gray-700">File Title (Optional)</label>
        <input type="text" id="misc-file-title" value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="Defaults to filename" disabled={isLoading}
               className="mt-1 block w-full ..."/>
      </div>

      {/* Description Input */}
      <div>
        <label htmlFor="misc-file-description" className="block text-sm font-medium text-gray-700">File Description (Optional)</label>
        <textarea id="misc-file-description" rows={3} value={description}
                  onChange={(e) => setDescription(e.target.value)} disabled={isLoading}
                  className="mt-1 block w-full ..."/>
      </div>

      <button type="submit" disabled={isLoading || !selectedFile || !selectedCategoryId}
              className="w-full inline-flex justify-center py-2 px-4 ... disabled:opacity-50">
        {isLoading ? 'Uploading...' : 'Upload to Misc'}
      </button>
    </form>
  );
};

export default AdminUploadToMiscForm;