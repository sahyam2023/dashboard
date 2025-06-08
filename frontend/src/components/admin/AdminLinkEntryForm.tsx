import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { showSuccessToast, showErrorToast } from '../../utils/toastUtils'; // Standardized toast
import {
  Software,
  Link as LinkType,
  SoftwareVersion,
  AddLinkPayloadFlexible,
  EditLinkPayloadFlexible
} from '../../types';
import {
  fetchSoftware,
  fetchVersionsForSoftware,
  addAdminLinkWithUrl,
  // uploadAdminLinkFile, // To be replaced
  editAdminLinkWithUrl,
  // editAdminLinkFile, // To be replaced
  uploadFileInChunks // New chunked upload service
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react';

interface AdminLinkEntryFormProps {
  linkToEdit?: LinkType | null;
  onLinkAdded?: (newLink: LinkType) => void;
  onLinkUpdated?: (updatedLink: LinkType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';
const CREATE_NEW_VERSION_SENTINEL = "CREATE_NEW_VERSION_SENTINEL_VALUE";

// Define the form data interface
interface LinkFormData {
  selectedSoftwareId: string;
  title: string;
  selectedVersionId: string;
  typedVersionString?: string;
  inputMode: InputMode;
  externalUrl?: string;
  selectedFile?: File | null | undefined; // Can be File, null (cleared), or undefined (initial)
  description?: string;
  compatibleVmsVersionIds: string[]; // New field
}

// Create a Yup validation schema
const validationSchema = yup.object().shape({
  selectedSoftwareId: yup.string().required('Software Product must be selected.'),
  title: yup.string().required('Link Title is required.').max(255, 'Title cannot exceed 255 characters.'),
  selectedVersionId: yup.string().required('Version must be selected or a new one entered.'),
  typedVersionString: yup.string().when('selectedVersionId', {
    is: CREATE_NEW_VERSION_SENTINEL,
    then: schema => schema.required('New Version String is required when "Enter New Version" is selected.').min(1, 'New Version String cannot be empty.'),
    otherwise: schema => schema.transform(value => value === '' ? undefined : value).optional().nullable(),
  }),
  inputMode: yup.string().oneOf(['url', 'upload']).required('Input mode must be selected.'),
  externalUrl: yup.string().when('inputMode', {
    is: 'url',
    then: schema => schema.required('External URL is required for URL mode.').url('Please enter a valid URL (e.g., http://example.com).'),
    otherwise: schema => schema.optional().nullable(),
  }),
  selectedFile: yup.mixed().when(['inputMode', 'isEditMode', 'existingFileName'], {
    is: (inputMode: string, isEditMode: boolean, existingFileName: string | null | undefined) => 
      inputMode === 'upload' && (!isEditMode || !existingFileName),
    then: schema => schema.required('A file is required for new link uploads.').test('filePresent', 'A file is required for new link uploads.', value => !!value),
    otherwise: schema => schema.nullable(),
  }),
  description: yup.string().optional().max(1000, 'Description cannot exceed 1000 characters.'),
  compatibleVmsVersionIds: yup.array().of(yup.string().required()).optional(), // New validation
});


const AdminLinkEntryForm: React.FC<AdminLinkEntryFormProps> = ({
  linkToEdit,
  onLinkAdded,
  onLinkUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!linkToEdit;

  const { register, handleSubmit, control, formState: { errors }, watch, setValue, reset } = useForm<LinkFormData>({
    resolver: yupResolver(validationSchema),
    context: { isEditMode, existingFileName: linkToEdit?.original_filename_ref || (linkToEdit && !linkToEdit.is_external_link ? linkToEdit.url.split('/').pop() : null) }, // Pass context to yup
    defaultValues: { // Initialize with sensible defaults
      selectedSoftwareId: '',
      title: '',
      selectedVersionId: '',
      typedVersionString: '',
      inputMode: 'url',
      externalUrl: '',
      selectedFile: null,
      description: '',
      compatibleVmsVersionIds: [], // Initialize new field
    }
  });

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  const [vmsVersionsList, setVmsVersionsList] = useState<SoftwareVersion[]>([]); // State for VMS versions
  const [isVmsOrVaSoftware, setIsVmsOrVaSoftware] = useState(false); // State to track if software is VMS/VA
  const [existingFileName, setExistingFileName] = useState<string | null>(null);


  const [isLoading, setIsLoading] = useState(false); // For API calls
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false); // For dropdown loading
  const [isFetchingVmsVersions, setIsFetchingVmsVersions] = useState(false); // Separate loading state for VMS versions
  const [uploadProgress, setUploadProgress] = useState<number>(0); // For chunked upload progress
  const [isUploading, setIsUploading] = useState<boolean>(false); // For beforeunload warning

  const { isAuthenticated, user } = useAuth();
  const role = user?.role; // Access role safely, as user can be null
  const fileInputRef = useRef<HTMLInputElement>(null);
  const watchedSoftwareId = watch('selectedSoftwareId'); // RHF watch
  const watchedSelectedVersionId = watch('selectedVersionId'); // RHF watch
  const watchedInputMode = watch('inputMode'); // RHF watch
  const watchedSelectedFile = watch('selectedFile'); // RHF watch
  // This state is now derived directly in JSX or from watchedSelectedVersionId
  const showTypeVersionInput = watchedSelectedVersionId === CREATE_NEW_VERSION_SENTINEL; 

  // Old state variables for individual fields are removed (title, description, etc.)
  // Old error and successMessage states are removed
  // useState for selectedSoftwareId, selectedVersionId, typedVersionString, inputMode, externalUrl, selectedFile are removed.

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

  useEffect(() => {
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => showErrorToast('Failed to load software list.')) // Standardized
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (watchedSoftwareId && softwareList.length > 0) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');

      const selectedSoftware = softwareList.find(sw => sw.id.toString() === watchedSoftwareId);
      if (selectedSoftware && (selectedSoftware.name === 'VMS' || selectedSoftware.name === 'VA')) {
        setIsVmsOrVaSoftware(true);
        const vmsSoftware = softwareList.find(sw => sw.name === 'VMS');
        if (vmsSoftware) {
          setIsFetchingVmsVersions(true);
          fetchVersionsForSoftware(vmsSoftware.id)
            .then(setVmsVersionsList)
            .catch(() => showErrorToast('Failed to load VMS versions for compatibility.'))
            .finally(() => setIsFetchingVmsVersions(false));
        } else {
          setVmsVersionsList([]);
        }
      } else {
        setIsVmsOrVaSoftware(false);
        setVmsVersionsList([]);
      }

      fetchVersionsForSoftware(parseInt(watchedSoftwareId))
        .then(setVersionsList)
        .catch(() => showErrorToast('Failed to load versions for selected software.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setIsVmsOrVaSoftware(false);
      setVmsVersionsList([]);
      setValue('selectedVersionId', '');
      setValue('typedVersionString', '');
    }
  }, [watchedSoftwareId, setValue, softwareList]);

  useEffect(() => {
    if (isEditMode && linkToEdit && softwareList.length > 0) {
      const currentSelectedSoftware = softwareList.find(sw => sw.id === linkToEdit.software_id);
      const isCurrentSoftwareVmsOrVa = !!currentSelectedSoftware && (currentSelectedSoftware.name === 'VMS' || currentSelectedSoftware.name === 'VA');
      setIsVmsOrVaSoftware(isCurrentSoftwareVmsOrVa);

      const defaultValues: Partial<LinkFormData> = {
        selectedSoftwareId: (watchedSoftwareId && watchedSoftwareId !== linkToEdit.software_id.toString()) ? watchedSoftwareId : linkToEdit.software_id.toString(),
        title: linkToEdit.title,
        description: linkToEdit.description || '',
        inputMode: linkToEdit.is_external_link ? 'url' : 'upload',
        externalUrl: linkToEdit.is_external_link ? linkToEdit.url : '',
        compatibleVmsVersionIds: isCurrentSoftwareVmsOrVa && linkToEdit.compatible_vms_versions
                                  ? (typeof linkToEdit.compatible_vms_versions === 'string'
                                      ? (linkToEdit.compatible_vms_versions as string).split(',').map(s => s.trim()).filter(s => s)
                                      : Array.isArray(linkToEdit.compatible_vms_versions)
                                          ? linkToEdit.compatible_vms_versions.map(String)
                                          : [])
                                  : [],
      };
      
      // Only prefill version details if the software context is still the original one
      if (watchedSoftwareId === linkToEdit.software_id.toString()) {
        if (linkToEdit.version_id && versionsList.length > 0) { // versionsList here is for the original software
            const existingVersionInList = versionsList.find(v => v.id === linkToEdit.version_id);
            if (existingVersionInList) {
                defaultValues.selectedVersionId = linkToEdit.version_id.toString();
                // defaultValues.typedVersionString = linkToEdit.version_name; // Keep original version name if version is selected
            } else {
                defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
                defaultValues.typedVersionString = linkToEdit.version_name;
            }
        } else if (linkToEdit.version_name) { // No version_id, but there was a version_name
            defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
            defaultValues.typedVersionString = linkToEdit.version_name;
        }
      }
      // If watchedSoftwareId is different, selectedVersionId and typedVersionString would have been
      // cleared by the other useEffect, and they won't be set here, which is correct.

      reset(defaultValues);

      if (!linkToEdit.is_external_link) {
        setExistingFileName(linkToEdit.original_filename_ref || linkToEdit.url.split('/').pop() || 'unknown_file');
      } else {
        setExistingFileName(null);
      }
      setValue('selectedFile', null);
      if (fileInputRef.current) fileInputRef.current.value = "";

    } else if (!isEditMode) {
      resetFormDefaults(!!watchedSoftwareId);
    }
  }, [isEditMode, linkToEdit, reset, setValue, versionsList, watchedSoftwareId, softwareList]);


  const resetFormDefaults = (keepSoftware: boolean = false) => {
    const currentSoftwareId = keepSoftware ? watch('selectedSoftwareId') : '';
    // RHF reset
    reset({
        selectedSoftwareId: currentSoftwareId,
        title: '',
        selectedVersionId: '',
        typedVersionString: '',
        inputMode: 'url',
        externalUrl: '',
        selectedFile: null,
        description: '',
        compatibleVmsVersionIds: [], // Reset VMS compat IDs
    });
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // setIsVmsOrVaSoftware(false); // This will be reset by the useEffect on watchedSoftwareId
    // Old setError(null) removed
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setValue('selectedFile', event.target.files[0], { shouldValidate: true, shouldDirty: true }); // RHF setValue
      // Old setError(null); setSuccessMessage(null) removed
    } else {
      setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true }); // RHF setValue
    }
  };

  const clearFileSelection = () => {
    setValue('selectedFile', null, { shouldValidate: true, shouldDirty: true }); // RHF setValue
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  // handleVersionSelectionChange is no longer needed, RHF handles select changes via register or Controller

  // RHF Submit Handler
  // RHF Submit Handler
  const onSubmit: SubmitHandler<LinkFormData> = async (data) => {
    // Old e.preventDefault() is not needed
    // Old manual validation checks are removed
    setIsLoading(true);
    if (data.inputMode === 'upload' && data.selectedFile) {
      setIsUploading(true);
    }
    setUploadProgress(0); // Reset progress
    // Old setError(null); setSuccessMessage(null) removed

    let finalVersionId: number | undefined = undefined;
    let finalTypedVersionString: string | undefined = undefined;

    // Logic using validated `data` from RHF
    if (data.selectedVersionId === CREATE_NEW_VERSION_SENTINEL && data.typedVersionString) {
      finalTypedVersionString = data.typedVersionString.trim();
    } else if (data.selectedVersionId && data.selectedVersionId !== CREATE_NEW_VERSION_SENTINEL) {
      finalVersionId = parseInt(data.selectedVersionId);
    }
    // Yup schema handles other validation cases (e.g. missing typedVersionString when sentinel selected)

    const basePayload: Partial<AddLinkPayloadFlexible | EditLinkPayloadFlexible> = {
      software_id: parseInt(data.selectedSoftwareId),
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    // Add VMS compatibility IDs if applicable
    if (isVmsOrVaSoftware && data.compatibleVmsVersionIds && data.compatibleVmsVersionIds.length > 0) {
        basePayload.compatible_vms_version_ids = data.compatibleVmsVersionIds;
    }

    try {
      let resultLink: LinkType;
      if (data.inputMode === 'url') {
        const payloadForUrl = {
          ...basePayload,
          url: data.externalUrl!.trim(),
          is_external_link: true
        } as AddLinkPayloadFlexible | EditLinkPayloadFlexible;

        if (isEditMode && linkToEdit) {
          resultLink = await editAdminLinkWithUrl(linkToEdit.id, payloadForUrl as EditLinkPayloadFlexible);
          showSuccessToast(`Link "${resultLink.title}" updated successfully!`); // Standardized
          if (onLinkUpdated) onLinkUpdated(resultLink);
        } else {
          resultLink = await addAdminLinkWithUrl(payloadForUrl as AddLinkPayloadFlexible);
          showSuccessToast(`Link "${resultLink.title}" added successfully!`); // Standardized
          if (onLinkAdded) onLinkAdded(resultLink);
          if (!isEditMode) {
            resetFormDefaults(true);
            setValue('selectedVersionId', ''); setValue('typedVersionString', '');
          }
        }
      } else { // data.inputMode === 'upload'
        if (!data.selectedFile) {
          if (isEditMode && linkToEdit && !linkToEdit.is_external_link && !data.selectedFile) {
            showErrorToast("To update metadata of an existing uploaded file link without re-uploading, use a different form/feature. To replace the file, select a new file.");
            setIsLoading(false);
            return;
          }
           if (!data.selectedFile && !isEditMode) { // Should be caught by yup
             showErrorToast("No file selected for upload.");
             setIsLoading(false);
             return;
          }
        }
        
        const chunkMetadata = {
            software_id: data.selectedSoftwareId,
            ...(finalVersionId && { version_id: finalVersionId.toString() }),
            ...(finalTypedVersionString && { typed_version_string: finalTypedVersionString }),
            link_title: data.title.trim(),
            description: data.description?.trim() || '',
            // Add compatibleVmsVersionIds to chunkMetadata if software is VMS/VA
            ...(isVmsOrVaSoftware && data.compatibleVmsVersionIds && data.compatibleVmsVersionIds.length > 0 &&
              { compatible_vms_version_ids_json: JSON.stringify(data.compatibleVmsVersionIds) }),
        };

        resultLink = await uploadFileInChunks(
            data.selectedFile!,
            'link_file', // Use 'link_file' as itemType for backend differentiation if necessary
            chunkMetadata,
            (progress) => setUploadProgress(progress)
        );
        
        showSuccessToast(`Link file "${resultLink.title}" added successfully via chunked upload!`);
        if (onLinkAdded) onLinkAdded(resultLink);
        resetFormDefaults(true);
        setValue('selectedVersionId', '');
        setValue('typedVersionString', '');
      }
    } catch (err: any) {
      const message = err.response?.data?.msg || err.message || `Failed to ${isEditMode && data.inputMode === 'url' ? 'update' : 'add'} link.`;
      showErrorToast(message); // Standardized
      if (data.inputMode === 'upload') setIsUploading(false); // Also set isUploading to false on error
    }
    finally {
      setIsLoading(false);
      if (data.inputMode === 'upload') setIsUploading(false); // Ensure isUploading is reset
    }
  };
  
  const onFormError = (formErrors: FieldErrors<LinkFormData>) => {
    console.error("Form validation errors:", formErrors);
    showErrorToast("Please correct the errors highlighted in the form."); // Standardized
  };


  if (!isAuthenticated || !role || !['admin', 'super_admin'].includes(role)) return null;

  return (
    // Use RHF handleSubmit, pass onSubmit and optional onFormError
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-6 bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex justify-between items-center"> 
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100"> {isEditMode ? 'Edit Link' : 'Add New Link'} </h3> 
        {isEditMode && onCancelEdit && ( 
            <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"> Cancel </button> 
        )} 
      </div> 
      {/* Old global error/success message divs removed */}

      <div>
        <label htmlFor="selectedSoftwareId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Software Product*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading software...</p> : (
          <select 
            id="selectedSoftwareId" 
            {...register("selectedSoftwareId")} // RHF register
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
            {...register("selectedVersionId")} // RHF register
            disabled={isLoading || isFetchingSoftwareOrVersions || !watchedSoftwareId} // Use watched value
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
        {/* Use showTypeVersionInput (derived from watchedSelectedVersionId) */}
        {showTypeVersionInput && ( 
          <div className="mt-2">
            <label htmlFor="typedVersionString" className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              {/* Label simplified as typedVersionString is only for new versions */}
              New Version String*:
            </label>
            <input
              type="text"
              id="typedVersionString"
              {...register("typedVersionString")} // RHF register
              placeholder="e.g., 1.2.4-final"
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.typedVersionString ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
              // `required` attribute removed, yup handles it
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This version will be created for the selected software if it doesn't exist.</p>
          </div>
        )}
        {/* Display errors for version fields */}
        {errors.selectedVersionId && !showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.selectedVersionId.message}</p>}
        {errors.typedVersionString && showTypeVersionInput && <p className="mt-1 text-sm text-red-600">{errors.typedVersionString.message}</p>}
      </div>
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Link Title*</label>
        <input 
            type="text" 
            id="title" 
            {...register("title")} // RHF register
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.title ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>}
      </div>

      {/* VMS Compatibility Section */}
      {isVmsOrVaSoftware && (
        <div>
          <label htmlFor="compatibleVmsVersionIds" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Compatible VMS Versions (for VMS/VA Links)
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
                          className="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:checked:bg-blue-500"
                          value={vmsVersion.id.toString()}
                          checked={field.value?.includes(vmsVersion.id.toString()) || false}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const currentValues = field.value || [];
                            const newValue = e.target.checked
                              ? [...currentValues, selectedId]
                              : currentValues.filter((id: string) => id !== selectedId);
                            field.onChange(newValue);
                          }}
                          disabled={isLoading || isFetchingVmsVersions}
                        />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{vmsVersion.version_number}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            />
          )}
          {errors.compatibleVmsVersionIds && <p className="mt-1 text-sm text-red-600">{errors.compatibleVmsVersionIds.message}</p>}
           <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select VMS versions this link is compatible with. Only applicable if the link is for 'VMS' or 'VA' software.</p>
        </div>
      )}

      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Link Source:</span>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" {...register("inputMode")} value="url" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
                <span className="flex items-center dark:text-gray-300"><LinkIconLucide size={16} className="mr-1 text-gray-600 dark:text-gray-400"/>Provide External URL</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" {...register("inputMode")} value="upload" className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
                <span className="flex items-center dark:text-gray-300"><UploadCloud size={16} className="mr-1 text-gray-600 dark:text-gray-400"/>Upload File for this Link</span>
            </label>
        </div>
        {errors.inputMode && <p className="mt-1 text-sm text-red-600">{errors.inputMode.message}</p>}
      </div>

      {watchedInputMode === 'url' && (
        <div>
            <label htmlFor="externalUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Link URL*</label>
            <input 
                type="url" 
                id="externalUrl" 
                {...register("externalUrl")} // RHF register
                placeholder="https://example.com/resource" 
                disabled={isLoading} 
                className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.externalUrl ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
            />
            {errors.externalUrl && <p className="mt-1 text-sm text-red-600">{errors.externalUrl.message}</p>}
        </div>
      )}

      {watchedInputMode === 'upload' && (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {/* Use watchedSelectedFile from RHF */}
                {isEditMode && existingFileName && !watchedSelectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 dark:border-gray-600 dark:hover:border-blue-400 transition-colors">
                <div className="space-y-1 text-center">
                    <FileIconLucide className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                    <div className="flex text-sm text-gray-600 dark:text-gray-400">
                        <label htmlFor="link-file-upload-input" className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                            <span>{watchedSelectedFile ? 'Change file' : 'Upload a file'}</span>
                             {/* File input itself. RHF doesn't directly register file inputs in the same way.
                                 onChange is handled by handleFileChange which uses setValue.
                                 The 'name' attribute here is for the input element itself, not necessarily for RHF registration.
                             */}
                            <input 
                                id="link-file-upload-input" 
                                name="file-input-element" // Clarified name
                                type="file" 
                                className="sr-only" 
                                onChange={handleFileChange} 
                                ref={fileInputRef} 
                                // `required` attribute removed, yup handles it
                                disabled={isLoading} 
                            />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Any file type relevant for links.</p>
                </div>
            </div>
            {(watchedSelectedFile || (isEditMode && existingFileName)) && (
                <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
                    <div className='flex items-center space-x-2 overflow-hidden'>
                        <FileIconLucide size={18} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {/* Display name of watchedSelectedFile or existingFileName */}
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
            {/* Display error for selectedFile (name used in LinkFormData and yup schema) */}
            {errors.selectedFile && <p className="mt-1 text-sm text-red-600">{errors.selectedFile.message}</p>}
        </div>
    )}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
        <textarea 
            id="description" 
            rows={3} 
            {...register("description")} // RHF register
            disabled={isLoading} 
            className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 ${errors.description ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
      </div>

      <div className="flex space-x-3">
        <button 
            type="submit" 
            disabled={isLoading || isFetchingSoftwareOrVersions}  // Also disable if fetching dropdown data
            className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
            {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Link' : 'Add Link')}
        </button>
        {isEditMode && onCancelEdit && (
            <button 
                type="button" 
                onClick={onCancelEdit} 
                disabled={isLoading} 
                className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 dark:border-gray-500 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
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

export default AdminLinkEntryForm;