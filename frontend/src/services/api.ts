// src/services/api.ts
import {
  Document as DocumentType, // Aliased Document to avoid conflict
  Link, Patch, Software,
  AuthRequest, AuthResponse, RegisterRequest, RegisterResponse,
  AddDocumentPayload, AddPatchPayload, AddLinkPayload,
  MiscCategory, AddCategoryPayload, MiscFile
} from '../types'; // Ensure path is correct

const API_BASE_URL = 'http://127.0.0.1:5000';

// Helper to construct Authorization header
const getAuthHeader = (): Record<string, string> => { // Explicitly type the return
  const token = localStorage.getItem('authToken');
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {}; // Return an empty object if no token
};

// Generic error handler for API calls
const handleApiError = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use status text
      throw new Error(`${defaultMessage}: ${response.status} ${response.statusText}`);
    }
    // Use message from backend if available, otherwise default
    const message = errorData?.msg || `${defaultMessage}: ${response.status}`;
    const error: any = new Error(message); // Create an error object
    error.response = { data: errorData, status: response.status }; // Attach response data for more detailed error handling
    throw error;
  }
  return response.json(); // If response is ok, parse JSON
};

// --- Basic Data Fetching ---

export async function fetchSoftware(): Promise<Software[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/software`);
    if (!response.ok) {
      throw new Error(`Failed to fetch software: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching software:', error);
    throw error;
  }
}

export async function fetchLinks(softwareId?: number, versionId?: number): Promise<Link[]> {
  try {
    let url = `${API_BASE_URL}/api/links`;
    const params = new URLSearchParams();
    if (softwareId) {
      params.append('software_id', softwareId.toString());
    }
    if (versionId) {
      params.append('version_id', versionId.toString());
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    return handleApiError(response, 'Failed to fetch links');
  } catch (error) {
    console.error('Error fetching links:', error);
    throw error;
  }
}

export async function fetchDocuments(softwareId?: number): Promise<DocumentType[]> {
  try {
    const url = softwareId 
      ? `${API_BASE_URL}/api/documents?software_id=${softwareId}` 
      : `${API_BASE_URL}/api/documents`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
}

export async function fetchPatches(softwareId?: number): Promise<Patch[]> {
  try {
    const url = softwareId 
      ? `${API_BASE_URL}/api/patches?software_id=${softwareId}` 
      : `${API_BASE_URL}/api/patches`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch patches: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching patches:', error);
    throw error;
  }
}

export async function searchData(query: string): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Failed to search: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error searching:', error);
    throw error;
  }
}

export async function fetchVersionsForSoftware(softwareId: number): Promise<{ id: number; version_number: string }[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/versions_for_software?software_id=${softwareId}`);
    return handleApiError(response, 'Failed to fetch versions for software');
  } catch (error) {
    console.error('Error fetching versions for software:', error);
    throw error;
  }
}

// --- Authentication Functions ---

export async function registerUser(userData: RegisterRequest): Promise<RegisterResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    return handleApiError(response, 'Registration failed');
  } catch (error) {
    console.error('Error during registration:', error);
    throw error;
  }
}

export async function loginUser(credentials: AuthRequest): Promise<AuthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    // The AuthResponse type expects access_token and username
    // The backend /api/auth/login returns { access_token: "...", username: "..." }
    return handleApiError(response, 'Login failed');
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

export async function fetchProtectedData(): Promise<any> { // Define a more specific return type
  try {
    const baseHeaders: Record<string, string> = { // Start with base headers
      'Content-Type': 'application/json',
    };

    const authHeader = getAuthHeader(); // Get auth header (which is Record<string, string>)

    // Combine them. The spread of authHeader will add Authorization if present.
    const headers = {
      ...baseHeaders,
      ...authHeader, // Spread the auth header here
    };

    const response = await fetch(`${API_BASE_URL}/api/protected`, {
      method: 'GET',
      headers: headers, // Pass the combined headers object
    });
    return handleApiError(response, 'Failed to fetch protected data');
  } catch (error) {
    console.error('Error fetching protected data:', error);
    throw error; // Re-throw to be caught by calling component
  }
}

// --- Admin Document Functions ---

export async function addAdminDocumentWithUrl(payload: AddDocumentPayload): Promise<DocumentType> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({...payload, is_external_link: true }), // Explicitly set flag
    });
    return handleApiError(response, 'Failed to add document with URL');
  } catch (error) { 
    console.error('Error adding document with URL:', error); 
    throw error; 
  }
}

export async function uploadAdminDocumentFile(formData: FormData): Promise<DocumentType> {
  // FormData should contain 'file' and other metadata fields like 'software_id', 'doc_name', etc.
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/upload_file`, {
      method: 'POST',
      headers: { ...getAuthHeader() }, // Content-Type is set by browser for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to upload document file');
  } catch (error) { 
    console.error('Error uploading document file:', error); 
    throw error; 
  }
}

// --- Admin Patch Functions ---

export async function addAdminPatchWithUrl(payload: AddPatchPayload): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({...payload, is_external_link: true }), // Ensure flag is set
    });
    return handleApiError(response, 'Failed to add patch with URL');
  } catch (error) { console.error('Error adding admin patch with URL:', error); throw error; }
}

export async function uploadAdminPatchFile(formData: FormData): Promise<Patch> {
  // FormData should contain 'file' and metadata fields:
  // 'version_id', 'patch_name', 'description', 'release_date'
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/upload_file`, {
      method: 'POST',
      headers: { ...getAuthHeader() }, // Content-Type handled by browser for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to upload patch file');
  } catch (error) { console.error('Error uploading admin patch file:', error); throw error; }
}

// --- Admin Link Functions ---

export async function addAdminLinkWithUrl(payload: AddLinkPayload): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({...payload, is_external_link: true }),
    });
    return handleApiError(response, 'Failed to add link with URL');
  } catch (error) { console.error('Error adding admin link with URL:', error); throw error; }
}

export async function uploadAdminLinkFile(formData: FormData): Promise<Link> {
  // FormData: 'file', 'software_id', 'version_id' (optional), 'title', 'description'
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/upload_file`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleApiError(response, 'Failed to upload link file');
  } catch (error) { console.error('Error uploading admin link file:', error); throw error; }
}

// --- Misc Category API Functions ---

export async function fetchMiscCategories(): Promise<MiscCategory[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/misc_categories`);
    return handleApiError(response, 'Failed to fetch misc categories');
  } catch (error) {
    console.error('Error fetching misc categories:', error);
    throw error;
  }
}

export async function addAdminMiscCategory(categoryData: AddCategoryPayload): Promise<MiscCategory> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(categoryData),
    });
    return handleApiError(response, 'Failed to add misc category');
  } catch (error) {
    console.error('Error adding admin misc category:', error);
    throw error;
  }
}

// --- Misc File API Functions ---

export async function uploadAdminMiscFile(formData: FormData): Promise<MiscFile> {
  // FormData should contain 'file', 'misc_category_id', 'user_provided_title', 'user_provided_description'
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_files/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleApiError(response, 'Failed to upload misc file');
  } catch (error) {
    console.error('Error uploading misc file:', error);
    throw error;
  }
}

export async function fetchMiscFiles(categoryId?: number): Promise<MiscFile[]> {
  try {
    let url = `${API_BASE_URL}/api/misc_files`;
    if (categoryId) {
      url += `?category_id=${categoryId}`;
    }
    const response = await fetch(url);
    return handleApiError(response, 'Failed to fetch misc files');
  } catch (error) {
    console.error('Error fetching misc files:', error);
    throw error;
  }
}


export async function editAdminDocumentWithUrl(documentId: number, payload: Partial<AddDocumentPayload>): Promise<DocumentType> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/edit_url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update document with URL');
  } catch (error) { console.error('Error updating document with URL:', error); throw error; }
}

export async function editAdminDocumentFile(documentId: number, formData: FormData): Promise<DocumentType> {
  // formData should contain metadata and optionally a new 'file'
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, // Content-Type set by browser for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to update document with file');
  } catch (error) { console.error('Error updating document with file:', error); throw error; }
}

export async function deleteAdminDocument(documentId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete document'); // handleApiError will parse JSON msg
  } catch (error) { console.error('Error deleting document:', error); throw error; }
}


// --- Admin Patch Edit/Delete Functions ---

export async function editAdminPatchWithUrl(patchId: number, payload: Partial<AddPatchPayload>): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/edit_url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update patch with URL');
  } catch (error) { console.error('Error updating patch with URL:', error); throw error; }
}

export async function editAdminPatchFile(patchId: number, formData: FormData): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleApiError(response, 'Failed to update patch with file');
  } catch (error) { console.error('Error updating patch with file:', error); throw error; }
}

export async function deleteAdminPatch(patchId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete patch');
  } catch (error) { console.error('Error deleting patch:', error); throw error; }
}

// --- Admin Link Edit/Delete Functions ---

export async function editAdminLinkWithUrl(linkId: number, payload: Partial<AddLinkPayload>): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/edit_url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update link with URL');
  } catch (error) { console.error('Error updating link with URL:', error); throw error; }
}

export async function editAdminLinkFile(linkId: number, formData: FormData): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleApiError(response, 'Failed to update link with file');
  } catch (error) { console.error('Error updating link with file:', error); throw error; }
}

export async function deleteAdminLink(linkId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete link');
  } catch (error) { console.error('Error deleting link:', error); throw error; }
}

// --- Admin Misc Category Edit/Delete Functions ---

// Assuming EditCategoryPayload is similar to AddCategoryPayload or just { name?: string; description?: string }
export interface EditCategoryPayload {
  name?: string;
  description?: string;
}
export async function editAdminMiscCategory(categoryId: number, payload: EditCategoryPayload): Promise<MiscCategory> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_categories/${categoryId}/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update misc category');
  } catch (error) { console.error('Error updating misc category:', error); throw error; }
}

export async function deleteAdminMiscCategory(categoryId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_categories/${categoryId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete misc category');
  } catch (error) { console.error('Error deleting misc category:', error); throw error; }
}


// --- Admin Misc File Edit/Delete Functions ---

// For editing a misc file, the payload might just be metadata.
// File replacement is handled by `editAdminMiscFileWithNewUpload` if needed,
// or the backend PUT /edit route for misc_files handles FormData which might include a new file.
export interface EditMiscFilePayload { // For metadata-only updates via JSON
  misc_category_id?: number;
  user_provided_title?: string;
  user_provided_description?: string;
}
// If you have a dedicated route for metadata-only JSON updates:
// export async function editAdminMiscFileMetadata(fileId: number, payload: EditMiscFilePayload): Promise<MiscFile> { ... }

// For editing misc file (metadata and/or replacing file via FormData)
export async function editAdminMiscFile(fileId: number, formData: FormData): Promise<MiscFile> {
  // FormData can contain: 'file' (optional new), 'misc_category_id', 'user_provided_title', 'user_provided_description'
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_files/${fileId}/edit`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleApiError(response, 'Failed to update misc file');
  } catch (error) { console.error('Error updating misc file:', error); throw error; }
}

export async function deleteAdminMiscFile(fileId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_files/${fileId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete misc file');
  } catch (error) { console.error('Error deleting misc file:', error); throw error; }
}

