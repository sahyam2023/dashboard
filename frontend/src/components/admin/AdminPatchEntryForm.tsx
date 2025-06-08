// src/components/admin/AdminPatchEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { showSuccessToast, showErrorToast } from '../../utils/toastUtils'; // Standardized toast
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
  addAdminPatchWithUrl,
  // uploadAdminPatchFile, // To be replaced
  editAdminPatchWithUrl,
  // editAdminPatchFile, // To be replaced
  uploadFileInChunks // New chunked upload service
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  patch_by_developer?: string; // Added
  compatibleVmsVersionIds: string[]; // New field for VMS compatibility
}

// Yup validation schema
const patchValidationSchema = yup.object().shape({
  selectedSoftwareId: yup.string().required("Software Product must be selected."),
  selectedVersionId: yup.string().required("Version selection is required."),
  typedVersionString: yup.string().when('selectedVersionId', {
    is: CREATE_NEW_VERSION_SENTINEL,
    then: schema => schema.required("New Version String is required when 'Enter New Version' is selected.").min(1),
    otherwise: schema => schema.transform(value => value === '' ? undefined : value).optional().nullable(),
  }),
  patchName: yup.string().required("Patch Name is required.").max(255, "Patch Name cannot exceed 255 characters."),
  releaseDate: yup.string().transform(value => value === '' ? undefined : value).optional().nullable(),
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
  description: yup.string().transform(value => value === '' ? undefined : value).optional().max(2000, "Description cannot exceed 2000 characters.").nullable(),
  patch_by_developer: yup.string().transform(value => value === '' ? undefined : value).optional().max(255, "Patch developer name cannot exceed 255 characters.").nullable(), // Added
  compatibleVmsVersionIds: yup.array().of(yup.string().required()).optional(), // VMS compatibility IDs
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
      releaseDate: getTodayDateString(),
      description: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
      patch_by_developer: '', // Added
      compatibleVmsVersionIds: [], // Initialize new field
    }
  });

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  const [vmsVersionsList, setVmsVersionsList] = useState<SoftwareVersion[]>([]); // State for VMS versions
  const [isVmsOrVaSoftware, setIsVmsOrVaSoftware] = useState(false); // State to track if software is VMS/VA
  const [existingFileName, setExistingFileName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false);
  const [isFetchingVmsVersions, setIsFetchingVmsVersions] = useState(false); // Separate loading state for VMS versions
  const [uploadProgress, setUploadProgress] = useState<number>(0); // For chunked upload progress
  const [isUploading, setIsUploading] = useState<boolean>(false); // For beforeunload warning

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, user } = useAuth();
  const role = user?.role; // Access role safely, as user can be null
  const watchedSoftwareId = watch('selectedSoftwareId');
  const watchedSelectedVersionId = watch('selectedVersionId');
  const watchedInputMode = watch('inputMode');
  const watchedSelectedFile = watch('selectedFile');
  const showTypeVersionInput = watchedSelectedVersionId === CREATE_NEW_VERSION_SENTINEL;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isUploading) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isUploading]);

  // Fetch software list for the product dropdown
  useEffect(() => {
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => showErrorToast('Failed to load software list.')) // Standardized
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  // Fetch versions for the version dropdown when a software product is selected
  useEffect(() => {
    if (watchedSoftwareId && softwareList.length > 0) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');

      const selectedSoftware = softwareList.find(sw => sw.id.toString() === watchedSoftwareId);
      if (selectedSoftware && (selectedSoftware.name === 'VMS' || selectedSoftware.name === 'VA')) {
        setIsVmsOrVaSoftware(true);
        // Fetch VMS versions specifically for the multi-select
        const vmsSoftware = softwareList.find(sw => sw.name === 'VMS');
        if (vmsSoftware) {
          setIsFetchingVmsVersions(true);
          fetchVersionsForSoftware(vmsSoftware.id)
            .then(setVmsVersionsList)
            .catch(() => showErrorToast('Failed to load VMS versions for compatibility.'))
            .finally(() => setIsFetchingVmsVersions(false));
        } else {
          setVmsVersionsList([]); // Clear if VMS software itself not found
        }
      } else {
        setIsVmsOrVaSoftware(false);
        setVmsVersionsList([]); // Clear VMS versions if not VMS/VA software
      }

      // Fetch versions for the selected software for the main version dropdown
      fetchVersionsForSoftware(parseInt(watchedSoftwareId))
        .then(setVersionsList)
        .catch(() => showErrorToast('Failed to load versions.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setIsVmsOrVaSoftware(false);
      setVmsVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');
    }
  }, [watchedSoftwareId, setValue, softwareList]);

  // Pre-fill form when in edit mode
  useEffect(() => {
    if (isEditMode && patchToEdit && softwareList.length > 0) { // Ensure softwareList is loaded for VMS/VA check
      const currentSelectedSoftware = softwareList.find(sw => sw.id === patchToEdit.software_id);
      const isCurrentSoftwareVmsOrVa = !!currentSelectedSoftware && (currentSelectedSoftware.name === 'VMS' || currentSelectedSoftware.name === 'VA');
      setIsVmsOrVaSoftware(isCurrentSoftwareVmsOrVa); // Set based on patchToEdit's software

      const defaultValues: Partial<PatchFormData> = {
        selectedSoftwareId: (watchedSoftwareId && watchedSoftwareId !== patchToEdit.software_id.toString()) ? watchedSoftwareId : patchToEdit.software_id.toString(),
        patchName: patchToEdit.patch_name,
        releaseDate: patchToEdit.release_date ? patchToEdit.release_date.split('T')[0] : '',
        description: patchToEdit.description || '',
        inputMode: patchToEdit.is_external_link ? 'url' : 'upload',
        externalUrl: patchToEdit.is_external_link ? patchToEdit.download_link : '',
        patch_by_developer: patchToEdit.patch_by_developer || '',
        compatibleVmsVersionIds: isCurrentSoftwareVmsOrVa && patchToEdit.compatible_vms_versions
                                  ? (typeof patchToEdit.compatible_vms_versions === 'string'
                                      ? (patchToEdit.compatible_vms_versions as string).split(',').map(s => s.trim()).filter(s => s)
                                      : Array.isArray(patchToEdit.compatible_vms_versions)
                                          ? patchToEdit.compatible_vms_versions.map(String)
                                          : [])
                                  : [],
      };

      // Version pre-filling logic
      if (watchedSoftwareId === patchToEdit.software_id.toString()) {
        // Only prefill version details if the software context is still the original one
        if (patchToEdit.version_id && versionsList.length > 0) { // versionsList here is for the original software
            const existingVersionInList = versionsList.find(v => v.id === patchToEdit.version_id);
            if (existingVersionInList) {
                defaultValues.selectedVersionId = patchToEdit.version_id.toString();
                // defaultValues.typedVersionString = patchToEdit.version_number; // Keep original if version selected
            } else {
                defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
                defaultValues.typedVersionString = patchToEdit.version_number;
            }
        } else if (patchToEdit.version_number) { // No version_id, but there was a version_name
            defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
            defaultValues.typedVersionString = patchToEdit.version_number;
        }
      }
      // If watchedSoftwareId is different, selectedVersionId and typedVersionString would have been
      // cleared by the other useEffect, and they won't be set here, which is correct.
      
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
  }, [isEditMode, patchToEdit, versionsList, watchedSoftwareId, reset, setValue, softwareList]);


  const resetFormDefaults = (keepSoftware: boolean = false) => {
    const currentSoftwareId = keepSoftware ? watch('selectedSoftwareId') : '';
    reset({
      selectedSoftwareId: currentSoftwareId,
      selectedVersionId: '',
      typedVersionString: '',
      patchName: '',
      releaseDate: getTodayDateString(),
      description: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
      patch_by_developer: '', // Added
      compatibleVmsVersionIds: [], // Reset VMS compat IDs
    });
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // setIsVmsOrVaSoftware(false); // This will be reset by the useEffect on watchedSoftwareId
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
    if (data.inputMode === 'upload' && data.selectedFile) {
      setIsUploading(true);
    }
    setUploadProgress(0); // Reset progress

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
      patch_by_developer: data.patch_by_developer?.trim() || undefined,
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    // Add VMS compatibility IDs if applicable
    if (isVmsOrVaSoftware && data.compatibleVmsVersionIds && data.compatibleVmsVersionIds.length > 0) {
        basePayload.compatible_vms_version_ids = data.compatibleVmsVersionIds;
    }


    try {
      let resultPatch: PatchType;
      if (data.inputMode === 'url') {
        const payloadForUrl = {
          ...basePayload,
          download_link: data.externalUrl!.trim(),
          is_external_link: true
        } as AddPatchPayloadFlexible | EditPatchPayloadFlexible; // Ensure type assertion for clarity

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchWithUrl(patchToEdit.id, payloadForUrl as EditPatchPayloadFlexible);
          showSuccessToast(`Patch "${resultPatch.patch_name}" updated successfully!`);
          if (onPatchUpdated) onPatchUpdated(resultPatch);
        } else {
          resultPatch = await addAdminPatchWithUrl(payloadForUrl as AddPatchPayloadFlexible);
          showSuccessToast(`Patch "${resultPatch.patch_name}" added successfully!`);
          if (onPatchAdded) onPatchAdded(resultPatch);
          if (!isEditMode) {
            resetFormDefaults(true);
            setValue('selectedVersionId', ''); setValue('typedVersionString', '');
          }
        }
      } else { // inputMode === 'upload'
        if (!data.selectedFile) {
          if (isEditMode && patchToEdit && !patchToEdit.is_external_link && !data.selectedFile) {
            showErrorToast("To update metadata of an existing uploaded patch without re-uploading, use a different form/feature. To replace the file, select a new file.");
            setIsLoading(false);
            return;
          }
          if (!data.selectedFile && !isEditMode) { // Should be caught by yup
             showErrorToast("No file selected for upload.");
             setIsLoading(false);
             return;
          }
          // Fallthrough: if selectedFile is null in edit mode for an existing uploaded file, and user didn't select a new one,
          // this implies they might expect metadata-only update, which this path doesn't do.
          // However, yup validation might require a file if inputMode is 'upload'.
          // For now, if we reach here with data.selectedFile, we proceed to upload.
        }

        // Metadata for chunked upload
        const chunkMetadata = {
            software_id: data.selectedSoftwareId,
            ...(finalVersionId && { version_id: finalVersionId.toString() }),
            ...(finalTypedVersionString && { typed_version_string: finalTypedVersionString }),
            patch_name: data.patchName.trim(),
            ...(data.releaseDate && { release_date: data.releaseDate }),
            description: data.description?.trim() || '',
            patch_by_developer: data.patch_by_developer?.trim() || '',
            // Add compatibleVmsVersionIds to chunkMetadata if software is VMS/VA
            ...(isVmsOrVaSoftware && data.compatibleVmsVersionIds && data.compatibleVmsVersionIds.length > 0 &&
              { compatible_vms_version_ids_json: JSON.stringify(data.compatibleVmsVersionIds) }),
        };

        resultPatch = await uploadFileInChunks(
            data.selectedFile!, // Assert not null, yup should ensure it's present
            'patch',
            chunkMetadata,
            (progress) => setUploadProgress(progress)
        );

        // As uploadFileInChunks always creates a new patch entry with the current backend:
        showSuccessToast(`Patch "${resultPatch.patch_name}" added successfully via chunked upload!`);
        if (onPatchAdded) onPatchAdded(resultPatch); // Treat as new patch added
        resetFormDefaults(true); // Reset form
        setValue('selectedVersionId', '');
        setValue('typedVersionString', '');
      }
    } catch (err: any) {
      const message = err.response?.data?.msg || err.message || `Failed to ${isEditMode && data.inputMode === 'url' ? 'update' : 'add'} patch.`;
      showErrorToast(message); // Standardized
      if (data.inputMode === 'upload') setIsUploading(false); // Also set isUploading to false on error
    } finally {
      setIsLoading(false);
      if (data.inputMode === 'upload') setIsUploading(false); // Ensure isUploading is reset
      // Consider resetting uploadProgress here or after a delay
    }
  };
  
  const onFormError = (formErrors: FieldErrors<PatchFormData>) => {
    console.error("Form validation errors:", formErrors);
    showErrorToast("Please correct the errors highlighted in the form."); // Standardized
  };

  if (!isAuthenticated || !role || !['admin', 'super_admin'].includes(role)) return null;
  // console.log("Current softwareList:", softwareList);

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          {isEditMode ? 'Edit Patch' : 'Add New Patch'}
        </h3>
        {isEditMode && onCancelEdit && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            Cancel
          </button>
        )}
      </div>
      {/* Global error/success messages removed */}

      <div>
        <label htmlFor="selectedSoftwareId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Software Product*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading software...</p> : (
          <select 
            id="selectedSoftwareId" 
            {...register("selectedSoftwareId")}
            disabled={isLoading || (isFetchingSoftwareOrVersions && !softwareList.length)}
            className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedSoftwareId ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600`}
          >
            <option value="" disabled>Select Software Product</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
        
        {errors.selectedSoftwareId && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.selectedSoftwareId.message}</p>}
      </div>

      <div>
        <label htmlFor="selectedVersionId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Version*</label>
        <div className="mt-1">
          <select
            id="selectedVersionId"
            {...register("selectedVersionId")}
            disabled={isLoading || isFetchingSoftwareOrVersions || !watchedSoftwareId }
            className={`block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md ${errors.selectedVersionId ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600`}
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
            <label htmlFor="typedVersionString" className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              New Version String*:
            </label>
            <input
              type="text"
              id="typedVersionString"
              {...register("typedVersionString")}
              placeholder="e.g., 2.5.1-hotfix"
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.typedVersionString ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
            />
             <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This version will be created for the selected software if it doesn't exist.</p>
          </div>
        )}
        {errors.selectedVersionId && !showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.selectedVersionId.message}</p>}
        {errors.typedVersionString && showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.typedVersionString.message}</p>}
      </div>

      <div>
        <label htmlFor="patchName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Patch Name*</label>
        <input 
            type="text" 
            id="patchName" 
            {...register("patchName")} 
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.patchName ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.patchName && <p className="mt-1 text-sm text-red-600">{errors.patchName.message}</p>}
      </div>
      <div>
        <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Release Date</label>
        <input 
            type="date" 
            id="releaseDate" 
            {...register("releaseDate")} 
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.releaseDate ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600`}
        />
        {errors.releaseDate && <p className="mt-1 text-sm text-red-600">{errors.releaseDate.message}</p>}
      </div>
      <div>
        <label htmlFor="patch_by_developer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Patch By Developer</label>
        <input 
            type="text" 
            id="patch_by_developer" 
            {...register("patch_by_developer")} 
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.patch_by_developer ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.patch_by_developer && <p className="mt-1 text-sm text-red-600">{errors.patch_by_developer.message}</p>}
      </div>

      {/* VMS Compatibility Section */}
      {isVmsOrVaSoftware && (
        <div>
          <label htmlFor="compatibleVmsVersionIds" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Compatible VMS Versions (for VMS/VA Patches)
          </label>
          {isFetchingVmsVersions ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading VMS versions...</p> : (
            <Controller
              name="compatibleVmsVersionIds"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <div className="mt-1 block w-full max-h-40 overflow-y-auto p-2 border border-gray-300 rounded-md bg-white dark:bg-gray-700 dark:border-gray-600">
                  {vmsVersionsList.length === 0 ? (
                     <p className="text-sm text-gray-500 dark:text-gray-400">No VMS versions available.</p>
                  ) : (
                    vmsVersionsList.map(vmsVersion => (
                      <label key={vmsVersion.id} className="flex items-center space-x-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <input
                          type="checkbox"
                          className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-600"
                          value={vmsVersion.id.toString()}
                          checked={field.value?.includes(vmsVersion.id.toString())}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const newValue = e.target.checked
                              ? [...(field.value || []), selectedId]
                              : (field.value || []).filter((id: string) => id !== selectedId);
                            field.onChange(newValue);
                          }}
                          disabled={isLoading || isFetchingVmsVersions}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{vmsVersion.version_number}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            />
          )}
          {errors.compatibleVmsVersionIds && <p className="mt-1 text-sm text-red-600">{errors.compatibleVmsVersionIds.message}</p>}
           <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select VMS versions this patch is compatible with. Only applicable if the patch is for 'VMS' or 'VA' software.</p>
        </div>
      )}

      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Patch Source:</span>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" {...register("inputMode")} value="url" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
                <span className="flex items-center dark:text-gray-300"><LinkIconLucide size={16} className="mr-1 text-gray-600 dark:text-gray-400"/>Provide External Link</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" {...register("inputMode")} value="upload" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
                <span className="flex items-center dark:text-gray-300"><UploadCloud size={16} className="mr-1 text-gray-600 dark:text-gray-400"/>Upload File</span>
            </label>
        </div>
        {errors.inputMode && <p className="mt-1 text-sm text-red-600">{errors.inputMode.message}</p>}
      </div>
      {watchedInputMode === 'url' && (
        <div>
            <label htmlFor="externalUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">External Download URL*</label>
            <input 
                type="url" 
                id="externalUrl" 
                {...register("externalUrl")} 
                placeholder="https://example.com/patch.exe" 
                disabled={isLoading} 
                className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.externalUrl ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
            />
            {errors.externalUrl && <p className="mt-1 text-sm text-red-600">{errors.externalUrl.message}</p>}
        </div>
      )}
      {watchedInputMode === 'upload' && (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {isEditMode && existingFileName && !watchedSelectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400 transition-colors">
                <div className="space-y-1 text-center">
                    <FileIconLucide className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                    <div className="flex text-sm text-gray-600 dark:text-gray-400">
                        <label htmlFor="patch-file-upload-input" className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">EXE, MSI, ZIP, etc.</p>
                </div>
            </div>
            {(watchedSelectedFile || (isEditMode && existingFileName)) && (
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
                <div className='flex items-center space-x-2 overflow-hidden'>
                    <FileIconLucide size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {watchedSelectedFile ? (watchedSelectedFile as File).name : existingFileName}
                    </span>
                    {isEditMode && existingFileName && !watchedSelectedFile && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(current)</span>}
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
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
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
                className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-500 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
            Cancel
            </button>
        )}
      </div>

      {/* Upload Progress Bar */}
      {isLoading && watchedInputMode === 'upload' && uploadProgress > 0 && (
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

export default AdminPatchEntryForm;