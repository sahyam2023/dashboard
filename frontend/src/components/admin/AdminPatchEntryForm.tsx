// src/components/admin/AdminPatchEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Software, Patch as PatchType, AddPatchPayload } from '../../types'; // Adjust paths
import { fetchSoftware, fetchVersionsForSoftware, addAdminPatchWithUrl, uploadAdminPatchFile } from '../../services/api'; // Adjust paths
import { useAuth } from '../../context/AuthContext'; // Adjust paths
import { UploadCloud, File as FileIcon, X } from 'lucide-react';

interface AdminPatchEntryFormProps {
  onPatchAdded?: (newPatch: PatchType) => void;
}

type InputMode = 'url' | 'upload';

const AdminPatchEntryForm: React.FC<AdminPatchEntryFormProps> = ({ onPatchAdded }) => {
  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareIdForVersions, setSelectedSoftwareIdForVersions] = useState<string>('');
  const [versionsList, setVersionsList] = useState<{id: number; version_number: string}[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  const [patchName, setPatchName] = useState('');
  const [releaseDate, setReleaseDate] = useState(''); // Store as YYYY-MM-DD string
  const [description, setDescription] = useState('');

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [externalUrl, setExternalUrl] = useState('');
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
    if (selectedSoftwareIdForVersions) {
      setIsFetchingSoftwareOrVersions(true);
      setVersionsList([]); // Clear previous versions
      setSelectedVersionId(''); // Reset selected version
      fetchVersionsForSoftware(parseInt(selectedSoftwareIdForVersions))
        .then(setVersionsList)
        .catch(() => setError('Failed to load versions for selected software.'))
        .finally(() => setIsFetchingSoftwareOrVersions(false));
    } else {
      setVersionsList([]);
      setSelectedVersionId('');
    }
  }, [selectedSoftwareIdForVersions]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => { /* ... same as AdminDocumentEntryForm ... */ };
  const clearFileSelection = () => { /* ... same as AdminDocumentEntryForm ... */ };
  const resetForm = () => {
    setPatchName(''); setReleaseDate(''); setDescription('');
    setExternalUrl(''); setSelectedFile(null);
    // Optionally reset software/version selections or keep them for convenience
    // setSelectedSoftwareIdForVersions('');
    // setSelectedVersionId('');
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVersionId || !patchName) {
      setError("Version and Patch Name are required."); return;
    }
    if (inputMode === 'url' && !externalUrl.trim()) {
      setError("Please provide the external URL."); return;
    }
    if (inputMode === 'upload' && !selectedFile) {
      setError("Please select a file to upload."); return;
    }
    setError(null); setSuccessMessage(null); setIsLoading(true);

    try {
      let newPatch: PatchType;
      if (inputMode === 'url') {
        const payload: AddPatchPayload = {
          version_id: parseInt(selectedVersionId),
          patch_name: patchName.trim(),
          download_link: externalUrl.trim(),
          is_external_link: true,
          description: description.trim() || undefined,
          release_date: releaseDate || undefined,
        };
        newPatch = await addAdminPatchWithUrl(payload);
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('file', selectedFile!);
        formData.append('version_id', selectedVersionId);
        formData.append('patch_name', patchName.trim() || selectedFile!.name);
        if (releaseDate) formData.append('release_date', releaseDate);
        if (description.trim()) formData.append('description', description.trim());
        newPatch = await uploadAdminPatchFile(formData);
      }
      setSuccessMessage(`Patch "${newPatch.patch_name}" added successfully!`);
      resetForm();
      if (onPatchAdded) onPatchAdded(newPatch);
    } catch (err: any) { setError(err.message || "Failed to add patch."); }
    finally { setIsLoading(false); }
  };

  if (!isAuthenticated || role !== 'admin') return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-lg border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800">Add New Patch</h3>
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      {/* Software Selection for Version Filtering */}
      <div>
        <label htmlFor="patchSoftware" className="block text-sm font-medium text-gray-700">Software* (to select version)</label>
        {isFetchingSoftwareOrVersions && !softwareList.length ? <p>Loading software...</p> : (
          <select id="patchSoftware" value={selectedSoftwareIdForVersions}
                  onChange={(e) => setSelectedSoftwareIdForVersions(e.target.value)} required
                  disabled={isLoading || isFetchingSoftwareOrVersions} className="mt-1 block w-full ...">
            <option value="" disabled>Select Software</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      {/* Version Selection */}
      <div>
        <label htmlFor="patchVersion" className="block text-sm font-medium text-gray-700">Version*</label>
        {isFetchingSoftwareOrVersions && selectedSoftwareIdForVersions && !versionsList.length ? <p>Loading versions...</p> : (
          <select id="patchVersion" value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)} required
                  disabled={isLoading || isFetchingSoftwareOrVersions || !selectedSoftwareIdForVersions || versionsList.length === 0}
                  className="mt-1 block w-full ...">
            <option value="" disabled>Select Version</option>
            {versionsList.map(v => <option key={v.id} value={v.id.toString()}>{v.version_number}</option>)}
          </select>
        )}
      </div>

      {/* Patch Name */}
      <div>
        <label htmlFor="patchName" className="block text-sm font-medium text-gray-700">Patch Name*</label>
        <input type="text" id="patchName" value={patchName} onChange={(e) => setPatchName(e.target.value)} required disabled={isLoading}
               className="mt-1 block w-full ..."/>
      </div>
      
      {/* Release Date */}
      <div>
        <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700">Release Date</label>
        <input type="date" id="releaseDate" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} disabled={isLoading}
               className="mt-1 block w-full ..."/>
      </div>

      {/* Input Mode Toggle (Provide Link / Upload File) - same as AdminDocumentEntryForm */}
      {/* Conditional Inputs for URL or File Upload - same as AdminDocumentEntryForm, just use appropriate state vars */}
      {/* Description Input - same as AdminDocumentEntryForm */}

      <button type="submit" disabled={isLoading} className="w-full ...">
        {isLoading ? 'Adding Patch...' : 'Add Patch'}
      </button>
    </form>
  );
};

export default AdminPatchEntryForm;