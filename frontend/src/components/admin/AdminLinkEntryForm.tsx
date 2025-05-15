// src/components/admin/AdminLinkEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Software, Link as LinkType, AddLinkPayload } from '../../types'; // Adjust paths
import { fetchSoftware, fetchVersionsForSoftware, addAdminLinkWithUrl, uploadAdminLinkFile } from '../../services/api'; // Adjust paths
import { useAuth } from '../../context/AuthContext'; // Adjust paths
import { UploadCloud, File as FileIcon, X } from 'lucide-react';

interface AdminLinkEntryFormProps {
  onLinkAdded?: (newLink: LinkType) => void;
}

type InputMode = 'url' | 'upload';

const AdminLinkEntryForm: React.FC<AdminLinkEntryFormProps> = ({ onLinkAdded }) => {
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>('');
  const [versionsList, setVersionsList] = useState<{id: number; version_number: string}[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(''); // Optional

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [externalUrl, setExternalUrl] = useState(''); // This is the 'url' if inputMode is 'url'
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingSoftwareOrVersions, setIsFetchingSoftwareOrVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, role } = useAuth();

  // Fetch software list
  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      setIsFetchingSoftwareOrVersions(true);
      fetchSoftware()
        .then(setSoftwareList)
        .catch(() => setError('Failed to load software list.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    }
  }, [isAuthenticated, role]);

  // Fetch versions when software selection changes
  useEffect(() => {
    if (selectedSoftwareId) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]);
      setSelectedVersionId(''); // Reset selected version
      fetchVersionsForSoftware(parseInt(selectedSoftwareId))
        .then(setVersionsList)
        .catch(() => setError('Failed to load versions for selected software.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setSelectedVersionId('');
    }
  }, [selectedSoftwareId]);

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
  
  const resetForm = () => {
    // setSelectedSoftwareId(''); // Consider if these should reset
    // setSelectedVersionId('');
    setTitle('');
    setDescription('');
    setExternalUrl('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoftwareId || !title) {
      setError("Software and Title are required for a link."); return;
    }
    if (inputMode === 'url' && !externalUrl.trim()) {
      setError("Please provide the external URL for the link."); return;
    }
    if (inputMode === 'upload' && !selectedFile) {
      setError("Please select a file to upload for the link."); return;
    }
    setError(null); setSuccessMessage(null); setIsLoading(true);

    try {
      let newLink: LinkType;
      const commonPayload = {
        software_id: parseInt(selectedSoftwareId),
        version_id: selectedVersionId ? parseInt(selectedVersionId) : null, // Send null if not selected
        title: title.trim(),
        description: description.trim() || undefined,
      };

      if (inputMode === 'url') {
        const payload: AddLinkPayload = {
          ...commonPayload,
          url: externalUrl.trim(),
          is_external_link: true,
        };
        newLink = await addAdminLinkWithUrl(payload);
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('file', selectedFile!);
        formData.append('software_id', selectedSoftwareId);
        if (selectedVersionId) formData.append('version_id', selectedVersionId);
        formData.append('title', title.trim() || selectedFile!.name);
        if (description.trim()) formData.append('description', description.trim());
        // is_external_link will be set to false by backend for file uploads

        newLink = await uploadAdminLinkFile(formData);
      }
      setSuccessMessage(`Link "${newLink.title}" added successfully!`);
      resetForm();
      if (onLinkAdded) onLinkAdded(newLink);
    } catch (err: any) { setError(err.message || "Failed to add link."); }
    finally { setIsLoading(false); }
  };

  if (!isAuthenticated || role !== 'admin') return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800">Add New Link</h3>
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      {/* Software Selection (Mandatory) */}
      <div>
        <label htmlFor="linkSoftware" className="block text-sm font-medium text-gray-700">Software*</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p>Loading software...</p> : (
          <select id="linkSoftware" value={selectedSoftwareId}
                  onChange={(e) => setSelectedSoftwareId(e.target.value)} required
                  disabled={isLoading || isFetchingSoftwareOrVersions}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="" disabled>Select Software</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      {/* Version Selection (Optional, enabled if software selected) */}
      <div>
        <label htmlFor="linkVersion" className="block text-sm font-medium text-gray-700">Version (Optional)</label>
        {isFetchingSoftwareOrVersions && selectedSoftwareId && !versionsList.length ? <p>Loading versions...</p> : (
          <select id="linkVersion" value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  disabled={isLoading || isFetchingSoftwareOrVersions || !selectedSoftwareId || versionsList.length === 0}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Select Version (if applicable)</option>
            {versionsList.map(v => <option key={v.id} value={v.id.toString()}>{v.version_number}</option>)}
          </select>
        )}
      </div>

      {/* Link Title */}
      <div>
        <label htmlFor="linkTitle" className="block text-sm font-medium text-gray-700">Link Title*</label>
        <input type="text" id="linkTitle" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isLoading}
               className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      {/* Input Mode Toggle (Provide Link / Upload File) */}
      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Link Source:</span>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="linkInputMode" value="url" checked={inputMode === 'url'}
                   onChange={() => setInputMode('url')} className="form-radio h-4 w-4 text-blue-600"/>
            <span>Provide External URL</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="linkInputMode" value="upload" checked={inputMode === 'upload'}
                   onChange={() => setInputMode('upload')} className="form-radio h-4 w-4 text-blue-600"/>
            <span>Upload File for this Link</span>
          </label>
        </div>
      </div>

      {/* Conditional Inputs based on Mode */}
      {inputMode === 'url' && (
        <div>
          <label htmlFor="linkExternalUrl" className="block text-sm font-medium text-gray-700">Link URL*</label>
          <input type="url" id="linkExternalUrl" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
                 placeholder="https://example.com/resource" required={inputMode === 'url'} disabled={isLoading}
                 className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
        </div>
      )}

      {inputMode === 'upload' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select File to Upload*</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                <label htmlFor="link-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a file</span>
                    <input id="link-file-upload" name="file" type="file" className="sr-only"
                        onChange={handleFileChange} ref={fileInputRef} required={inputMode === 'upload'} disabled={isLoading} />
                </label>
                <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">Allowed types...</p> {/* TODO: Populate from ALLOWED_EXTENSIONS */}
            </div>
          </div>
          {selectedFile && (
            <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md">
                <div className='flex items-center space-x-2 overflow-hidden'>
                    <FileIcon size={18} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{selectedFile.name}</span>
                </div>
                <button type="button" onClick={clearFileSelection} disabled={isLoading}
                        className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                    <X size={16} />
                </button>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <label htmlFor="linkDescription" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea id="linkDescription" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      <button type="submit" disabled={isLoading}
              className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
        {isLoading ? 'Adding Link...' : 'Add Link'}
      </button>
    </form>
  );
};

export default AdminLinkEntryForm;