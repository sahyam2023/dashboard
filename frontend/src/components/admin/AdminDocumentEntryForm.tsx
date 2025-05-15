// src/components/admin/AdminDocumentEntryForm.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Software, Document as DocumentType, AddDocumentPayload } from '../../types';
import {
  fetchSoftware,
  addAdminDocumentWithUrl, uploadAdminDocumentFile,
  editAdminDocumentWithUrl, editAdminDocumentFile // NEW: Import edit functions
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, Link as LinkIconLucide, File as FileIconLucide, X } from 'lucide-react'; // Corrected Link import

interface AdminDocumentEntryFormProps {
  documentToEdit?: DocumentType | null; // NEW: Prop for editing
  onDocumentAdded?: (newDocument: DocumentType) => void;
  onDocumentUpdated?: (updatedDocument: DocumentType) => void; // NEW: Callback for update
  onCancelEdit?: () => void; // NEW: Callback to cancel editing
}

type InputMode = 'url' | 'upload';

const AdminDocumentEntryForm: React.FC<AdminDocumentEntryFormProps> = ({
  documentToEdit,
  onDocumentAdded,
  onDocumentUpdated,
  onCancelEdit,
}) => {
  const isEditMode = !!documentToEdit;

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<string>('');
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('');
  const [description, setDescription] = useState('');

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileName, setExistingFileName] = useState<string | null>(null); // For display in edit mode

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

  // NEW: Populate form if documentToEdit is provided
  useEffect(() => {
    if (isEditMode && documentToEdit) {
      setSelectedSoftwareId(documentToEdit.software_id?.toString() || ''); // software_id might be on the base Document type from backend now
      setDocName(documentToEdit.doc_name);
      setDocType(documentToEdit.doc_type || '');
      setDescription(documentToEdit.description || '');

      if (documentToEdit.is_external_link) {
        setInputMode('url');
        setExternalUrl(documentToEdit.download_link); // download_link is the external URL here
        setSelectedFile(null);
        setExistingFileName(null);
      } else {
        setInputMode('upload');
        setExternalUrl('');
        // Don't pre-fill selectedFile for security/UX reasons. User must re-select if changing.
        // Instead, display the name of the existing file.
        // The actual file path (documentToEdit.download_link) points to the server path.
        // We need original_filename_ref if available for display, or derive from download_link.
        const parts = documentToEdit.download_link.split('/');
        setExistingFileName(parts[parts.length-1]); // Simplistic way to get filename
                                                  // A proper original_filename_ref from backend is better for display
      }
    } else {
      // Reset form for "Add" mode or if documentToEdit becomes null
      resetFormFields();
    }
  }, [documentToEdit, isEditMode]);


  const resetFormFields = (keepSoftware: boolean = false) => {
    if (!keepSoftware) setSelectedSoftwareId('');
    setDocName('');
    setDocType('');
    setDescription('');
    setExternalUrl('');
    setSelectedFile(null);
    setExistingFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    // setSuccessMessage(null); // Keep success message until next action
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setExistingFileName(null); // Clear existing file name display when new file is chosen
      setError(null); setSuccessMessage(null);
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // If in edit mode and there was an existing file, re-display its name
    if (isEditMode && documentToEdit && !documentToEdit.is_external_link) {
        const parts = documentToEdit.download_link.split('/');
        setExistingFileName(parts[parts.length-1]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoftwareId) { setError("Software selection is required."); return; }
    if (!docName.trim()) { setError("Document Name is required."); return; }
    if (inputMode === 'url' && !externalUrl.trim()) { setError("External URL is required."); return; }
    // In edit mode, a file is not strictly required if only metadata is changing for an existing uploaded file
    if (inputMode === 'upload' && !selectedFile && !isEditMode) { // File required for new upload
      setError("Please select a file to upload."); return;
    }
     if (inputMode === 'upload' && !selectedFile && isEditMode && !documentToEdit?.download_link) {
      // If was external, now switching to upload in edit mode, file is required
      setError("Please select a file to upload when changing to file-based document."); return;
    }


    setError(null); setSuccessMessage(null); setIsLoading(true);

    try {
      let resultDocument: DocumentType;

      if (inputMode === 'url') {
        const payload: Partial<AddDocumentPayload> = { // Partial for edit
          software_id: parseInt(selectedSoftwareId),
          doc_name: docName.trim(),
          download_link: externalUrl.trim(),
          description: description.trim() || undefined,
          doc_type: docType.trim() || undefined,
          // is_external_link will be set by backend for edit_url
        };
        if (isEditMode && documentToEdit) {
          resultDocument = await editAdminDocumentWithUrl(documentToEdit.id, payload);
        } else {
          resultDocument = await addAdminDocumentWithUrl(payload as AddDocumentPayload); // Cast for add
        }
      } else { // inputMode === 'upload'
        const formData = new FormData();
        formData.append('software_id', selectedSoftwareId);
        formData.append('doc_name', docName.trim()); // Backend will default to filename if this is empty and it's an add
        if (docType.trim()) formData.append('doc_type', docType.trim());
        if (description.trim()) formData.append('description', description.trim());
        
        if (selectedFile) { // Only append file if a new one is selected
          formData.append('file', selectedFile);
        }
        // If editing and no new file selected, backend PUT /edit_file will keep the old file if only metadata changes.

        if (isEditMode && documentToEdit) {
          resultDocument = await editAdminDocumentFile(documentToEdit.id, formData);
        } else {
          if (!selectedFile) { // Should have been caught above, but double check
             setError("A file is required for new document uploads."); setIsLoading(false); return;
          }
          resultDocument = await uploadAdminDocumentFile(formData);
        }
      }

      setSuccessMessage(`Document "${resultDocument.doc_name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      if (!isEditMode) resetFormFields(true); // Keep software selected for multiple adds
      
      if (isEditMode && onDocumentUpdated) onDocumentUpdated(resultDocument);
      if (!isEditMode && onDocumentAdded) onDocumentAdded(resultDocument);

    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'add'} document.`);
    } finally {
      setIsLoading(false);
    }
  };

  const documentTypes = ["Guide", "Manual", "API Reference", "Datasheet", "Whitepaper", "Specification", "Other"];

  if (!isAuthenticated || role !== 'admin') return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
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
      {error && <div className="p-3 my-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 text-green-700 rounded">{successMessage}</div>}

      {/* Software Selection */}
      <div>
        <label htmlFor="docSoftware" className="block text-sm font-medium text-gray-700">Software*</label>
        {isFetchingSoftware ? <p className="text-sm text-gray-500">Loading software...</p> : (
          <select id="docSoftware" value={selectedSoftwareId} 
                  onChange={(e) => setSelectedSoftwareId(e.target.value)} required disabled={isLoading}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="" disabled>Select Software</option>
            {softwareList.map(sw => <option key={sw.id} value={sw.id.toString()}>{sw.name}</option>)}
          </select>
        )}
      </div>

      {/* Document Name */}
      <div>
        <label htmlFor="docName" className="block text-sm font-medium text-gray-700">Document Name*</label>
        <input type="text" id="docName" value={docName} onChange={(e) => setDocName(e.target.value)} required disabled={isLoading}
               className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      {/* Input Mode Toggle */}
      <div className="my-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Document Source:</span>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="inputMode" value="url" checked={inputMode === 'url'}
                   onChange={() => setInputMode('url')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
            <span className="flex items-center"><LinkIconLucide size={16} className="mr-1 text-gray-600"/>Provide External Link</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="radio" name="inputMode" value="upload" checked={inputMode === 'upload'}
                   onChange={() => setInputMode('upload')} className="form-radio h-4 w-4 text-blue-600" disabled={isLoading}/>
            <span className="flex items-center"><UploadCloud size={16} className="mr-1 text-gray-600"/>Upload File</span>
          </label>
        </div>
      </div>

      {/* Conditional Inputs based on Mode */}
      {inputMode === 'url' && (
        <div>
          <label htmlFor="externalUrl" className="block text-sm font-medium text-gray-700">External Download URL*</label>
          <input type="url" id="externalUrl" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
                 placeholder="https://example.com/document.pdf" required={inputMode === 'url'} disabled={isLoading}
                 className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
        </div>
      )}

      {inputMode === 'upload' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {isEditMode && existingFileName ? 'Replace File (Optional)' : 'Select File to Upload*'}
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-500 transition-colors">
            <div className="space-y-1 text-center">
                <FileIconLucide className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                <label htmlFor="doc-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>{selectedFile ? 'Change file' : 'Upload a file'}</span>
                    <input id="doc-file-upload" name="file" type="file" className="sr-only"
                        onChange={handleFileChange} ref={fileInputRef} 
                        required={inputMode === 'upload' && !isEditMode && !existingFileName} // Required for add, or if changing from URL to file
                        disabled={isLoading} />
                </label>
                <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PDF, DOCX, PNG, JPG, ZIP etc.</p>
            </div>
          </div>
          {(selectedFile || existingFileName) && (
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

      {/* Document Type */}
      <div>
        <label htmlFor="docType" className="block text-sm font-medium text-gray-700">Document Type</label>
        <select id="docType" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={isLoading}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
          <option value="">Select Type (Optional)</option>
          {documentTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="docDescription" className="block text-sm font-medium text-gray-700">Description</label>
        <textarea id="docDescription" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"/>
      </div>

      <div className="flex space-x-3">
        <button type="submit" disabled={isLoading}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Document' : 'Add Document')}
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

export default AdminDocumentEntryForm;