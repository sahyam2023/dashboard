import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'react-toastify';
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
  addAdminLinkWithUrl, uploadAdminLinkFile,
  editAdminLinkWithUrl, editAdminLinkFile
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
    }
  });

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  // --- Version Handling States (Version is MANDATORY for Links now) ---
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  // showTypeVersionInput will be derived from watched selectedVersionId
  // --- End Version Handling States ---
  
  // existingFileName needs to be tracked for validation logic if not using context correctly or if it changes
  const [existingFileName, setExistingFileName] = useState<string | null>(null);


  const [isLoading, setIsLoading] = useState(false); // For API calls
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false); // For dropdown loading
  // Error and success messages will be handled by toast

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
    if (isAuthenticated && (role === 'admin' || role === 'super_admin')) {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => toast.error('Failed to load software list.')) // Use toast
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    // Uses watchedSoftwareId from RHF
    if (watchedSoftwareId) { 
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setValue('selectedVersionId', ''); // RHF setValue
      setValue('typedVersionString', ''); // RHF setValue
      // setShowTypeVersionInput(false); // Derived state
      fetchVersionsForSoftware(parseInt(watchedSoftwareId))
        .then(setVersionsList)
        .catch(() => toast.error('Failed to load versions for selected software.')) // Use toast
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setValue('selectedVersionId', ''); // RHF setValue
      setValue('typedVersionString', ''); // RHF setValue
      // setShowTypeVersionInput(false); // Derived state
    }
  }, [watchedSoftwareId, setValue]); // Add setValue to dependencies

  useEffect(() => {
    if (isEditMode && linkToEdit) {
      // Use RHF reset or setValue to prefill
      const defaultValues: Partial<LinkFormData> = {
        selectedSoftwareId: linkToEdit.software_id.toString(),
        title: linkToEdit.title,
        description: linkToEdit.description || '',
        inputMode: linkToEdit.is_external_link ? 'url' : 'upload',
        externalUrl: linkToEdit.is_external_link ? linkToEdit.url : '',
        // selectedFile remains null/undefined initially for edit mode
      };
      
      // Pre-fill version logic using RHF values
      // This logic depends on versionsList being populated for the selectedSoftwareId
      // It's important that watchedSoftwareId is already set for this to work correctly,
      // or this part of the logic needs to run when versionsList is updated.
      if (linkToEdit.version_id && linkToEdit.software_id.toString() === watchedSoftwareId && versionsList.length > 0) {
        const existingVersionInList = versionsList.find(v => v.id === linkToEdit.version_id);
        if (existingVersionInList) {
          defaultValues.selectedVersionId = linkToEdit.version_id.toString();
          defaultValues.typedVersionString = linkToEdit.version_number; 
        } else {
          defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
          defaultValues.typedVersionString = linkToEdit.version_number;
        }
      } else if (linkToEdit.version_number) { // Fallback if versionsList not ready or software ID mismatch
          defaultValues.selectedVersionId = CREATE_NEW_VERSION_SENTINEL;
          defaultValues.typedVersionString = linkToEdit.version_number;
      }

      reset(defaultValues); // RHF reset with all values

      if (!linkToEdit.is_external_link) {
        setExistingFileName(linkToEdit.original_filename_ref || linkToEdit.url.split('/').pop() || 'unknown_file');
      } else {
        setExistingFileName(null);
      }
      setValue('selectedFile', null); // Clear file input field
      if (fileInputRef.current) fileInputRef.current.value = "";

    } else if (!isEditMode) {
      resetFormDefaults(!!watchedSoftwareId); // Use new reset function
    }
  // Add versionsList and watchedSoftwareId to dependency array to re-run pre-fill if they change
  }, [isEditMode, linkToEdit, reset, setValue, versionsList, watchedSoftwareId]);


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
    });
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
  const onSubmit: SubmitHandler<LinkFormData> = async (data) => {
    // Old e.preventDefault() is not needed
    // Old manual validation checks are removed
    setIsLoading(true);
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
      software_id: parseInt(data.selectedSoftwareId), // From RHF data
      title: data.title.trim(), // From RHF data
      description: data.description?.trim() || undefined, // From RHF data
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    try {
      let resultLink: LinkType;
      if (data.inputMode === 'url') { // From RHF data
        const payloadForUrl = { 
            ...basePayload, 
            url: data.externalUrl!.trim(), // From RHF data, ! asserts it's present due to yup validation
            is_external_link: true 
        } as AddLinkPayloadFlexible | EditLinkPayloadFlexible;

        if (isEditMode && linkToEdit) {
          resultLink = await editAdminLinkWithUrl(linkToEdit.id, payloadForUrl as EditLinkPayloadFlexible);
        } else {
          resultLink = await addAdminLinkWithUrl(payloadForUrl as AddLinkPayloadFlexible);
        }
      } else { // data.inputMode === 'upload'
        const formDataPayload = new FormData(); // Renamed from 'formData' to avoid conflict
        formDataPayload.append('software_id', data.selectedSoftwareId); // From RHF data
        if (finalVersionId) formDataPayload.append('version_id', finalVersionId.toString());
        if (finalTypedVersionString) formDataPayload.append('typed_version_string', finalTypedVersionString);
        
        formDataPayload.append('title', data.title.trim()); // From RHF data
        if (data.description?.trim()) formDataPayload.append('description', data.description.trim()); // From RHF data
        
        // data.selectedFile comes from RHF, yup ensures it's present if required
        if (data.selectedFile) {
             formDataPayload.append('file', data.selectedFile);
        }
        // No need to check !selectedFile for new uploads, yup handles it.

        if (isEditMode && linkToEdit) {
          resultLink = await editAdminLinkFile(linkToEdit.id, formDataPayload);
        } else {
          // No !selectedFile check needed here, yup ensures it for new uploads
          resultLink = await uploadAdminLinkFile(formDataPayload);
        }
      }
      toast.success(`Link "${resultLink.title}" ${isEditMode ? 'updated' : 'added'} successfully!`); // Use toast
      
      if (!isEditMode) {
          resetFormDefaults(true); // Keep software selected
          // Explicitly reset version fields because they might not be covered by default reset if software is kept
          setValue('selectedVersionId', '');
          setValue('typedVersionString', '');
      }
      // Old setSelectedVersionId, setShowTypeVersionInput, setTypedVersionString removed

      if (isEditMode && onLinkUpdated) onLinkUpdated(resultLink);
      if (!isEditMode && onLinkAdded) onLinkAdded(resultLink);

    } catch (err: any) { 
      const message = err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} link.`;
      toast.error(message); // Use toast
    }
    finally { setIsLoading(false); }
  };
  
  // Optional error handler for handleSubmit, useful for global form error toasts if needed
  const onFormError = (formErrors: FieldErrors<LinkFormData>) => {
    console.error("Form validation errors:", formErrors);
    // Example: Find the first error message and toast it, or a generic message
    // const firstErrorMessage = Object.values(formErrors).map(e => e?.message).find(m => !!m);
    // if (firstErrorMessage) toast.error(firstErrorMessage); else 
    toast.error("Please correct the errors highlighted in the form.");
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

      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Link Source:</span>
        <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
                {/* RHF register for radio */}
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

      {/* Use watchedInputMode from RHF */}
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
    </form>
  );
};

export default AdminLinkEntryForm;