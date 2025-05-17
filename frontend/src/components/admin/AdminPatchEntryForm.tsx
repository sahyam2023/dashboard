// src/components/admin/AdminPatchEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Software,
  Patch as PatchType,
  SoftwareVersion,
  AddPatchPayloadFlexible,
  EditPatchPayloadFlexible
} from '../../types'; // Ensure these types are correct in types/index.ts
import {
  fetchSoftware,
  fetchVersionsForSoftware, // Re-added for the dropdown
  addAdminPatchWithUrl, uploadAdminPatchFile,
  editAdminPatchWithUrl, editAdminPatchFile
} from '../../services/api'; // API functions use flexible payloads
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react'; // Changed File to FileText to avoid conflict

interface AdminPatchEntryFormProps {
  patchToEdit?: PatchType | null;
  onPatchAdded?: (newPatch: PatchType) => void;
  onPatchUpdated?: (updatedPatch: PatchType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';
const CREATE_NEW_VERSION_SENTINEL = "CREATE_NEW_VERSION_SENTINEL_VALUE"; // Unique value

const AdminPatchEntryForm: React.FC<AdminPatchEntryFormProps> = ({
  patchToEdit,
  onPatchAdded,
  onPatchUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!patchToEdit;

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>('');

  // --- Version Handling States ---
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(''); // From dropdown
  const [showTypeVersionInput, setShowTypeVersionInput] = useState(false);
  const [typedVersionString, setTypedVersionString] = useState<string>('');
  // --- End Version Handling States ---

  const [patchName, setPatchName] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [description, setDescription] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();

  // Fetch software list for the product dropdown
  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => setError('Failed to load software list.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  // Fetch versions for the version dropdown when a software product is selected
  useEffect(() => {
    if (selectedSoftwareId) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setSelectedVersionId('');
      setTypedVersionString('');
      setShowTypeVersionInput(false);
      fetchVersionsForSoftware(parseInt(selectedSoftwareId))
        .then(setVersionsList)
        .catch(() => setError('Failed to load versions.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setSelectedVersionId('');
      setTypedVersionString('');
      setShowTypeVersionInput(false);
    }
  }, [selectedSoftwareId]);

  // Pre-fill form when in edit mode
  // Pre-fill form when in edit mode
useEffect(() => {
  if (isEditMode && patchToEdit) {
    setSelectedSoftwareId(patchToEdit.software_id.toString());
    setPatchName(patchToEdit.patch_name);
    setReleaseDate(patchToEdit.release_date ? patchToEdit.release_date.split('T')[0] : '');
    setDescription(patchToEdit.description || '');

    // Pre-fill version:
    // This effect might run before versionsList is populated for the selectedSoftwareId.
    // So, we also depend on versionsList.
    // Ensure selectedSoftwareId is actually the one from patchToEdit for this block
    if (patchToEdit.version_id && selectedSoftwareId === patchToEdit.software_id.toString()) {
        const existingVersionInList = versionsList.find(v => v.id === patchToEdit.version_id);
        if (existingVersionInList) {
            setSelectedVersionId(patchToEdit.version_id.toString());
            setTypedVersionString(patchToEdit.version_number); // Reflect current version string
            setShowTypeVersionInput(false);
        } else if (versionsList.length > 0) { // versionsList loaded but ID not found
            setSelectedVersionId(CREATE_NEW_VERSION_SENTINEL);
            setTypedVersionString(patchToEdit.version_number);
            setShowTypeVersionInput(true);
        } else {
            // versionsList is not yet loaded, or empty for the current selectedSoftwareId.
            // Prime typedVersionString.
            // selectedVersionId will be set when versionsList loads if there's a match.
            setTypedVersionString(patchToEdit.version_number);
            // If no version_id, it's likely a new version is intended for this patch
            if (!patchToEdit.version_id) {
                setSelectedVersionId(CREATE_NEW_VERSION_SENTINEL);
                setShowTypeVersionInput(true);
            }
        }
    } else if (patchToEdit.version_number && selectedSoftwareId === patchToEdit.software_id.toString()) { // Fallback if no version_id but software matches
        setTypedVersionString(patchToEdit.version_number);
        setSelectedVersionId(CREATE_NEW_VERSION_SENTINEL); // Assume it was custom if no ID
        setShowTypeVersionInput(true);
    } else if (patchToEdit.version_number && selectedSoftwareId !== patchToEdit.software_id.toString()){
        // This case could happen if setSelectedSoftwareId(patchToEdit.software_id.toString()) hasn't fully propagated
        // or if there's a brief mismatch. Priming typedVersionString is safe.
        setTypedVersionString(patchToEdit.version_number);
    }


    if (patchToEdit.is_external_link) {
      setInputMode('url');
      setExternalUrl(patchToEdit.download_link);
      setExistingFileName(null);
    } else {
      setInputMode('upload');
      setExternalUrl('');
      setExistingFileName(patchToEdit.original_filename_ref || patchToEdit.download_link.split('/').pop() || 'unknown_file');
    }
    setSelectedFile(null);
  } else if (!isEditMode) {
    // If in "Add New Patch" mode:
    // - If selectedSoftwareId is already set (user picked one), reset other fields but keep software.
    // - If selectedSoftwareId is not set (e.g., initial load, or after cancelling edit that cleared it), do a full reset.
    resetFormFields(!!selectedSoftwareId); // Pass true to keepSoftware if selectedSoftwareId is truthy
  }
  // Add selectedSoftwareId to dependencies as it's read within the effect
}, [isEditMode, patchToEdit, versionsList, selectedSoftwareId]);// versionsList is crucial for pre-selection

  const resetFormFields = (keepSoftware: boolean = false) => {
    if (!keepSoftware) {
      setSelectedSoftwareId(''); // This will trigger version list reset via useEffect
    } else {
      // If keeping software, reset version-specific parts for a new entry under same software
      setSelectedVersionId('');
      setShowTypeVersionInput(false);
      setTypedVersionString('');
    }
    setPatchName('');
    setReleaseDate('');
    setDescription('');
    setInputMode('url');
    setExternalUrl('');
    setSelectedFile(null);
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    // setSuccessMessage(null); // Keep success for a bit?
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setExistingFileName(null);
      setError(null); setSuccessMessage(null);
    }
  };
  
  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isEditMode && patchToEdit && !patchToEdit.is_external_link) {
        setExistingFileName(patchToEdit.original_filename_ref || patchToEdit.download_link.split('/').pop() || 'unknown_file');
    }
  };

  const handleVersionSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedVersionId(value);
    if (value === CREATE_NEW_VERSION_SENTINEL) {
      setShowTypeVersionInput(true);
      setTypedVersionString(''); // Clear for new input
    } else {
      setShowTypeVersionInput(false);
      const selectedFromList = versionsList.find(v => v.id.toString() === value);
      setTypedVersionString(selectedFromList ? selectedFromList.version_number : '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoftwareId) { setError("Software Product must be selected."); return; }
    if (!patchName.trim()) { setError("Patch Name is required."); return; }

    let finalVersionId: number | undefined = undefined;
    let finalTypedVersionString: string | undefined = undefined;

    if (showTypeVersionInput && typedVersionString.trim()) {
      finalTypedVersionString = typedVersionString.trim();
    } else if (selectedVersionId && selectedVersionId !== CREATE_NEW_VERSION_SENTINEL && selectedVersionId !== "") {
      finalVersionId = parseInt(selectedVersionId);
    } else {
      setError("A version (either selected or newly typed) is required for a patch."); return;
    }
    // Specific check if "Enter New" was selected but no string typed
    if (selectedVersionId === CREATE_NEW_VERSION_SENTINEL && !typedVersionString.trim()){
        setError("Please enter the new version string when 'Enter New Version' is selected."); return;
    }

    if (inputMode === 'url' && !externalUrl.trim()) { setError("External URL is required for URL mode."); return; }
    if (inputMode === 'upload' && !selectedFile && !isEditMode) { setError("Please select a file for new patch."); return; }
    if (inputMode === 'upload' && !selectedFile && isEditMode && patchToEdit?.is_external_link) {
        setError("Please select a file if changing from URL to Upload mode."); return;
    }

    setError(null); setSuccessMessage(null); setIsLoading(true);

    const basePayload: Partial<AddPatchPayloadFlexible | EditPatchPayloadFlexible> = {
      software_id: parseInt(selectedSoftwareId),
      patch_name: patchName.trim(),
      description: description.trim() || undefined,
      release_date: releaseDate || undefined,
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    try {
      let resultPatch: PatchType;
      if (inputMode === 'url') {
        const payloadForUrl = { 
            ...basePayload, 
            download_link: externalUrl.trim(), 
            is_external_link: true 
        } as AddPatchPayloadFlexible | EditPatchPayloadFlexible; // Ensure type compatibility

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchWithUrl(patchToEdit.id, payloadForUrl as EditPatchPayloadFlexible);
        } else {
          resultPatch = await addAdminPatchWithUrl(payloadForUrl as AddPatchPayloadFlexible);
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', selectedSoftwareId);
        if (finalVersionId) formData.append('version_id', finalVersionId.toString());
        if (finalTypedVersionString) formData.append('typed_version_string', finalTypedVersionString);
        
        formData.append('patch_name', patchName.trim());
        if (releaseDate) formData.append('release_date', releaseDate);
        if (description.trim()) formData.append('description', description.trim());
        if (selectedFile) formData.append('file', selectedFile);

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchFile(patchToEdit.id, formData);
        } else {
          if (!selectedFile) { setError("A file is required for new patch uploads."); setIsLoading(false); return; }
          resultPatch = await uploadAdminPatchFile(formData);
        }
      }
      setSuccessMessage(`Patch "${resultPatch.patch_name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) {
          resetFormFields(true);
          setSelectedVersionId(''); // Ensure version specific fields are fully reset for add mode
          setShowTypeVersionInput(false);
          setTypedVersionString('');
      }

      if (isEditMode && onPatchUpdated) onPatchUpdated(resultPatch);
      if (!isEditMode && onPatchAdded) onPatchAdded(resultPatch);

    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} patch.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated || role !== 'admin') return null;
  console.log("Current softwareList:", softwareList);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
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
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      <div>
        <label htmlFor="patchSoftwareProduct" className="block text-sm font-medium text-gray-700">Software Product*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select id="patchSoftwareProduct" value={selectedSoftwareId}
                  onChange={(e) => {
    console.log("Software selected, new value:", e.target.value);
    setSelectedSoftwareId(e.target.value);
  }} required
                  disabled={isLoading || (isFetchingSoftwareOrVersions && !softwareList.length)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="" disabled>Select Software Product</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="patchVersionSelect" className="block text-sm font-medium text-gray-700">Version*</label>
        <div className="mt-1">
          <select
            id="patchVersionSelect"
            value={selectedVersionId}
            onChange={handleVersionSelectionChange}
            disabled={isLoading || isFetchingSoftwareOrVersions || !selectedSoftwareId }
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="" disabled={versionsList.length > 0 && selectedSoftwareId !== ''}>
              {isFetchingSoftwareOrVersions && selectedSoftwareId ? 'Loading versions...' : 'Select Existing Version'}
            </option>
            {versionsList.map(v => (
              <option key={v.id} value={v.id.toString()}>{v.version_number}</option>
            ))}
            <option value={CREATE_NEW_VERSION_SENTINEL}>Enter New Version String...</option>
          </select>
        </div>
        {showTypeVersionInput && (
          <div className="mt-2">
            <label htmlFor="patchTypedVersion" className="block text-xs font-medium text-gray-600">
              {selectedVersionId === CREATE_NEW_VERSION_SENTINEL ? "New Version String*:" : "Version String (review/edit):"}
            </label>
            <input
              type="text"
              id="patchTypedVersion"
              value={typedVersionString}
              onChange={(e) => setTypedVersionString(e.target.value)}
              placeholder="e.g., 2.5.1-hotfix"
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              required={showTypeVersionInput && selectedVersionId === CREATE_NEW_VERSION_SENTINEL}
            />
             <p className="mt-1 text-xs text-gray-500">This version will be created for the selected software if it doesn't exist.</p>
          </div>
        )}
      </div>

      <div><label htmlFor="patchName" className="block text-sm font-medium text-gray-700">Patch Name*</label><input type="text" id="patchName" value={patchName} onChange={(e) => setPatchName(e.target.value)} required disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>
      <div><label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">Release Date</label><input type="date" id="releaseDate" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>
      <div className="my-4"><span className="block text-sm font-medium text-gray-700 mb-2">Patch Source:</span><div className="flex items-center space-x-4"><label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="patchInputMode" value="url" checked={inputMode === 'url'} onChange={() => setInputMode('url')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/><span className="flex items-center"><LinkIconLucide size={16} className="mr-1 text-gray-600"/>Provide External Link</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="patchInputMode" value="upload" checked={inputMode === 'upload'} onChange={() => setInputMode('upload')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/><span className="flex items-center"><UploadCloud size={16} className="mr-1 text-gray-600"/>Upload File</span></label></div></div>
      {inputMode === 'url' && (<div><label htmlFor="patchExternalUrl" className="block text-sm font-medium text-gray-700">External Download URL*</label><input type="url" id="patchExternalUrl" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://example.com/patch.exe" required={inputMode === 'url'} disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>)}
      {inputMode === 'upload' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">{isEditMode && existingFileName && !selectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}</label><div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 transition-colors"><div className="space-y-1 text-center"><FileIconLucide className="mx-auto h-12 w-12 text-gray-400" /><div className="flex text-sm text-gray-600"><label htmlFor="patch-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"><span>{selectedFile ? 'Change file' : 'Upload a file'}</span><input id="patch-file-upload" name="file" type="file" className="sr-only" onChange={handleFileChange} ref={fileInputRef} required={inputMode === 'upload' && (!isEditMode || (isEditMode && patchToEdit?.is_external_link && !selectedFile))} disabled={isLoading} /></label><p className="pl-1">or drag and drop</p></div><p className="text-xs text-gray-500">EXE, MSI, ZIP, etc.</p></div></div>{(selectedFile || (isEditMode && existingFileName)) && (<div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md"><div className='flex items-center space-x-2 overflow-hidden'><FileIconLucide size={18} className="text-gray-500 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{selectedFile ? selectedFile.name : existingFileName}</span>{isEditMode && existingFileName && !selectedFile && <span className="text-xs text-gray-500 ml-2">(current)</span>}</div>{selectedFile && (<button type="button" onClick={clearFileSelection} disabled={isLoading} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200"><X size={16} /></button>)}</div>)}</div>)}
      <div><label htmlFor="patchDescription" className="block text-sm font-medium text-gray-700">Description</label><textarea id="patchDescription" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>
      <div className="flex space-x-3"><button type="submit" disabled={isLoading} className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">{isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Patch' : 'Add Patch')}</button>{isEditMode && onCancelEdit && (<button type="button" onClick={onCancelEdit} disabled={isLoading} className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Cancel</button>)}</div>
    </form>
  );
};

export default AdminPatchEntryForm;