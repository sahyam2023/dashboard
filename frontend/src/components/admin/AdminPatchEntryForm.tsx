// src/components/admin/AdminPatchEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'react-toastify';
import {
  Software,
  Patch as PatchType,
  SoftwareVersion,
  AddPatchPayloadFlexible,
  EditPatchPayloadFlexible
} from '../../types';
import {
  fetchSoftware,
  fetchVersionsForSoftware,
  addAdminPatchWithUrl, uploadAdminPatchFile,
  editAdminPatchWithUrl, editAdminPatchFile
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react';

interface AdminPatchEntryFormProps {
  patchToEdit?: PatchType | null;
  onPatchAdded?: (newPatch: PatchType) => void;
  onPatchUpdated?: (updatedPatch: PatchType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';
const CREATE_NEW_VERSION_SENTINEL = "CREATE_NEW_VERSION_SENTINEL_VALUE";

// Form data interface
interface PatchFormData {
  selectedSoftwareId: string;
  selectedVersionId: string;
  typedVersionString?: string;
  patchName: string;
  releaseDate?: string;
  description?: string;
  inputMode: InputMode;
  externalUrl?: string;
  selectedFile?: File | null | undefined;
}

// Yup validation schema
const patchValidationSchema = yup.object().shape({
  selectedSoftwareId: yup.string().required("Software Product must be selected."),
  selectedVersionId: yup.string().required("Version selection is required."),
  typedVersionString: yup.string().when('selectedVersionId', {
    is: CREATE_NEW_VERSION_SENTINEL,
    then: schema => schema.required("New Version String is required when 'Enter New Version' is selected.").min(1),
    otherwise: schema => schema.optional().nullable(),
  }),
  patchName: yup.string().required("Patch Name is required.").max(255, "Patch Name cannot exceed 255 characters."),
  releaseDate: yup.string().optional().nullable(),
  inputMode: yup.string().oneOf(['url', 'upload']).required("Input mode must be selected."),
  externalUrl: yup.string().when('inputMode', {
    is: 'url',
    then: schema => schema.required("External Download URL is required.").url("Please enter a valid URL."),
    otherwise: schema => schema.optional().nullable(),
  }),
  selectedFile: yup.mixed()
    .when(['inputMode', '$isEditMode', '$patchToEditIsExternal'], { // Context variables prefixed with $
      is: (inputMode: string, isEditMode: boolean, patchToEditIsExternal: boolean) => {
        if (inputMode !== 'upload') return false;
        if (!isEditMode) return true; // Required for new uploads
        if (isEditMode && patchToEditIsExternal) return true; // Required if switching from URL to upload in edit mode
        return false; // Not required if editing an existing uploaded file and not changing it
      },
      then: schema => schema.required("Please select a file to upload.").test('filePresent', "File is required for upload.", value => !!value),
      otherwise: schema => schema.nullable(),
    }),
  description: yup.string().optional().max(2000, "Description cannot exceed 2000 characters.").nullable(),
});


const AdminPatchEntryForm: React.FC<AdminPatchEntryFormProps> = ({
  patchToEdit,
  onPatchAdded,
  onPatchUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!patchToEdit;

  const { register, handleSubmit, control, formState: { errors }, watch, setValue, reset } = useForm<PatchFormData>({
    resolver: yupResolver(patchValidationSchema),
    context: { // Pass context to yup schema
        isEditMode: isEditMode,
        patchToEditIsExternal: patchToEdit?.is_external_link || false,
    },
    defaultValues: {
      selectedSoftwareId: '',
      selectedVersionId: '',
      typedVersionString: '',
      patchName: '',
      releaseDate: '',
      description: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
    }
  });

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false);
  // error and successMessage states will be removed, replaced by toast

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();
  const watchedSoftwareId = watch('selectedSoftwareId');
  const watchedSelectedVersionId = watch('selectedVersionId');
  const watchedInputMode = watch('inputMode');
  const watchedSelectedFile = watch('selectedFile');
  const showTypeVersionInput = watchedSelectedVersionId === CREATE_NEW_VERSION_SENTINEL;

  // Fetch software list for the product dropdown
  useEffect(() => {
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => toast.error('Failed to load software list.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  // Fetch versions for the version dropdown when a software product is selected
  useEffect(() => {
    if (watchedSoftwareId) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');
      fetchVersionsForSoftware(parseInt(watchedSoftwareId))
        .then(setVersionsList)
        .catch(() => toast.error('Failed to load versions.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');
    }
  }, [watchedSoftwareId, setValue]);

  // Pre-fill form when in edit mode
  useEffect(() => {
    if (isEditMode && patchToEdit) {
      const defaultValues: Partial<PatchFormData> = {
        selectedSoftwareId: patchToEdit.software_id.toString(),
        patchName: patchToEdit.patch_name,
        releaseDate: patchToEdit.release_date ? patchToEdit.release_date.split('T')[0] : '',
        description: patchToEdit.description || '',
        inputMode: patchToEdit.is_external_link ? 'url' : 'upload',
        externalUrl: patchToEdit.is_external_link ? patchToEdit.download_link : '',
      };

      // Version pre-filling logic
      if (patchToEdit.version_id && patchToEdit.software_id.toString() === watchedSoftwareId && versionsList.length > 0) {
        const existingVersionInList = versionsList.find(v => v.id === patchToEdit.version_id);
        if (existingVersionInList) {
          defaultValues.selectedVersionId = patchToEdit.version_id.toString();
          defaultValues.typedVersionString = patchToEdit.version_number;
        } else { // Version ID from patch not in list, assume new/custom
          defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
          defaultValues.typedVersionString = patchToEdit.version_number;
        }
      } else if (patchToEdit.version_number) { // Fallback or if versionsList not ready
        defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
        defaultValues.typedVersionString = patchToEdit.version_number;
      }
      
      reset(defaultValues);

      if (!patchToEdit.is_external_link) {
        setExistingFileName(patchToEdit.original_filename_ref || patchToEdit.download_link.split('/').pop() || 'unknown_file');
      } else {
        setExistingFileName(null);
      }
      setValue('selectedFile', null);
      if (fileInputRef.current) fileInputRef.current.value = "";

    } else if (!isEditMode) {
      resetFormDefaults(!!watchedSoftwareId);
    }
  }, [isEditMode, patchToEdit, versionsList, watchedSoftwareId, reset, setValue]);

  const resetFormDefaults = (keepSoftware: boolean = false) => {
    const currentSoftwareId = keepSoftware ? watch('selectedSoftwareId') : '';
    reset({
      selectedSoftwareId: currentSoftwareId,
      selectedVersionId: '',
      typedVersionString: '',
      patchName: '',
      releaseDate: '',
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
    if (isEditMode && patchToEdit && !patchToEdit.is_external_link) {
        setExistingFileName(patchToEdit.original_filename_ref || patchToEdit.download_link.split('/').pop() || 'unknown_file');
    }
  };

  // handleVersionSelectionChange is removed as RHF handles select directly.
  // Logic for typedVersionString visibility is derived from watchedSelectedVersionId.

  const onSubmit: SubmitHandler<PatchFormData> = async (data) => {
    setIsLoading(true);

    let finalVersionId: number | undefined = undefined;
    let finalTypedVersionString: string | undefined = undefined;

    if (data.selectedVersionId === CREATE_NEW_VERSION_SENTINEL && data.typedVersionString) {
      finalTypedVersionString = data.typedVersionString.trim();
    } else if (data.selectedVersionId && data.selectedVersionId !== CREATE_NEW_VERSION_SENTINEL) {
      finalVersionId = parseInt(data.selectedVersionId);
    }

    const basePayload: Partial<AddPatchPayloadFlexible | EditPatchPayloadFlexible> = {
      software_id: parseInt(data.selectedSoftwareId),
      patch_name: data.patchName.trim(),
      description: data.description?.trim() || undefined,
      release_date: data.releaseDate || undefined,
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    try {
      let resultPatch: PatchType;
      if (data.inputMode === 'url') {
        const payloadForUrl = { 
            ...basePayload, 
            download_link: data.externalUrl!.trim(), 
            is_external_link: true 
        } as AddPatchPayloadFlexible | EditPatchPayloadFlexible;

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchWithUrl(patchToEdit.id, payloadForUrl as EditPatchPayloadFlexible);
        } else {
          resultPatch = await addAdminPatchWithUrl(payloadForUrl as AddPatchPayloadFlexible);
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', data.selectedSoftwareId);
        if (finalVersionId) formData.append('version_id', finalVersionId.toString());
        if (finalTypedVersionString) formData.append('typed_version_string', finalTypedVersionString);
        
        formData.append('patch_name', data.patchName.trim());
        if (data.releaseDate) formData.append('release_date', data.releaseDate);
        if (data.description?.trim()) formData.append('description', data.description.trim());
        if (data.selectedFile) formData.append('file', data.selectedFile);

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchFile(patchToEdit.id, formData);
        } else {
          // selectedFile is validated by yup to be present for new uploads
          resultPatch = await uploadAdminPatchFile(formData);
        }
      }
      toast.success(`Patch "${resultPatch.patch_name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) {
          resetFormDefaults(true); // Keep software selected
          setValue('selectedVersionId', ''); 
          setValue('typedVersionString', '');
      }

      if (isEditMode && onPatchUpdated) onPatchUpdated(resultPatch);
      if (!isEditMode && onPatchAdded) onPatchAdded(resultPatch);

    } catch (err: any) {
      const message = err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} patch.`;
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const onFormError = (formErrors: FieldErrors<PatchFormData>) => {
    console.error("Form validation errors:", formErrors);
    toast.error("Please correct the errors highlighted in the form.");
  };

  if (!isAuthenticated || !['admin', 'super_admin'].includes(role)) return null;
  // console.log("Current softwareList:", softwareList); // Removed console.log

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-800">
          {isEditMode ? 'Edit Patch' : 'Add New Patch'}
        </h3>
        {isEditMode && onCancelEdit && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
        )}
      </div>
      {/* Global error/success messages removed */}

      <div>
        <label htmlFor="selectedSoftwareId" className="block text-sm font-medium text-gray-700">Software Product*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select 
            id="selectedSoftwareId" 
            {...register("selectedSoftwareId")}
            disabled={isLoading || (isFetchingSoftwareOrVersions && !softwareList.length)}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedSoftwareId ? 'border-red-500' : ''}`}
          >
            <option value="" disabled>Select Software Product</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
        {errors.selectedSoftwareId && <p className="mt-1 text-sm text-red-600">{errors.selectedSoftwareId.message}</p>}
      </div>

      <div>
        <label htmlFor="selectedVersionId" className="block text-sm font-medium text-gray-700">Version*</label>
        <div className="mt-1">
          <select
            id="selectedVersionId"
            {...register("selectedVersionId")}
            disabled={isLoading || isFetchingSoftwareOrVersions || !watchedSoftwareId }
            className={`block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedVersionId ? 'border-red-500' : ''}`}
          >
            <option value="" disabled={versionsList.length > 0 && !!watchedSoftwareId}>
              {isFetchingSoftwareOrVersions && watchedSoftwareId ? 'Loading versions...' : 'Select Existing Version'}
            </option>
            {versionsList.map(v => (
              <option key={v.id} value={v.id.toString()}>{v.version_number}</option>
            ))}
            <option value={CREATE_NEW_VERSION_SENTINEL}>Enter New Version String...</option>
          </select>
        </div>
        {showTypeVersionInput && (
          <div className="mt-2">
            <label htmlFor="typedVersionString" className="block text-xs font-medium text-gray-600">
              New Version String*:
            </label>
            <input
              type="text"
              id="typedVersionString"
              {...register("typedVersionString")}
              placeholder="e.g., 2.5.1-hotfix"
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.typedVersionString ? 'border-red-500' : ''}`}
            />
             <p className="mt-1 text-xs text-gray-500">This version will be created for the selected software if it doesn't exist.</p>
          </div>
        )}
        {errors.selectedVersionId && !showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.selectedVersionId.message}</p>}
        {errors.typedVersionString && showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.typedVersionString.message}</p>}
      </div>

      <div>
        <label htmlFor="patchName" className="block text-sm font-medium text-gray-700">Patch Name*</label>
        <input 
            type="text" 
            id="patchName" 
            {...register("patchName")} 
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.patchName ? 'border-red-500' : ''}`}
        />
        {errors.patchName && <p className="mt-1 text-sm text-red-600">{errors.patchName.message}</p>}
      </div>
      <div>
        <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">Release Date</label>
        <input 
            type="date" 
            id="releaseDate" 
            {...register("releaseDate")} 
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.releaseDate ? 'border-red-500' : ''}`}
        />
        {errors.releaseDate && <p className="mt-1 text-sm text-red-600">{errors.releaseDate.message}</p>}
      </div>
      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Patch Source:</span>
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
                placeholder="https://example.com/patch.exe" 
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
                        <label htmlFor="patch-file-upload-input" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                            <span>{watchedSelectedFile ? 'Change file' : 'Upload a file'}</span>
                            <input 
                                id="patch-file-upload-input" 
                                name="patch-file-input"
                                type="file" 
                                className="sr-only" 
                                onChange={handleFileChange} 
                                ref={fileInputRef} 
                                disabled={isLoading} 
                            />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">EXE, MSI, ZIP, etc.</p>
                </div>
            </div>
            {(watchedSelectedFile || (isEditMode && existingFileName)) && (
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
                <div className='flex items-center space-x-2 overflow-hidden'>
                    <FileIconLucide size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                        {watchedSelectedFile ? (watchedSelectedFile as File).name : existingFileName}
                    </span>
                    {isEditMode && existingFileName && !watchedSelectedFile && <span className="text-xs text-gray-500 ml-2">(current)</span>}
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
      )}
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
            disabled={isLoading || isFetchingSoftwareOrVersions} 
            className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
            {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Patch' : 'Add Patch')}
        </button>
        {isEditMode && onCancelEdit && (
            <button 
                type="button" 
                onClick={onCancelEdit} 
                disabled={isLoading} 
                className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
            Cancel
            </button>
        )}
      </div>
    </form>
  );
};

export default AdminPatchEntryForm;