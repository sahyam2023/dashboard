// src/services/api.ts
import {
  Document as DocumentType,
  Link, Patch, Software, SoftwareVersion, // SoftwareVersion for version dropdowns
  AuthRequest, AuthResponse, RegisterRequest, RegisterResponse,
  AddDocumentPayload, // Stays as is for documents

  // Corrected Payloads for Patches and Links with flexible version handling
  AddPatchPayloadFlexible, EditPatchPayloadFlexible,
  AddLinkPayloadFlexible, EditLinkPayloadFlexible,

  MiscCategory, AddCategoryPayload, EditCategoryPayload, // EditCategoryPayload is used
  MiscFile
  // EditMiscFilePayload is not used if all misc file edits are via FormData
  // User, ChangePasswordPayload, UpdateEmailPayload, UpdateUserRolePayload,
  // DocumentType, Link, Patch, Software, SoftwareVersion, MiscCategory, MiscFile
  // should ideally be imported from a central types.ts file.
} from '../types'; // Assuming '../types' will eventually export these
export type { Software } from '../types'; // Re-exporting Software type

// --- Type Definitions (Ensure these are consistent with your backend and UI needs) ---
// Base entity types (assuming these are defined in '../types' or need to be defined here)
// For brevity, I'm showing User, DocumentType, Patch, Link, MiscFile as they are directly used in paginated responses.
// Ensure Software, SoftwareVersion, AuthRequest, AuthResponse, etc., are also properly defined/imported.

export interface User { // Already defined, ensure it's comprehensive
  id: number;
  username: string;
  email: string | null;
  role: 'user' | 'admin' | 'super_admin';
  is_active: boolean;
  created_at?: string; // Optional, if needed by UI from paginated response
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface UpdateEmailPayload {
  new_email: string;
  password: string;
}

export interface UpdateUserRolePayload {
  new_role: 'user' | 'admin' | 'super_admin';
}

// --- Paginated Response Type Definitions ---
export interface PaginationParams {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedUsersResponse {
  users: User[];
  page: number;
  per_page: number;
  total_users: number;
  total_pages: number;
}

export interface PaginatedDocumentsResponse {
  documents: DocumentType[];
  page: number;
  per_page: number;
  total_documents: number;
  total_pages: number;
}

export interface PaginatedPatchesResponse {
  patches: Patch[];
  page: number;
  per_page: number;
  total_patches: number;
  total_pages: number;
}

export interface PaginatedLinksResponse {
  links: Link[];
  page: number;
  per_page: number;
  total_links: number;
  total_pages: number;
}

export interface PaginatedMiscFilesResponse {
  misc_files: MiscFile[];
  page: number;
  per_page: number;
  total_misc_files: number;
  total_pages: number;
}

// --- Admin Software Version Type Definitions ---
export interface AdminSoftwareVersion {
  id: number;
  software_id: number;
  software_name: string; // From JOIN in backend
  version_number: string;
  release_date?: string | null; // Format 'YYYY-MM-DD'
  main_download_link?: string | null;
  changelog?: string | null;
  known_bugs?: string | null;
  created_by_user_id: number;
  created_at: string; // ISO date string
  updated_by_user_id?: number | null;
  updated_at?: string | null; // ISO date string
}

export interface PaginatedAdminVersionsResponse {
  versions: AdminSoftwareVersion[];
  page: number;
  per_page: number;
  total_versions: number;
  total_pages: number;
}

export interface AddAdminVersionPayload {
  software_id: number;
  version_number: string;
  release_date?: string | null;
  main_download_link?: string | null;
  changelog?: string | null;
  known_bugs?: string | null;
}

export type EditAdminVersionPayload = Partial<AddAdminVersionPayload>;
// --- End of Type Definitions ---

// --- Interface for Dashboard Statistics ---
export interface RecentActivityItem {
  action_type: string;
  username: string | null; // Username can be null for system actions or if user is deleted
  timestamp: string; // ISO date string
  details: any; // Details can be an object or string, using 'any' for flexibility
}

export interface RecentAdditionItem {
  id: number; 
  name: string;
  type: string;
  created_at: string; 
}

export interface PopularDownloadItem {
  name: string;
  type: string;
  download_count: number;
}

export interface DocumentsPerSoftwareItem {
  software_name: string;
  document_count: number;
}

export interface DashboardStats {
  total_users: number;
  total_software_titles: number;
  recent_activities: RecentActivityItem[];
  recent_additions?: RecentAdditionItem[]; 
  popular_downloads?: PopularDownloadItem[]; 
  documents_per_software?: DocumentsPerSoftwareItem[];
}
// --- End of Interface for Dashboard Statistics ---

// --- Interfaces for Audit Log ---
export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  action_type: string;
  target_table: string | null;
  target_id: number | null;
  details: any; // Can be JSON string or object
  timestamp: string; // ISO date string
}

export interface AuditLogResponse {
  logs: AuditLogEntry[];
  page: number;
  per_page: number;
  total_logs: number;
  total_pages: number;
}
// --- End of Interfaces for Audit Log ---

const API_BASE_URL = 'http://127.0.0.1:5000';

// Helper to construct Authorization header
const getAuthHeader = (): Record<string, string> => { 
  const token = localStorage.getItem('authToken');
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {}; 
};

// Generic error handler for API calls
const handleApiError = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      throw new Error(`${defaultMessage}: ${response.status} ${response.statusText}`);
    }
    const message = errorData?.msg || `${defaultMessage}: ${response.status}`;
    const error: any = new Error(message); 
    error.response = { data: errorData, status: response.status }; 
    throw error;
  }

  const responseText = await response.text(); 
  try {
    return JSON.parse(responseText); 
  } catch (e) {
    console.error('JSON parsing error for URL:', response.url, 'Received non-JSON response:', responseText);
    throw new Error(`JSON parsing failed for URL: ${response.url}. Response: ${responseText.substring(0, 200)}...`);
  }
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

// --- User Favorites API Functions ---

export interface FavoriteIdentifier {
  item_id: number;
  item_type: string;
}

// FullFavoriteItem type definition
// Ensure DocumentType, Patch, Link, MiscFile are imported and have id, and name/title-like properties
export type FullFavoriteItem = (DocumentType | Patch | Link | MiscFile) & { 
  item_type: string; 
  name: string; // Backend normalizes this field
  // id is expected to be part of DocumentType, Patch, Link, MiscFile
};

export async function addFavorite(itemId: number, itemType: string): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ item_id: itemId, item_type: itemType }),
    });
    return handleApiError(response, `Failed to add ${itemType} to favorites`);
  } catch (error) {
    console.error(`Error adding ${itemType} to favorites:`, error);
    throw error;
  }
}

export async function removeFavorite(itemType: string, itemId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites/${itemType}/${itemId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleApiError(response, `Failed to remove ${itemType} from favorites`);
  } catch (error) {
    console.error(`Error removing ${itemType} from favorites:`, error);
    throw error;
  }
}

export async function fetchUserFavoriteIds(): Promise<FavoriteIdentifier[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/favorites/ids`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleApiError(response, 'Failed to fetch user favorite IDs');
  } catch (error) {
    console.error('Error fetching user favorite IDs:', error);
    throw error;
  }
}

export async function fetchFullUserFavorites(): Promise<FullFavoriteItem[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/favorites`, { // Note: No '/ids'
      method: 'GET',
      headers: {
        ...getAuthHeader(),
      },
    });
    // The backend is expected to return an array of items, each with an 'item_type' field
    // and other details specific to that type, plus a normalized 'name'.
    return handleApiError(response, 'Failed to fetch full user favorites');
  } catch (error) {
    console.error('Error fetching full user favorites:', error);
    throw error;
  }
}
// --- End User Favorites API Functions ---
// --- Audit Log Fetch Function ---
export async function fetchAuditLogEntries(params: URLSearchParams): Promise<AuditLogResponse> {
  try {
    const url = `${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to fetch audit logs');
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

// --- Admin Dashboard Statistics Function ---
export async function fetchDashboardStats(): Promise<DashboardStats> {
  try {
    const url = `${API_BASE_URL}/api/admin/dashboard-stats`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to fetch dashboard statistics');
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    throw error;
  }
}

// --- Admin Software Version Management Functions ---

export async function addAdminVersion(payload: AddAdminVersionPayload): Promise<AdminSoftwareVersion> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to add software version');
  } catch (error) {
    console.error('Error adding software version:', error);
    throw error;
  }
}

export async function fetchAdminVersions(
  params: PaginationParams & { softwareId?: number }
): Promise<PaginatedAdminVersionsResponse> {
  try {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.perPage) queryParams.append('per_page', params.perPage.toString());
    if (params.sortBy) queryParams.append('sort_by', params.sortBy);
    if (params.sortOrder) queryParams.append('sort_order', params.sortOrder);
    if (params.softwareId) queryParams.append('software_id', params.softwareId.toString());

    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}/api/admin/versions${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to fetch admin software versions');
  } catch (error) {
    console.error('Error fetching admin software versions:', error);
    throw error;
  }
}

export async function fetchAdminVersionById(versionId: number): Promise<AdminSoftwareVersion> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/versions/${versionId}`, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to fetch software version by ID');
  } catch (error) {
    console.error('Error fetching software version by ID:', error);
    throw error;
  }
}

export async function updateAdminVersion(versionId: number, payload: EditAdminVersionPayload): Promise<AdminSoftwareVersion> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/versions/${versionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update software version');
  } catch (error) {
    console.error('Error updating software version:', error);
    throw error;
  }
}

export async function deleteAdminVersion(versionId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/versions/${versionId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete software version');
  } catch (error) {
    console.error('Error deleting software version:', error);
    throw error;
  }
}

export async function fetchLinks(
  softwareId?: number, 
  versionId?: number,
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  // <<< --- ADD NEW PARAMETERS HERE (linkType, createdFrom, createdTo) --- >>>
  linkType?: 'external' | 'uploaded' | string,
  createdFrom?: string,
  createdTo?: string
): Promise<PaginatedLinksResponse> {
  try {
    const params = new URLSearchParams();
    if (softwareId) params.append('software_id', softwareId.toString());
    if (versionId) params.append('version_id', versionId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);
    
    // <<< --- ADD LOGIC HERE TO APPEND NEW FILTER PARAMETERS --- >>>
    if (linkType) params.append('link_type', linkType);
    if (createdFrom) params.append('created_from', createdFrom);
    if (createdTo) params.append('created_to', createdTo);
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/links${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    return handleApiError(response, 'Failed to fetch links');
  } catch (error) {
    console.error('Error fetching links:', error);
    throw error;
  }
}

export async function fetchDocuments(
  softwareId?: number,
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  docType?: string, // New
  createdFrom?: string, // New
  createdTo?: string, // New
  updatedFrom?: string, // New
  updatedTo?: string // New
): Promise<PaginatedDocumentsResponse> {
  try {
    const params = new URLSearchParams();
    if (softwareId) params.append('software_id', softwareId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);

    // <<< --- ADD LOGIC HERE TO APPEND NEW FILTER PARAMETERS --- >>>
    if (docType) params.append('doc_type', docType);
    if (createdFrom) params.append('created_from', createdFrom);
    if (createdTo) params.append('created_to', createdTo);
    if (updatedFrom) params.append('updated_from', updatedFrom);
    if (updatedTo) params.append('updated_to', updatedTo);
    // <<< --- END OF NEW LOGIC --- >>>

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/documents${queryString ? `?${queryString}` : ''}`;
        
    const response = await fetch(url);
    return handleApiError(response, 'Failed to fetch documents');
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
}

export async function fetchPatches(
  softwareId?: number,
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  // <<< --- ADD NEW PARAMETERS HERE --- >>>
  releaseFrom?: string,
  releaseTo?: string,
  patchedByDeveloper?: string
): Promise<PaginatedPatchesResponse> {
  try {
    const params = new URLSearchParams();
    if (softwareId) params.append('software_id', softwareId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);

    // <<< --- ADD LOGIC HERE TO APPEND NEW FILTER PARAMETERS --- >>>
    if (releaseFrom) params.append('release_from', releaseFrom);
    if (releaseTo) params.append('release_to', releaseTo);
    if (patchedByDeveloper) params.append('patched_by_developer', patchedByDeveloper);

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/patches${queryString ? `?${queryString}` : ''}`;
        
    const response = await fetch(url);
    return handleApiError(response, 'Failed to fetch patches');
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

export async function fetchVersionsForSoftware(softwareId: number): Promise<SoftwareVersion[]> { 
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
    return handleApiError(response, 'Login failed');
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

export async function fetchProtectedData(): Promise<any> { 
  try {
    const baseHeaders: Record<string, string> = { 
      'Content-Type': 'application/json',
    };

    const authHeader = getAuthHeader(); 

    const headers = {
      ...baseHeaders,
      ...authHeader, 
    };

    const response = await fetch(`${API_BASE_URL}/api/protected`, {
      method: 'GET',
      headers: headers, 
    });
    return handleApiError(response, 'Failed to fetch protected data');
  } catch (error) {
    console.error('Error fetching protected data:', error);
    throw error; 
  }
}

// --- Admin Document Functions ---

export async function addAdminDocumentWithUrl(payload: AddDocumentPayload): Promise<DocumentType> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({...payload, is_external_link: true }), 
    });
    return handleApiError(response, 'Failed to add document with URL');
  } catch (error) { 
    console.error('Error adding document with URL:', error); 
    throw error; 
  }
}

export async function uploadAdminDocumentFile(formData: FormData): Promise<DocumentType> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/upload_file`, {
      method: 'POST',
      headers: { ...getAuthHeader() }, 
      body: formData,
    });
    return handleApiError(response, 'Failed to upload document file');
  } catch (error) { 
    console.error('Error uploading document file:', error); 
    throw error; 
  }
}

// --- Admin Patch Functions ---

export async function addAdminPatchWithUrl(payload: AddPatchPayloadFlexible): Promise<Patch> {
  try {
    const backendPayload = { ...payload, is_external_link: true };
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(backendPayload),
    });
    return handleApiError(response, 'Failed to add patch with URL');
  } catch (error) { console.error('Error adding admin patch with URL:', error); throw error; }
}

export async function uploadAdminPatchFile(formData: FormData): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/upload_file`, {
      method: 'POST', headers: { ...getAuthHeader() }, body: formData,
    });
    return handleApiError(response, 'Failed to upload patch file');
  } catch (error) { console.error('Error uploading admin patch file:', error); throw error; }
}

// --- Admin Link Functions ---

export async function addAdminLinkWithUrl(payload: AddLinkPayloadFlexible): Promise<Link> {
  try {
    const backendPayload = { ...payload, is_external_link: true };
    const response = await fetch(`${API_BASE_URL}/api/admin/links/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(backendPayload),
    });
    return handleApiError(response, 'Failed to add link with URL');
  } catch (error) { console.error('Error adding admin link with URL:', error); throw error; }
}
export async function uploadAdminLinkFile(formData: FormData): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/upload_file`, {
      method: 'POST', headers: { ...getAuthHeader() }, body: formData,
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

export async function fetchMiscFiles(
  categoryId?: number,
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): Promise<PaginatedMiscFilesResponse> {
  try {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', categoryId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/misc_files${queryString ? `?${queryString}` : ''}`;
        
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
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
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
    return handleApiError(response, 'Failed to delete document');
  } catch (error) { console.error('Error deleting document:', error); throw error; }
}



// --- Admin Patch Edit/Delete Functions ---

export async function editAdminPatchWithUrl(patchId: number, payload: EditPatchPayloadFlexible): Promise<Patch> {
  try {
    const backendPayload = { ...payload, is_external_link: true };
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/edit_url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(backendPayload), 
    });
    return handleApiError(response, 'Failed to update patch with URL');
  } catch (error) { console.error('Error updating patch with URL:', error); throw error; }
}


export async function editAdminPatchFile(patchId: number, formData: FormData): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/edit_file`, {
      method: 'PUT', headers: { ...getAuthHeader() }, body: formData,
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

export async function editAdminLinkWithUrl(linkId: number, payload: EditLinkPayloadFlexible): Promise<Link> {
  try {
    const backendPayload = { ...payload, is_external_link: true };
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/edit_url`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(backendPayload),
    });
    return handleApiError(response, 'Failed to update link with URL');
  } catch (error) { console.error('Error updating link with URL:', error); throw error; }
}

export async function editAdminLinkFile(linkId: number, formData: FormData): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/edit_file`, {
      method: 'PUT', headers: { ...getAuthHeader() }, body: formData,
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
export interface EditMiscFilePayload { 
  misc_category_id?: number;
  user_provided_title?: string;
  user_provided_description?: string;
}

export async function editAdminMiscFile(fileId: number, formData: FormData): Promise<MiscFile> {
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

// --- User Profile Management Functions ---

export async function changePassword(payload: ChangePasswordPayload): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/profile/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to change password');
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
}

export async function updateEmail(payload: UpdateEmailPayload): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/profile/update-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update email');
  } catch (error) {
    console.error('Error updating email:', error);
    throw error;
  }
}

// --- Super Admin User Management Functions ---

export async function listUsers(
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): Promise<PaginatedUsersResponse> {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/superadmin/users${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to list users');
  } catch (error) {
    console.error('Error listing users:', error);
    throw error;
  }
}

export async function updateUserRole(userId: number, payload: UpdateUserRolePayload): Promise<User> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update user role');
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
}

export async function deactivateUser(userId: number): Promise<{ msg: string } | User> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/deactivate`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, 
    });
    return handleApiError(response, 'Failed to deactivate user');
  } catch (error) {
    console.error('Error deactivating user:', error);
    throw error;
  }
}

export async function activateUser(userId: number): Promise<{ msg: string } | User> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/activate`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, 
    });
    return handleApiError(response, 'Failed to activate user');
  } catch (error) {
    console.error('Error activating user:', error);
    throw error;
  }
}

export async function deleteUser(userId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete user');
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}
