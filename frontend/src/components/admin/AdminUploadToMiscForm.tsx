// src/components/admin/AdminUploadToMiscForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import {showErrorToast, showWarningToast } from '../../utils/toastUtils'; // Standardized toast
import { useAuth } from '../../context/AuthContext';
import {
  // uploadAdminMiscFile, // Not used directly
  editAdminMiscFile,
  fetchMiscCategories,
  addAdminMiscFileWithUrl, // Ensure this is imported
  uploadFileInChunks
} from '../../services/api';
import { MiscCategory, MiscFile } from '../../types';
import { UploadCloud, FileText as FileIconLucide, X, MinusCircle, CheckCircle2, Link2 } from 'lucide-react';

interface AdminUploadToMiscFormProps {
  fileToEdit?: MiscFile | null;
  preselectedCategoryId?: number | string | null;
  onUploadSuccess?: (uploadedFile: MiscFile) => void;
  onFileUpdated?: (updatedFile: MiscFile) => void;
  onCancelEdit?: () => void;
}

// Form data interface
interface MiscUploadFormData {
  selectedCategoryId: string;
  selectedFile?: File | null | undefined;
  url?: string; // Added for URL input
  title?: string;
  description?: string;
}

// Yup validation schema
const miscUploadValidationSchema = yup.object().shape({
  selectedCategoryId: yup.string().required("Please select a misc category."),
  selectedFile: yup.mixed()
    .when(['$isEditMode', '$uploadType'], {
      is: (isEditMode: boolean, uploadType: 'file' | 'url') => !isEditMode && uploadType === 'file',
      then: schema => schema.required("File is required for upload.").test('filePresent', "File is required.", value => !!value),
      otherwise: schema => schema.nullable(),
    }),
  url: yup.string().url("Must be a valid URL (e.g., http://example.com)")
    .when(['$isEditMode', '$uploadType'], {
      is: (isEditMode: boolean, uploadType: 'file' | 'url') => uploadType === 'url' && !isEditMode, 
      then: schema => schema, // Modified message
      otherwise: schema => schema.optional().nullable(),
    }),
  title: yup.string()
    .transform(value => value === '' ? undefined : value)
    .when('$uploadType', {
      is: 'url',
      then: schema => schema.required("Item Title is required for URL entries.").max(255, "Title cannot exceed 255 characters."),
      otherwise: schema => schema.optional().max(255, "Title cannot exceed 255 characters.").nullable(),
    }),
  description: yup.string().transform(value => value === '' ? undefined : value).optional().max(1000, "Description cannot exceed 1000 characters.").nullable(),
});


const AdminUploadToMiscForm: React.FC<AdminUploadToMiscFormProps> = ({
  fileToEdit,
  preselectedCategoryId,
  onUploadSuccess,
  onFileUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!fileToEdit;
  const [uploadType, setUploadType] = useState<'file' | 'url'>(isEditMode && fileToEdit?.is_external_link ? 'url' : 'file');

  const { register, handleSubmit, formState: { errors }, watch, setValue, reset, trigger } = useForm<MiscUploadFormData>({
    resolver: yupResolver(miscUploadValidationSchema),
    context: { 
        isEditMode: isEditMode,
        uploadType: uploadType, // Pass uploadType to context
    },
    defaultValues: {
      selectedCategoryId: preselectedCategoryId?.toString() || '',
      title: '',
      description: '',
      selectedFile: null,
      url: '',
    }
  });
  
  const [miscCategories, setMiscCategories] = useState<MiscCategory[]>([]);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null); // Added for existing URL display

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, user } = useAuth();
  const role = user?.role; 
  const watchedSelectedFile = watch('selectedFile');
  const watchedUrl = watch('url'); // Watch URL field
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isUploading) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isUploading) {
        showWarningToast('Changing tabs or minimizing the window might interrupt the upload process.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isUploading]);

  useEffect(() => {
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingCategories(true);
      fetchMiscCategories()
        .then(setMiscCategories)
        .catch(() => showErrorToast('Failed to load misc categories.'))
        .finally(() => setIsFetchingCategories(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (isEditMode && fileToEdit) {
      const currentUploadType = fileToEdit.is_external_link && fileToEdit.url ? 'url' : 'file';
      setUploadType(currentUploadType);
      reset({
        selectedCategoryId: fileToEdit.misc_category_id.toString(),
        title: fileToEdit.user_provided_title || '',
        description: fileToEdit.user_provided_description || '',
        selectedFile: null,
        url: currentUploadType === 'url' ? (fileToEdit.url ?? '') : '', // Ensure undefined becomes empty string for reset
      });
      // Explicitly handle undefined for state setters that expect string | null
      setExistingFileName(currentUploadType === 'file' ? (fileToEdit.original_filename ?? null) : null);
      setExistingUrl(currentUploadType === 'url' ? (fileToEdit.url ?? null) : null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      reset({
        selectedCategoryId: preselectedCategoryId?.toString() || (miscCategories.length > 0 ? miscCategories[0].id.toString() : ''),
        title: '',
        description: '',
        selectedFile: null,
        url: '',
      });
      setUploadType('file'); // Default for new
      setExistingFileName(null);
      setExistingUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isEditMode, fileToEdit, preselectedCategoryId, reset, miscCategories]);

  // Re-validate when uploadType changes
  useEffect(() => {
    trigger(); // Trigger validation for all fields based on new context
  }, [uploadType, trigger]);

  const handleUploadTypeChange = (newType: 'file' | 'url') => {
    setUploadType(newType);
    if (newType === 'url') {
      setValue('selectedFile', null); // Clear file if switching to URL
      if (fileInputRef.current) fileInputRef.current.value = "";
      setExistingFileName(null); // Clear displayed existing file name
    } else {
      setValue('url', ''); // Clear URL if switching to file
      setExistingUrl(null); // Clear displayed existing URL
    }
    // Trigger validation after state update and value changes
    setTimeout(() => trigger(), 0);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setValue('selectedFile', event.target.files[0], { shouldValidate: true, shouldDirty: true });
      setValue('url', '', { shouldDirty: true }); // Clear URL if file is chosen
      setExistingFileName(null); // No longer showing existing file name if new one is staged
      setExistingUrl(null);
    } else {
      setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    }
  };
  
  const handleUrlInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue('url', event.target.value, { shouldValidate: true, shouldDirty: true });
      setValue('selectedFile', null, { shouldDirty: true }); // Clear file if URL is being typed
      if (fileInputRef.current) fileInputRef.current.value = "";
      setExistingFileName(null);
      setExistingUrl(null);
  };

  const clearFileSelection = () => {
    setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isEditMode && fileToEdit && !fileToEdit.is_external_link) {
      setExistingFileName(fileToEdit.original_filename); // Restore display of current file if editing
    }
  };
  
  const clearUrlInput = () => {
    setValue('url', '', { shouldValidate: true, shouldDirty: true });
    if (isEditMode && fileToEdit && fileToEdit.is_external_link) {
        setExistingUrl(fileToEdit.url); // Restore display of current URL if editing
    }
  };

  const onSubmit: SubmitHandler<MiscUploadFormData> = async (data) => {
    if (!isAuthenticated || !role || !['admin', 'super_admin'].includes(role)) {
      showErrorToast('Not authorized.');
      return;
    }

    // Additional validation based on uploadType
    if (uploadType === 'file' && !data.selectedFile && !isEditMode) {
      showErrorToast('Please select a file for new uploads.');
      return;
    }
    if (uploadType === 'file' && !data.selectedFile && isEditMode && !fileToEdit?.stored_filename && !fileToEdit?.is_external_link) {
      // If editing, and it was a file, and user clears selection, it implies metadata update or error.
      // If it's intended to be a file and user clears it, it's an issue unless switching to URL.
      // This case is tricky: if it's a file, and user clears it, it should only be a metadata update.
      // The backend `editAdminMiscFile` handles formData: if `file` is not present, it doesn't replace.
    }
    if (uploadType === 'url' && (!data.url || !data.url.trim())) {
      showErrorToast('Please enter a valid URL.');
      return;
    }
    
    setIsLoading(true);
    if (uploadType === 'file' && data.selectedFile) {
      setIsUploading(true);
    }
    setUploadProgress(0);

    try {
      let resultFile: MiscFile;

      if (isEditMode && fileToEdit) { // Editing existing item
        const formDataPayload = new FormData();
        formDataPayload.append('misc_category_id', data.selectedCategoryId);
        formDataPayload.append('user_provided_title', data.title?.trim() || '');
        formDataPayload.append('user_provided_description', data.description?.trim() || '');

        if (uploadType === 'file' && data.selectedFile) {
          formDataPayload.append('file', data.selectedFile);
          formDataPayload.append('url', ''); // Ensure URL is cleared if submitting a file
        } else if (uploadType === 'url' && data.url) {
          formDataPayload.append('url', data.url.trim());
          // No 'file' part if submitting a URL
        }
        // If neither data.selectedFile nor data.url is provided for an edit,
        // it's a metadata-only update. The backend handles this.

        resultFile = await editAdminMiscFile(fileToEdit.id, formDataPayload);
        if (onFileUpdated) onFileUpdated(resultFile);

      } else { // Adding new item
        if (uploadType === 'file' && data.selectedFile) {
          const metadata = {
            misc_category_id: data.selectedCategoryId,
            user_provided_title: data.title?.trim() || '',
            user_provided_description: data.description?.trim() || '',
          };
          resultFile = await uploadFileInChunks(data.selectedFile, 'misc_file', metadata, setUploadProgress);
          if (onUploadSuccess) onUploadSuccess(resultFile);
        } else if (uploadType === 'url' && data.url) {
          const payload = {
            misc_category_id: parseInt(data.selectedCategoryId),
            user_provided_title: data.title?.trim(),
            url: data.url.trim(),
            user_provided_description: data.description?.trim(),
          };
          resultFile = await addAdminMiscFileWithUrl(payload);
          if (onUploadSuccess) onUploadSuccess(resultFile);
        } else {
          // Should be caught by earlier validation
          throw new Error("Invalid state for submission.");
        }
      }
      
      // Reset form after successful submission only if NOT in edit mode
      if (!isEditMode) {
        reset({
            selectedCategoryId: preselectedCategoryId?.toString() || (miscCategories.length > 0 ? miscCategories[0].id.toString() : ''),
            title: '',
            description: '',
            selectedFile: null,
            url: '',
        });
        setUploadType('file'); // Reset to default upload type
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      setUploadProgress(0); // Reset progress

    } catch (err: any) {
      const backendMessage = err.response?.data?.msg || err.message;
      let userMessage = "File operation failed.";

      if (backendMessage && typeof backendMessage === 'string' && backendMessage.includes("UNIQUE constraint failed")) {
        userMessage = "A file with this title or name already exists in this category. Please use a different title or check for duplicates.";
      } else if (backendMessage) {
        userMessage = backendMessage;
      }
      showErrorToast(userMessage);
      if (uploadType === 'file' && data.selectedFile) setIsUploading(false);
    } finally {
      setIsLoading(false);
      if (uploadType === 'file' && data.selectedFile) setIsUploading(false);
    }
  };
  
  const onFormError = (formErrors: FieldErrors<MiscUploadFormData>) => {
    console.error("Form validation errors:", formErrors);
    // Consolidate error messages for toast
    let errorMessages = "Please correct the highlighted errors: ";
    const messages: string[] = [];
    if (formErrors.selectedCategoryId) messages.push(formErrors.selectedCategoryId.message || "Category error");
    if (uploadType === 'file' && formErrors.selectedFile) messages.push(formErrors.selectedFile.message || "File error");
    if (uploadType === 'url' && formErrors.url) messages.push(formErrors.url.message || "URL error");
    if (formErrors.title) messages.push(formErrors.title.message || "Title error");
    if (formErrors.description) messages.push(formErrors.description.message || "Description error");
    
    showErrorToast(errorMessages + messages.join('; '));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isLoading) {
        setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (isLoading) return;

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const droppedFile = event.dataTransfer.files[0];
      setValue('selectedFile', droppedFile, { shouldValidate: true, shouldDirty: true });
      if (isEditMode) setExistingFileName(null); // Clear existing file name display if editing
      if (fileInputRef.current) {
        fileInputRef.current.files = event.dataTransfer.files;
      }
      // showSuccessToast(`File "${droppedFile.name}" selected by drop.`); // Optional toast
    } else {
      // showWarningToast("No file was dropped or file could not be accessed."); // Optional toast
    }
  };
  
  if (!isAuthenticated || !role || !['admin', 'super_admin'].includes(role)) {
      return null;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-lg border border-gray-200">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {isEditMode ? 'Edit Miscellaneous Item' : 'Add New Miscellaneous Item'}
        </h3>
        {isEditMode && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <MinusCircle size={18} className="mr-2" />
            Cancel Edit
          </button>
        )}
      </div>

      <div>
        <label htmlFor="selectedCategoryId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Misc Category*</label>
        {isFetchingCategories ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading categories...</p> : (
          <select
            id="selectedCategoryId"
            {...register("selectedCategoryId")}
            disabled={isLoading || miscCategories.length === 0}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedCategoryId ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600`}
          >
            <option value="" disabled>Select a category</option>
            {miscCategories.map(cat => (
              <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
            ))}
          </select>
        )}
        {errors.selectedCategoryId && <p className="mt-1 text-sm text-red-600">{errors.selectedCategoryId.message}</p>}
      </div>

      {/* Upload Type Selection - Standardized Labels */}
      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item Source:</span>
        <div className="flex items-center space-x-4">
          {(['file', 'url'] as const).map((type) => (
            <label key={type} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                {...register("uploadType" as any)} // RHF doesn't directly manage this state, but good for consistency if needed
                value={type}
                checked={uploadType === type}
                onChange={() => handleUploadTypeChange(type)}
                className="form-radio h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-500"
                disabled={isLoading}
              />
              <span className="flex items-center dark:text-gray-300">
                {type === 'file' ? 
                  <><UploadCloud size={16} className="mr-1 text-gray-600 dark:text-gray-400" /> Upload File</> : 
                  <><Link2 size={16} className="mr-1 text-gray-600 dark:text-gray-400" /> Provide External Link</>
                }
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Conditional File Upload Input */}
      {uploadType === 'file' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {isEditMode && fileToEdit && !fileToEdit.is_external_link ? 'Replace File (Optional)' : 'Select File*'}
          </label>
          <div
            className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md dark:border-gray-600 ${isDraggingOver ? 'border-blue-500 bg-blue-50 dark:bg-gray-700' : 'hover:border-blue-500 dark:hover:border-blue-400'} transition-colors`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="space-y-1 text-center">
              <UploadCloud className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <div className="flex text-sm text-gray-600 dark:text-gray-400">
                <label htmlFor="selectedFile" className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 focus-within:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  <span>{watchedSelectedFile ? 'Change file' : 'Upload a file'}</span>
                  <input 
                      id="selectedFile"
                      name="selectedFile-input"
                      type="file" 
                      className="sr-only"
                      onChange={handleFileChange}
                      ref={fileInputRef} 
                      disabled={isLoading} 
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Any allowed file type.</p>
            </div>
          </div>
          {(watchedSelectedFile || (isEditMode && existingFileName)) && (
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
              <div className='flex items-center space-x-2 overflow-hidden'>
                {watchedSelectedFile ? (
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                ) : (
                  <FileIconLucide size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                )}
                 <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                   {watchedSelectedFile ? (watchedSelectedFile as File).name : existingFileName}
                 </span>
                 {isEditMode && existingFileName && !watchedSelectedFile && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(current file)</span>}
              </div>
              {watchedSelectedFile && (
                  <button type="button" onClick={clearFileSelection} disabled={isLoading} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-600">
                      <X size={16} />
                  </button>
              )}
            </div>
          )}
          {errors.selectedFile && <p className="mt-1 text-sm text-red-600">{errors.selectedFile.message}</p>}
        </div>
      )}

      {/* Conditional URL Input */}
      {uploadType === 'url' && (
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            External Link URL*
          </label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="text"
              id="url"
              {...register("url")}
              placeholder="e.g., https://example.com/resource"
              disabled={isLoading}
              onChange={handleUrlInputChange}
              className={`block w-full pr-10 sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.url ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
            />
            {(watchedUrl || (isEditMode && existingUrl)) && (
                 <button 
                    type="button" 
                    onClick={clearUrlInput} 
                    disabled={isLoading} 
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    aria-label="Clear URL"
                >
                    <X size={16} />
                </button>
            )}
          </div>
          {isEditMode && existingUrl && !watchedUrl && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Current URL: {existingUrl}</p>}
          {errors.url && <p className="mt-1 text-sm text-red-600">{errors.url.message}</p>}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Item Title
        </label>
        <input 
            type="text" 
            id="title" 
            {...register("title")}
            placeholder={isEditMode && fileToEdit ? (fileToEdit.original_filename || fileToEdit.url || undefined) : (uploadType === 'file' ? "Defaults to filename if blank" : "For URL entries, this is required")}
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.title ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Item Description (Optional)
        </label>
        <textarea 
            id="description" 
            rows={3} 
            {...register("description")}
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.description ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
      </div>

      <div className="flex space-x-3">
        <button type="submit" 
                disabled={isLoading || isFetchingCategories || (!isEditMode && ((uploadType === 'file' && !watchedSelectedFile) || (uploadType === 'url' && !watchedUrl))) || !watch('selectedCategoryId')}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
          {/* Standardized button text */}
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Item' : 'Add Item')}
        </button>
      </div>

      {/* Upload Progress Bar */}
      {isLoading && uploadType === 'file' && watchedSelectedFile && uploadProgress > 0 && (
        <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700 my-3 relative">
          <div
            className="bg-blue-600 h-4 rounded-full transition-all duration-150 ease-out"
            style={{ width: `${uploadProgress}%` }}
          ></div>
          <p className="absolute inset-0 text-center text-xs font-medium leading-4 text-white dark:text-gray-100">
            {Math.round(uploadProgress)}%
          </p>
        </div>
      )}
    </form>
  );
};

export default AdminUploadToMiscForm;