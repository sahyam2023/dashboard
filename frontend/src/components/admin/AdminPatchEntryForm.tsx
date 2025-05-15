// src/components/admin/AdminPatchEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
// Ensure these types are correctly imported from your updated types/index.ts
import { Software, Patch as PatchType, AddPatchPayloadWithVersionString, EditPatchPayload } from '../../types';
import {
  fetchSoftware,
  addAdminPatchWithUrl, uploadAdminPatchFile,
  editAdminPatchWithUrl, editAdminPatchFile
} from '../../services/api'; // API functions should now use the new payloads
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, File as FileIconLucide, X } from 'lucide-react';

interface AdminPatchEntryFormProps {
  patchToEdit?: PatchType | null;
  onPatchAdded?: (newPatch: PatchType) => void;
  onPatchUpdated?: (updatedPatch: PatchType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';

const AdminPatchEntryForm: React.FC<AdminPatchEntryFormProps> = ({
  patchToEdit,
  onPatchAdded,
  onPatchUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!patchToEdit;

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>('');
  const [typedVersionString, setTypedVersionString] = useState('');

  const [patchName, setPatchName] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [description, setDescription] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSoftware, setIsFetchingSoftware] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingSoftware(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => setError('Failed to load software list.'))
        .finally(() => setIsFetchingSoftware(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (isEditMode && patchToEdit) {
      // patchToEdit.software_id should be the ID of the Software Product
      setSelectedSoftwareId(patchToEdit.software_id?.toString() || '');
      setTypedVersionString(patchToEdit.version_number || ''); // Pre-fill from patch's version_number
      setPatchName(patchToEdit.patch_name);
      setReleaseDate(patchToEdit.release_date ? patchToEdit.release_date.split('T')[0] : '');
      setDescription(patchToEdit.description || '');

      if (patchToEdit.is_external_link) {
        setInputMode('url');
        setExternalUrl(patchToEdit.download_link);
        setExistingFileName(null);
      } else {
        setInputMode('upload');
        setExternalUrl('');
        setExistingFileName(patchToEdit.original_filename_ref || patchToEdit.download_link.split('/').pop() || 'unknown_file');
      }
      setSelectedFile(null); // Important: always clear selected file on edit mode init
    } else {
      resetFormFields();
    }
  }, [isEditMode, patchToEdit]);

  const resetFormFields = (keepSoftware: boolean = false) => {
    if (!keepSoftware) setSelectedSoftwareId('');
    setTypedVersionString('');
    setPatchName('');
    setReleaseDate('');
    setDescription('');
    setExternalUrl('');
    setSelectedFile(null);
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoftwareId) { setError("Software Product must be selected."); return; }
    if (!typedVersionString.trim()) { setError("Version string must be provided."); return; }
    if (!patchName.trim()) { setError("Patch Name is required."); return; }
    if (inputMode === 'url' && !externalUrl.trim()) { setError("External URL is required for URL mode."); return; }
    if (inputMode === 'upload' && !selectedFile && !isEditMode) { setError("Please select a file to upload for new patch."); return; }
    if (inputMode === 'upload' && !selectedFile && isEditMode && patchToEdit?.is_external_link) {
        setError("Please select a file if changing from URL to Upload mode."); return;
    }

    setError(null); setSuccessMessage(null); setIsLoading(true);

    try {
      let resultPatch: PatchType;

      if (inputMode === 'url') {
        const payload: AddPatchPayloadWithVersionString | EditPatchPayload = {
          software_id: parseInt(selectedSoftwareId),
          typed_version_string: typedVersionString.trim(),
          patch_name: patchName.trim(),
          download_link: externalUrl.trim(), // download_link is the external URL here
          description: description.trim() || undefined,
          release_date: releaseDate || undefined,
          is_external_link: true, // Explicitly true for URL mode
        };

        if (isEditMode && patchToEdit) {
          // Construct specific EditPatchPayload, only sending changed fields could be an optimization
          // For simplicity, sending all current form values that map to EditPatchPayload fields
          const editData: EditPatchPayload = { ...payload }; // All fields from 'payload' are optional in EditPatchPayload
          resultPatch = await editAdminPatchWithUrl(patchToEdit.id, editData);
        } else {
          resultPatch = await addAdminPatchWithUrl(payload as AddPatchPayloadWithVersionString);
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', selectedSoftwareId);
        formData.append('typed_version_string', typedVersionString.trim());
        formData.append('patch_name', patchName.trim());
        if (releaseDate) formData.append('release_date', releaseDate);
        if (description.trim()) formData.append('description', description.trim());
        // is_external_link is false, handled by backend for file uploads

        if (selectedFile) {
          formData.append('file', selectedFile);
        }

        if (isEditMode && patchToEdit) {
          resultPatch = await editAdminPatchFile(patchToEdit.id, formData);
        } else {
          if (!selectedFile) {
             setError("A file is required for new patch uploads."); setIsLoading(false); return;
          }
          resultPatch = await uploadAdminPatchFile(formData);
        }
      }
      setSuccessMessage(`Patch "${resultPatch.patch_name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) resetFormFields(true);

      if (isEditMode && onPatchUpdated) onPatchUpdated(resultPatch);
      if (!isEditMode && onPatchAdded) onPatchAdded(resultPatch);

    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'add'} patch.`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated || role !== 'admin') return null;

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

      {/* Software Product Selection */}
      <div>
        <label htmlFor="patchSoftwareProduct" className="block text-sm font-medium text-gray-700">Software Product*</label>
        {isFetchingSoftware ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select id="patchSoftwareProduct" value={selectedSoftwareId}
                  onChange={(e) => setSelectedSoftwareId(e.target.value)} required
                  disabled={isLoading || isFetchingSoftware}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="" disabled>Select Software Product</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      {/* Typed Version String Input */}
      <div>
        <label htmlFor="typedVersionString" className="block text-sm font-medium text-gray-700">Version String*</label>
        <input
          type="text"
          id="typedVersionString"
          value={typedVersionString}
          onChange={(e) => setTypedVersionString(e.target.value)}
          required
          disabled={isLoading || !selectedSoftwareId}
          placeholder="e.g., 1.2.3, 2024.Q1-final"
          className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
        />
         <p className="mt-1 text-xs text-gray-500">This version will be created for the selected software if it doesn't exist.</p>
      </div>

      {/* Patch Name */}
      <div>
        <label htmlFor="patchName" className="block text-sm font-medium text-gray-700">Patch Name*</label>
        <input type="text" id="patchName" value={patchName} onChange={(e) => setPatchName(e.target.value)} required disabled={isLoading}
               className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>
      
      {/* Release Date */}
      <div>
        <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">Release Date</label>
        <input type="date" id="releaseDate" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} disabled={isLoading}
               className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      {/* Input Mode Toggle */}
      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Patch Source:</span>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="patchInputMode" value="url" checked={inputMode === 'url'}
                   onChange={() => setInputMode('url')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
             <span className="flex items-center"><LinkIconLucide size={16} className="mr-1 text-gray-600"/>Provide External Link</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="patchInputMode" value="upload" checked={inputMode === 'upload'}
                   onChange={() => setInputMode('upload')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
            <span className="flex items-center"><UploadCloud size={16} className="mr-1 text-gray-600"/>Upload File</span>
          </label>
        </div>
      </div>

      {/* Conditional Inputs for URL or File Upload */}
      {inputMode === 'url' && (
        <div>
          <label htmlFor="patchExternalUrl" className="block text-sm font-medium text-gray-700">External Download URL*</label>
          <input type="url" id="patchExternalUrl" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
                 placeholder="https://example.com/patch.exe" required={inputMode === 'url'} disabled={isLoading}
                 className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
        </div>
      )}
      {inputMode === 'upload' && (
         <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isEditMode && existingFileName && !selectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 transition-colors">
            <div className="space-y-1 text-center">
                <FileIconLucide className="mx-auto h-12 w-12 text-gray-400" />
                 <div className="flex text-sm text-gray-600">
                    <label htmlFor="patch-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                        <span>{selectedFile ? 'Change file' : 'Upload a file'}</span>
                        <input id="patch-file-upload" name="file" type="file" className="sr-only"
                            onChange={handleFileChange} ref={fileInputRef} 
                            // File required for new items in upload mode, or if switching from URL to file in edit mode
                            required={inputMode === 'upload' && (!isEditMode || (isEditMode && patchToEdit?.is_external_link && !selectedFile))}
                            disabled={isLoading} />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">EXE, MSI, ZIP, etc.</p>
            </div>
          </div>
          {(selectedFile || (isEditMode && existingFileName)) && ( // Show if new file selected OR in edit mode with an existing file
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
                <div className='flex items-center space-x-2 overflow-hidden'>
                    <FileIconLucide size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">
                      {selectedFile ? selectedFile.name : existingFileName}
                    </span>
                    {isEditMode && existingFileName && !selectedFile && <span className="text-xs text-gray-500 ml-2">(current)</span>}
                </div>
                {selectedFile && (
                  <button type="button" onClick={clearFileSelection} disabled={isLoading}
                          className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                      <X size={16} />
                  </button>
                )}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <label htmlFor="patchDescription" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea id="patchDescription" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      <div className="flex space-x-3">
        <button type="submit" disabled={isLoading}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Patch' : 'Add Patch')}
        </button>
        {isEditMode && onCancelEdit && (
            <button type="button" onClick={onCancelEdit} disabled={isLoading}
                    className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                Cancel
            </button>
        )}
      </div>
    </form>
  );
};

export default AdminPatchEntryForm;