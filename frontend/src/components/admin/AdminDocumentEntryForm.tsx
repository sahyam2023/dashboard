// src/components/admin/AdminDocumentEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'react-toastify';
import { Software, Document as DocumentType, AddDocumentPayload, EditDocumentPayload } from '../../types'; // Added EditDocumentPayload
import {
  fetchSoftware,
  addAdminDocumentWithUrl, uploadAdminDocumentFile,
  editAdminDocumentWithUrl, editAdminDocumentFile
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react'; // File to FileText

interface AdminDocumentEntryFormProps {
  documentToEdit?: DocumentType | null;
  onDocumentAdded?: (newDocument: DocumentType) => void;
  onDocumentUpdated?: (updatedDocument: DocumentType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';

// Define the form data interface
interface DocumentFormData {
  selectedSoftwareId: string;
  docName: string;
  docType?: string;
  description?: string;
  inputMode: InputMode;
  externalUrl?: string;
  selectedFile?: File | null | undefined; // File, null (cleared), or undefined (initial)
}

// Yup validation schema
const documentValidationSchema = yup.object().shape({
  selectedSoftwareId: yup.string().required("Software selection is required."),
  docName: yup.string().required("Document Name is required.").max(255, "Document Name cannot exceed 255 characters."),
  docType: yup.string().optional(),
  inputMode: yup.string().oneOf(['url', 'upload']).required("Input mode must be selected."),
  externalUrl: yup.string().when('inputMode', {
    is: 'url',
    then: schema => schema.required("External Download URL is required.").url("Please enter a valid URL (e.g., http://example.com)."),
    otherwise: schema => schema.optional().nullable(),
  }),
  selectedFile: yup.mixed()
    .when(['inputMode', '$isEditMode', '$documentToEditIsExternal'], { // Pass context via $ prefix
      is: (inputMode: string, isEditMode: boolean, documentToEditIsExternal: boolean) => {
        if (inputMode !== 'upload') return false; // Only apply if mode is 'upload'
        if (!isEditMode) return true; // Required for new uploads
        if (isEditMode && documentToEditIsExternal) return true; // Required if switching from URL to upload in edit mode
        return false; // Not required if editing an existing uploaded file and not changing it
      },
      then: schema => schema.required("Please select a file to upload.").test('filePresent', "File is required.", value => !!value),
      otherwise: schema => schema.nullable(),
    }),
  description: yup.string().optional().max(1000, "Description cannot exceed 1000 characters."),
});


const AdminDocumentEntryForm: React.FC<AdminDocumentEntryFormProps> = ({
  documentToEdit,
  onDocumentAdded,
  onDocumentUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!documentToEdit;

  const { register, handleSubmit, control, formState: { errors }, watch, setValue, reset } = useForm<DocumentFormData>({
    resolver: yupResolver(documentValidationSchema),
    context: { // Pass context to yup schema
      isEditMode: isEditMode,
      documentToEditIsExternal: documentToEdit?.is_external_link || false,
    },
    defaultValues: {
      selectedSoftwareId: '',
      docName: '',
      docType: '',
      description: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
    }
  });

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [existingFileName, setExistingFileName] = useState<string | null>(null); // For display in edit mode

  const [isLoading, setIsLoading] = useState(false); // For API calls
  const [isFetchingSoftware, setIsFetchingSoftware] = useState(false); // For dropdown loading
  // Error and success messages will be handled by toast

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();
  const watchedInputMode = watch('inputMode');
  const watchedSelectedFile = watch('selectedFile');

  useEffect(() => {
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingSoftware(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => toast.error('Failed to load software list.'))
        .finally(() => setIsFetchingSoftware(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (isEditMode && documentToEdit) {
      const defaultValues: Partial<DocumentFormData> = {
        selectedSoftwareId: documentToEdit.software_id?.toString() || '',
        docName: documentToEdit.doc_name,
        docType: documentToEdit.doc_type || '',
        description: documentToEdit.description || '',
        inputMode: documentToEdit.is_external_link ? 'url' : 'upload',
        externalUrl: documentToEdit.is_external_link ? documentToEdit.download_link : '',
      };
      reset(defaultValues);

      if (!documentToEdit.is_external_link) {
        const parts = documentToEdit.download_link.split('/');
        setExistingFileName(documentToEdit.original_filename_ref || parts[parts.length - 1]);
      } else {
        setExistingFileName(null);
      }
      setValue('selectedFile', null);
      if (fileInputRef.current) fileInputRef.current.value = "";

    } else {
      resetFormDefaults();
    }
  }, [documentToEdit, isEditMode, reset, setValue]);


  const resetFormDefaults = (keepSoftware: boolean = false) => {
    const currentSoftwareId = keepSoftware ? watch('selectedSoftwareId') : '';
    reset({
      selectedSoftwareId: currentSoftwareId,
      docName: '',
      docType: '',
      description: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
    });
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setValue('selectedFile', event.target.files[0], { shouldValidate: true, shouldDirty: true });
      setExistingFileName(null); 
    } else {
      setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    }
  };

  const clearFileSelection = () => {
    setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isEditMode && documentToEdit && !documentToEdit.is_external_link) {
      const parts = documentToEdit.download_link.split('/');
      setExistingFileName(documentToEdit.original_filename_ref || parts[parts.length - 1]);
    }
  };

  const onSubmit: SubmitHandler<DocumentFormData> = async (data) => {
    setIsLoading(true);

    try {
      let resultDocument: DocumentType;
      const commonPayload = {
        software_id: parseInt(data.selectedSoftwareId),
        doc_name: data.docName.trim(),
        description: data.description?.trim() || undefined,
        doc_type: data.docType?.trim() || undefined,
      };

      if (data.inputMode === 'url') {
        const payload = {
          ...commonPayload,
          download_link: data.externalUrl!.trim(), // Validated by yup
        };
        if (isEditMode && documentToEdit) {
          resultDocument = await editAdminDocumentWithUrl(documentToEdit.id, payload as EditDocumentPayload);
        } else {
          resultDocument = await addAdminDocumentWithUrl(payload as AddDocumentPayload);
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', data.selectedSoftwareId);
        formData.append('doc_name', data.docName.trim());
        if (data.docType?.trim()) formData.append('doc_type', data.docType.trim());
        if (data.description?.trim()) formData.append('description', data.description.trim());
        
        if (data.selectedFile) {
          formData.append('file', data.selectedFile);
        }

        if (isEditMode && documentToEdit) {
          resultDocument = await editAdminDocumentFile(documentToEdit.id, formData);
        } else {
          // selectedFile is validated by yup to be present for new uploads
          resultDocument = await uploadAdminDocumentFile(formData);
        }
      }

      toast.success(`Document "${resultDocument.doc_name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) resetFormDefaults(true);
      
      if (isEditMode && onDocumentUpdated) onDocumentUpdated(resultDocument);
      if (!isEditMode && onDocumentAdded) onDocumentAdded(resultDocument);

    } catch (err: any) {
      const message = err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} document.`;
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const onFormError = (formErrors: FieldErrors<DocumentFormData>) => {
    console.error("Form validation errors:", formErrors);
    toast.error("Please correct the errors highlighted in the form.");
  };

  const documentTypes = ["Guide", "Manual", "API Reference", "Datasheet", "Whitepaper", "Specification", "Other"];

  if (!isAuthenticated || !['admin', 'super_admin'].includes(role)) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-800">
          {isEditMode ? 'Edit Document' : 'Add New Document'}
        </h3>
        {isEditMode && onCancelEdit && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800">
            Cancel Edit
          </button>
        )}
      </div>
      {/* Global error/success messages removed, using toast now */}

      <div>
        <label htmlFor="selectedSoftwareId" className="block text-sm font-medium text-gray-700">Software*</label>
        {isFetchingSoftware ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select 
            id="selectedSoftwareId" 
            {...register("selectedSoftwareId")} 
            disabled={isLoading || isFetchingSoftware}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedSoftwareId ? 'border-red-500' : ''}`}
          >
            <option value="" disabled>Select Software</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
        {errors.selectedSoftwareId && <p className="mt-1 text-sm text-red-600">{errors.selectedSoftwareId.message}</p>}
      </div>

      <div>
        <label htmlFor="docName" className="block text-sm font-medium text-gray-700">Document Name*</label>
        <input 
            type="text" 
            id="docName" 
            {...register("docName")} 
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.docName ? 'border-red-500' : ''}`}
        />
        {errors.docName && <p className="mt-1 text-sm text-red-600">{errors.docName.message}</p>}
      </div>

      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Document Source:</span>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" {...register("inputMode")} value="url" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
            <span className="flex items-center"><LinkIconLucide size={16} className="mr-1 text-gray-600"/>Provide External Link</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" {...register("inputMode")} value="upload" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
            <span className="flex items-center"><UploadCloud size={16} className="mr-1 text-gray-600"/>Upload File</span>
          </label>
        </div>
        {errors.inputMode && <p className="mt-1 text-sm text-red-600">{errors.inputMode.message}</p>}
      </div>

      {watchedInputMode === 'url' && (
        <div>
          <label htmlFor="externalUrl" className="block text-sm font-medium text-gray-700">External Download URL*</label>
          <input 
            type="url" 
            id="externalUrl" 
            {...register("externalUrl")}
            placeholder="https://example.com/document.pdf" 
            disabled={isLoading}
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.externalUrl ? 'border-red-500' : ''}`}
          />
          {errors.externalUrl && <p className="mt-1 text-sm text-red-600">{errors.externalUrl.message}</p>}
        </div>
      )}

      {watchedInputMode === 'upload' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isEditMode && existingFileName && !watchedSelectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 transition-colors">
            <div className="space-y-1 text-center">
                <FileIconLucide className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                <label htmlFor="doc-file-upload-input" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>{watchedSelectedFile ? 'Change file' : 'Upload a file'}</span>
                    <input 
                        id="doc-file-upload-input" 
                        name="doc-file-input" // Name for the input element
                        type="file" 
                        className="sr-only"
                        onChange={handleFileChange} 
                        ref={fileInputRef} 
                        disabled={isLoading} 
                    />
                </label>
                <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PDF, DOCX, PNG, JPG, ZIP etc.</p>
            </div>
          </div>
          {(watchedSelectedFile || existingFileName) && (
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
                <div className='flex items-center space-x-2 overflow-hidden'>
                    <FileIconLucide size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      {watchedSelectedFile ? (watchedSelectedFile as File).name : existingFileName}
                    </span>
                    {isEditMode && existingFileName && !watchedSelectedFile && <span className="text-xs text-gray-500 ml-2">(current)</span>}
                </div>
                {watchedSelectedFile && (
                  <button type="button" onClick={clearFileSelection} disabled={isLoading}
                          className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                      <X size={16} />
                  </button>
                )}
            </div>
          )}
          {errors.selectedFile && <p className="mt-1 text-sm text-red-600">{errors.selectedFile.message}</p>}
        </div>
      )}

      <div>
        <label htmlFor="docType" className="block text-sm font-medium text-gray-700">Document Type</label>
        <select 
            id="docType" 
            {...register("docType")} 
            disabled={isLoading}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.docType ? 'border-red-500' : ''}`}
        >
          <option value="">Select Type (Optional)</option>
          {documentTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
        {errors.docType && <p className="mt-1 text-sm text-red-600">{errors.docType.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
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
        <button 
            type="submit" 
            disabled={isLoading || isFetchingSoftware}
            className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Document' : 'Add Document')}
        </button>
        {isEditMode && onCancelEdit && (
            <button 
                type="button" 
                onClick={onCancelEdit} 
                disabled={isLoading}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
                Cancel
            </button>
        )}
      </div>
    </form>
  );
};

export default AdminDocumentEntryForm;