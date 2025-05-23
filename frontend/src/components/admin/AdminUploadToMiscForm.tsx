// src/components/admin/AdminUploadToMiscForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import {
  uploadAdminMiscFile,
  editAdminMiscFile,
  fetchMiscCategories
} from '../../services/api';
import { MiscCategory, MiscFile } from '../../types';
import { UploadCloud, FileText as FileIconLucide, X } from 'lucide-react';

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
  selectedFile?: File | null | undefined; // Can be File, null (cleared), or undefined (initial)
  title?: string;
  description?: string;
}

// Yup validation schema
const miscUploadValidationSchema = yup.object().shape({
  selectedCategoryId: yup.string().required("Please select a misc category."),
  selectedFile: yup.mixed()
    .when('$isEditMode', { // Context variable $isEditMode
      is: (isEditMode: boolean) => !isEditMode, // If NOT in edit mode (i.e., add mode)
      then: schema => schema.required("Please select a file to upload.").test('filePresent', "File is required for upload.", value => !!value),
      otherwise: schema => schema.nullable(), // Optional in edit mode
    }),
  title: yup.string().optional().max(255, "Title cannot exceed 255 characters.").nullable(),
  description: yup.string().optional().max(1000, "Description cannot exceed 1000 characters.").nullable(),
});


const AdminUploadToMiscForm: React.FC<AdminUploadToMiscFormProps> = ({
  fileToEdit,
  preselectedCategoryId,
  onUploadSuccess,
  onFileUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!fileToEdit;

  const { register, handleSubmit, control, formState: { errors }, watch, setValue, reset } = useForm<MiscUploadFormData>({
    resolver: yupResolver(miscUploadValidationSchema),
    context: { // Pass context to yup schema
        isEditMode: isEditMode, 
    },
    defaultValues: {
      selectedCategoryId: preselectedCategoryId?.toString() || '',
      title: '',
      description: '',
      selectedFile: null,
    }
  });
  
  const [miscCategories, setMiscCategories] = useState<MiscCategory[]>([]);
  const [existingFileName, setExistingFileName] = useState<string | null>(null); // Still needed for display logic

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);
  // error and successMessage states removed

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();
  const watchedSelectedFile = watch('selectedFile');

  // Fetch categories for the dropdown
  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingCategories(true);
      fetchMiscCategories()
        .then(setMiscCategories)
        .catch(() => toast.error('Failed to load misc categories.'))
        .finally(() => setIsFetchingCategories(false));
    }
  }, [isAuthenticated, role]);

  // Pre-fill form for edit mode or set preselected category for add mode
  useEffect(() => {
    if (isEditMode && fileToEdit) {
      reset({
        selectedCategoryId: fileToEdit.misc_category_id.toString(),
        title: fileToEdit.user_provided_title || '',
        description: fileToEdit.user_provided_description || '',
        selectedFile: null, // File input reset separately
      });
      setExistingFileName(fileToEdit.original_filename);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      reset({
        selectedCategoryId: preselectedCategoryId?.toString() || '',
        title: '',
        description: '',
        selectedFile: null,
      });
      setExistingFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isEditMode, fileToEdit, preselectedCategoryId, reset]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setValue('selectedFile', event.target.files[0], { shouldValidate: true, shouldDirty: true });
      if (isEditMode) setExistingFileName(null); 
    } else {
      setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    }
  };

  const clearFileSelection = () => {
    setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isEditMode && fileToEdit) {
      setExistingFileName(fileToEdit.original_filename);
    }
  };

  const onSubmit: SubmitHandler<MiscUploadFormData> = async (data) => {
    if (!isAuthenticated || role !== 'admin') { 
      toast.error('Not authorized.'); 
      return; 
    }
    setIsLoading(true);

    const formDataPayload = new FormData();
    formDataPayload.append('misc_category_id', data.selectedCategoryId);
    formDataPayload.append('user_provided_title', data.title?.trim() || ''); 
    formDataPayload.append('user_provided_description', data.description?.trim() || '');

    if (data.selectedFile) { 
      formDataPayload.append('file', data.selectedFile);
    }

    try {
      let resultFile: MiscFile;
      if (isEditMode && fileToEdit) {
        resultFile = await editAdminMiscFile(fileToEdit.id, formDataPayload);
        toast.success(`File "${resultFile.user_provided_title || resultFile.original_filename}" updated successfully!`);
        if (onFileUpdated) onFileUpdated(resultFile);
      } else { 
        // selectedFile is validated by yup to be present for new uploads
        resultFile = await uploadAdminMiscFile(formDataPayload);
        toast.success(`File "${resultFile.original_filename}" uploaded successfully!`);
        reset({ // Reset form fields for add mode
            selectedCategoryId: preselectedCategoryId?.toString() || data.selectedCategoryId, // Keep category or use preselected
            title: '',
            description: '',
            selectedFile: null,
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (onUploadSuccess) onUploadSuccess(resultFile);
      }
    } catch (err: any) {
      const message = err.response?.data?.msg || err.message || `File operation failed.`;
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const onFormError = (formErrors: FieldErrors<MiscUploadFormData>) => {
    console.error("Form validation errors:", formErrors);
    toast.error("Please correct the errors highlighted in the form.");
  };
  
  if (!isAuthenticated || !['admin', 'super_admin'].includes(role)) {
      return null;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
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
      {/* Global error/success messages removed */}

      <div>
        <label htmlFor="selectedCategoryId" className="block text-sm font-medium text-gray-700">Misc Category*</label>
        {isFetchingCategories ? <p className="text-sm text-gray-500">Loading categories...</p> : (
          <select
            id="selectedCategoryId"
            {...register("selectedCategoryId")}
            disabled={isLoading || miscCategories.length === 0}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedCategoryId ? 'border-red-500' : ''}`}
          >
            <option value="" disabled>Select a category</option>
            {miscCategories.map(cat => (
              <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
            ))}
          </select>
        )}
        {errors.selectedCategoryId && <p className="mt-1 text-sm text-red-600">{errors.selectedCategoryId.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {isEditMode ? 'Replace File (Optional)' : 'Select File*'}
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label htmlFor="selectedFile" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                <span>{watchedSelectedFile ? 'Change file' : 'Upload a file'}</span>
                <input 
                    id="selectedFile" // id should match RHF field name if possible or be unique
                    name="selectedFile-input" // actual input name
                    type="file" 
                    className="sr-only"
                    onChange={handleFileChange} // RHF setValue is called here
                    ref={fileInputRef} 
                    disabled={isLoading} 
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">Any allowed file type.</p>
          </div>
        </div>
        {(watchedSelectedFile || (isEditMode && existingFileName)) && (
          <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
            <div className='flex items-center space-x-2 overflow-hidden'>
               <FileIconLucide size={18} className="text-gray-500 flex-shrink-0" />
               <span className="text-sm text-gray-700 truncate">
                 {watchedSelectedFile ? (watchedSelectedFile as File).name : existingFileName}
               </span>
               {isEditMode && existingFileName && !watchedSelectedFile && <span className="text-xs text-gray-500 ml-2">(current file)</span>}
            </div>
            {watchedSelectedFile && (
                <button type="button" onClick={clearFileSelection} disabled={isLoading} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                    <X size={16} />
                </button>
            )}
          </div>
        )}
        {errors.selectedFile && <p className="mt-1 text-sm text-red-600">{errors.selectedFile.message}</p>}
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">File Title (Optional)</label>
        <input 
            type="text" 
            id="title" 
            {...register("title")}
            placeholder={isEditMode && fileToEdit ? fileToEdit.original_filename : "Defaults to filename if blank"}
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.title ? 'border-red-500' : ''}`}
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">File Description (Optional)</label>
        <textarea 
            id="description" 
            rows={3} 
            {...register("description")}
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.description ? 'border-red-500' : ''}`}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
      </div>

      <div className="flex space-x-3">
        <button type="submit" 
                disabled={isLoading || isFetchingCategories || (!isEditMode && !watchedSelectedFile) || !watch('selectedCategoryId')}
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