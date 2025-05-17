import React, { useState, useEffect, useRef } from 'react';
import {
  Software,
  Link as LinkType,
  SoftwareVersion, // For version dropdown
  AddLinkPayloadFlexible, // Use the flexible payload
  EditLinkPayloadFlexible  // Use the flexible payload
} from '../../types'; // Ensure these are correct in types/index.ts
import {
  fetchSoftware,
  fetchVersionsForSoftware, // Needed for the dropdown
  addAdminLinkWithUrl, uploadAdminLinkFile,
  editAdminLinkWithUrl, editAdminLinkFile
} from '../../services/api'; // API functions use flexible payloads
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, FileText as FileIconLucide, X } from 'lucide-react'; // Changed File to FileText

interface AdminLinkEntryFormProps {
  linkToEdit?: LinkType | null;
  onLinkAdded?: (newLink: LinkType) => void;
  onLinkUpdated?: (updatedLink: LinkType) => void;
  onCancelEdit?: () => void;
}

type InputMode = 'url' | 'upload';
const CREATE_NEW_VERSION_SENTINEL = "CREATE_NEW_VERSION_SENTINEL_VALUE"; // Unique value

const AdminLinkEntryForm: React.FC<AdminLinkEntryFormProps> = ({
  linkToEdit,
  onLinkAdded,
  onLinkUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!linkToEdit;

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>('');

  // --- Version Handling States (Version is MANDATORY for Links now) ---
  const [versionsList, setVersionsList] = useState<SoftwareVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(''); // From dropdown
  const [showTypeVersionInput, setShowTypeVersionInput] = useState(false);
  const [typedVersionString, setTypedVersionString] = useState<string>('');
  // --- End Version Handling States ---

  const [title, setTitle] = useState('');
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

  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => setError('Failed to load software list.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (selectedSoftwareId) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setSelectedVersionId('');
      setTypedVersionString('');
      setShowTypeVersionInput(false);
      fetchVersionsForSoftware(parseInt(selectedSoftwareId))
        .then(setVersionsList)
        .catch(() => setError('Failed to load versions for selected software.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setSelectedVersionId('');
      setTypedVersionString('');
      setShowTypeVersionInput(false);
    }
  }, [selectedSoftwareId]);

  useEffect(() => {
    if (isEditMode && linkToEdit) {
      setSelectedSoftwareId(linkToEdit.software_id.toString());
      setTitle(linkToEdit.title);
      setDescription(linkToEdit.description || '');

      // Pre-fill version (mandatory for links)
      if (linkToEdit.version_id && selectedSoftwareId === linkToEdit.software_id.toString() && versionsList.length > 0) {
        const existingVersionInList = versionsList.find(v => v.id === linkToEdit.version_id);
        if (existingVersionInList) {
          setSelectedVersionId(linkToEdit.version_id.toString());
          setTypedVersionString(linkToEdit.version_number); // version_number is now non-null for Link type
          setShowTypeVersionInput(false);
        } else {
          setSelectedVersionId(CREATE_NEW_VERSION_SENTINEL);
          setTypedVersionString(linkToEdit.version_number);
          setShowTypeVersionInput(true);
        }
      } else if (linkToEdit.version_number) { // Fallback if versionsList not ready
          setTypedVersionString(linkToEdit.version_number);
          if (!versionsList.find(v => v.id === linkToEdit.version_id)) {
              setSelectedVersionId(CREATE_NEW_VERSION_SENTINEL);
              setShowTypeVersionInput(true);
          }
      }


      if (linkToEdit.is_external_link) {
        setInputMode('url');
        setExternalUrl(linkToEdit.url);
        setExistingFileName(null);
      } else {
        setInputMode('upload');
        setExternalUrl('');
        setExistingFileName(linkToEdit.original_filename_ref || linkToEdit.url.split('/').pop() || 'unknown_file');
      }
      setSelectedFile(null);
    } else if (!isEditMode) {
      resetFormFields(!!selectedSoftwareId);
  }
}, [isEditMode, linkToEdit, versionsList, selectedSoftwareId]);


  const resetFormFields = (keepSoftware: boolean = false) => {
    if (!keepSoftware) {
      setSelectedSoftwareId('');
    } else {
        if (!isEditMode) {
            setSelectedVersionId('');
            setShowTypeVersionInput(false);
            setTypedVersionString('');
        }
    }
    setTitle('');
    setDescription('');
    setInputMode('url');
    setExternalUrl('');
    setSelectedFile(null);
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setError(null); setSuccessMessage(null);
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleVersionSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedVersionId(value);
    if (value === CREATE_NEW_VERSION_SENTINEL) {
      setShowTypeVersionInput(true);
      setTypedVersionString('');
    } else {
      setShowTypeVersionInput(false);
      const selectedFromList = versionsList.find(v => v.id.toString() === value);
      setTypedVersionString(selectedFromList ? selectedFromList.version_number : '');
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoftwareId) { setError("Software Product must be selected."); return; }
    if (!title.trim()) { setError("Link Title is required."); return; }

    let finalVersionId: number | undefined = undefined;
    let finalTypedVersionString: string | undefined = undefined;

    if (showTypeVersionInput && typedVersionString.trim()) {
      finalTypedVersionString = typedVersionString.trim();
    } else if (selectedVersionId && selectedVersionId !== CREATE_NEW_VERSION_SENTINEL && selectedVersionId !== "") {
      finalVersionId = parseInt(selectedVersionId);
    } else {
      // Version is MANDATORY for links now
      setError("A version (either selected or newly typed) is required for a link."); return;
    }
    if (selectedVersionId === CREATE_NEW_VERSION_SENTINEL && !typedVersionString.trim()){
        setError("Please enter the new version string when 'Enter New Version' is selected."); return;
    }

    if (inputMode === 'url' && !externalUrl.trim()) { setError("External URL is required for URL mode."); return; }
    if (inputMode === 'upload' && !selectedFile && !isEditMode) { setError("Please select a file for new link."); return; }
    if (inputMode === 'upload' && !selectedFile && isEditMode && linkToEdit?.is_external_link) {
        setError("Please select a file if changing from URL to Upload mode."); return;
    }

    setError(null); setSuccessMessage(null); setIsLoading(true);

    const basePayload: Partial<AddLinkPayloadFlexible | EditLinkPayloadFlexible> = {
      software_id: parseInt(selectedSoftwareId),
      title: title.trim(),
      description: description.trim() || undefined,
    };
    if (finalVersionId) basePayload.version_id = finalVersionId;
    if (finalTypedVersionString) basePayload.typed_version_string = finalTypedVersionString;

    try {
      let resultLink: LinkType;
      if (inputMode === 'url') {
        const payloadForUrl = { 
            ...basePayload, 
            url: externalUrl.trim(), 
            is_external_link: true 
        } as AddLinkPayloadFlexible | EditLinkPayloadFlexible;

        if (isEditMode && linkToEdit) {
          resultLink = await editAdminLinkWithUrl(linkToEdit.id, payloadForUrl as EditLinkPayloadFlexible);
        } else {
          resultLink = await addAdminLinkWithUrl(payloadForUrl as AddLinkPayloadFlexible);
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', selectedSoftwareId);
        if (finalVersionId) formData.append('version_id', finalVersionId.toString());
        if (finalTypedVersionString) formData.append('typed_version_string', finalTypedVersionString);
        
        formData.append('title', title.trim());
        if (description.trim()) formData.append('description', description.trim());
        if (selectedFile) formData.append('file', selectedFile);

        if (isEditMode && linkToEdit) {
          resultLink = await editAdminLinkFile(linkToEdit.id, formData);
        } else {
          if (!selectedFile) { setError("A file is required for new link uploads."); setIsLoading(false); return; }
          resultLink = await uploadAdminLinkFile(formData);
        }
      }
      setSuccessMessage(`Link "${resultLink.title}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) {
          resetFormFields(true);
          setSelectedVersionId('');
          setShowTypeVersionInput(false);
          setTypedVersionString('');
      }

      if (isEditMode && onLinkUpdated) onLinkUpdated(resultLink);
      if (!isEditMode && onLinkAdded) onLinkAdded(resultLink);

    } catch (err: any) { setError(err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} link.`); }
    finally { setIsLoading(false); }
  };

  if (!isAuthenticated || role !== 'admin') return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <div className="flex justify-between items-center"> <h3 className="text-xl font-semibold text-gray-800"> {isEditMode ? 'Edit Link' : 'Add New Link'} </h3> {isEditMode && onCancelEdit && ( <button type="button" onClick={onCancelEdit} className="text-sm text-gray-600 hover:text-gray-800"> Cancel </button> )} </div> {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>} {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      <div>
        <label htmlFor="linkSoftware" className="block text-sm font-medium text-gray-700">Software Product*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select id="linkSoftware" value={selectedSoftwareId}
                  onChange={(e) => setSelectedSoftwareId(e.target.value)} required
                  disabled={isLoading || (isFetchingSoftwareOrVersions && !softwareList.length)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="" disabled>Select Software Product</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="linkVersionSelect" className="block text-sm font-medium text-gray-700">Version*</label>
        <div className="mt-1">
          <select
            id="linkVersionSelect"
            value={selectedVersionId}
            onChange={handleVersionSelectionChange}
            disabled={isLoading || isFetchingSoftwareOrVersions || !selectedSoftwareId}
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
            <label htmlFor="linkTypedVersion" className="block text-xs font-medium text-gray-600">
              {selectedVersionId === CREATE_NEW_VERSION_SENTINEL ? "New Version String*:" : "Version String (review/edit):"}
            </label>
            <input
              type="text"
              id="linkTypedVersion"
              value={typedVersionString}
              onChange={(e) => setTypedVersionString(e.target.value)}
              placeholder="e.g., 1.2.4-final"
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              required={showTypeVersionInput && selectedVersionId === CREATE_NEW_VERSION_SENTINEL}
            />
            <p className="mt-1 text-xs text-gray-500">This version will be created for the selected software if it doesn't exist.</p>
          </div>
        )}
      </div>
      
      <div><label htmlFor="linkTitle" className="block text-sm font-medium text-gray-700">Link Title*</label><input type="text" id="linkTitle" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>
      <div className="my-4"><span className="block text-sm font-medium text-gray-700 mb-2">Link Source:</span><div className="flex items-center space-x-4"><label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="linkInputMode" value="url" checked={inputMode === 'url'} onChange={() => setInputMode('url')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/><span className="flex items-center"><LinkIconLucide size={16} className="mr-1 text-gray-600"/>Provide External URL</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="linkInputMode" value="upload" checked={inputMode === 'upload'} onChange={() => setInputMode('upload')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/><span className="flex items-center"><UploadCloud size={16} className="mr-1 text-gray-600"/>Upload File for this Link</span></label></div></div>
      {inputMode === 'url' && (<div><label htmlFor="linkExternalUrl" className="block text-sm font-medium text-gray-700">Link URL*</label><input type="url" id="linkExternalUrl" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://example.com/resource" required={inputMode === 'url'} disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>)}
      {inputMode === 'upload' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">{isEditMode && existingFileName && !selectedFile ? 'Replace File (Optional)' : 'Select File to Upload*'}</label><div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 transition-colors"><div className="space-y-1 text-center"><FileIconLucide className="mx-auto h-12 w-12 text-gray-400" /><div className="flex text-sm text-gray-600"><label htmlFor="link-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"><span>{selectedFile ? 'Change file' : 'Upload a file'}</span><input id="link-file-upload" name="file" type="file" className="sr-only" onChange={handleFileChange} ref={fileInputRef} required={inputMode === 'upload' && (!isEditMode || (isEditMode && linkToEdit?.is_external_link && !selectedFile))} disabled={isLoading} /></label><p className="pl-1">or drag and drop</p></div><p className="text-xs text-gray-500">Any file type relevant for links.</p></div></div>{(selectedFile || (isEditMode && existingFileName)) && (<div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md"><div className='flex items-center space-x-2 overflow-hidden'><FileIconLucide size={18} className="text-gray-500 flex-shrink-0" /><span className="text-sm text-gray-700 truncate">{selectedFile ? selectedFile.name : existingFileName}</span>{isEditMode && existingFileName && !selectedFile && <span className="text-xs text-gray-500 ml-2">(current)</span>}</div>{selectedFile && (<button type="button" onClick={clearFileSelection} disabled={isLoading} className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200"><X size={16} /></button>)}</div>)}</div>)}
      <div><label htmlFor="linkDescription" className="block text-sm font-medium text-gray-700">Description</label><textarea id="linkDescription" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/></div>
      <div className="flex space-x-3"><button type="submit" disabled={isLoading} className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">{isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Link' : 'Add Link')}</button>{isEditMode && onCancelEdit && (<button type="button" onClick={onCancelEdit} disabled={isLoading} className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">Cancel</button>)}</div>
    </form>
  );
};

export default AdminLinkEntryForm;