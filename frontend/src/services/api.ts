// src/services/api.ts
import {
  Document as DocumentType,
  Link, Patch, Software, SoftwareVersion, // SoftwareVersion for version dropdowns
  AuthRequest, AuthResponse as AuthResponseTypeFromTypes, RegisterRequest, RegisterResponse, // Renamed to avoid conflict
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

// Helper type for daily trends
export interface TrendItem {
  date: string; // For daily
  count: number;
}

// Helper type for weekly trends
export interface WeeklyTrendItem {
  week_start_date: string; // For weekly
  count: number;
}

// Helper type for content health statistics per content type
export interface ContentTypeHealthStats {
  missing?: number; // For missing_descriptions
  stale?: number;   // For stale_content
  total: number;
}

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

  // New properties
  user_activity_trends?: { 
    logins: {
      daily: TrendItem[];
      weekly: WeeklyTrendItem[];
    };
    uploads: {
      daily: TrendItem[];
      weekly: WeeklyTrendItem[];
    };
  };

  total_storage_utilized_bytes?: number;

  download_trends?: {
    daily: TrendItem[];
    weekly: WeeklyTrendItem[];
  };

  content_health?: {
    missing_descriptions: {
      documents: ContentTypeHealthStats;
      patches: ContentTypeHealthStats;
      links: ContentTypeHealthStats;
      misc_categories: ContentTypeHealthStats;
      software: ContentTypeHealthStats;
      misc_files: ContentTypeHealthStats;
    };
    stale_content: {
      documents: ContentTypeHealthStats;
      patches: ContentTypeHealthStats;
      links: ContentTypeHealthStats;
      misc_files: ContentTypeHealthStats;
      versions: ContentTypeHealthStats;
      misc_categories: ContentTypeHealthStats; 
    };
  };
}
// --- End of Interface for Dashboard Statistics ---

// --- Interface for System Health ---
export interface SystemHealth {
  api_status: string;
  db_connection: string;
}
// --- End of Interface for System Health ---

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
const handleApiError = async (response: Response, defaultMessage: string, isLoginAttempt: boolean = false) => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If parsing errorData fails, use a generic message
      errorData = { msg: `${defaultMessage}: ${response.status} ${response.statusText}` };
    }

    // Check for 401 Unauthorized and if a token was likely used (i.e., not a login attempt itself)
    if (response.status === 401 && !isLoginAttempt && localStorage.getItem('authToken')) {
      // Dispatch a custom event for token expiration
      // This event should be listened to by AuthContext to handle logout and redirect
      document.dispatchEvent(new CustomEvent('tokenExpired'));
      
      // We don't throw an error here because the event handler will navigate away.
      // Returning a promise that never resolves can prevent further processing in the calling function.
      // Or, ensure calling functions are robust to this. For now, we'll let it proceed to throw,
      // but the navigation should ideally prevent component errors.
      // A more robust solution might involve a dedicated error type that calling code can ignore.
      // For now, we throw to ensure the calling code's catch block is triggered if it needs to cleanup,
      // but the UI should be redirected by the event.
      const message = errorData?.msg || `Session expired or unauthorized: ${response.status}`;
      const error: any = new Error(message);
      error.response = { data: errorData, status: response.status };
      error.isTokenExpirationError = true; // Custom flag
      throw error;
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
    // Handle cases where response is OK but not JSON (e.g., a 204 No Content)
    if (responseText.trim() === '' && (response.status === 204 || response.status === 201 && response.headers.get('Content-Length') === '0')) {
      return null; // Or an appropriate representation for no content
    }
    console.error('JSON parsing error for URL:', response.url, 'Status:', response.status, 'Received non-JSON response:', responseText);
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

// --- Super Admin Database Management Functions ---

export interface BackupResponse {
  message: string;
  backup_path: string;
}

export async function backupDatabase(): Promise<BackupResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/database/backup`, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to create database backup');
  } catch (error) {
    console.error('Error creating database backup:', error);
    throw error;
  }
}

export interface RestoreResponse {
  message: string;
}

export async function restoreDatabase(formData: FormData): Promise<RestoreResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/database/restore`, {
      method: 'POST',
      headers: { ...getAuthHeader() }, // Content-Type is set automatically for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to restore database from backup');
  } catch (error) {
    console.error('Error restoring database from backup:', error);
    throw error;
  }
}
// --- End Super Admin Database Management Functions ---

// --- Super Admin: Force Password Reset ---
export async function forceUserPasswordReset(userId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/force-password-reset`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to force password reset');
  } catch (error) {
    console.error(`Error forcing password reset for user ${userId}:`, error);
    throw error;
  }
}

// --- Admin System Health Function ---
export async function fetchSystemHealth(): Promise<SystemHealth> {
  try {
    const url = `${API_BASE_URL}/api/admin/system-health`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to fetch system health');
  } catch (error) {
    console.error('Error fetching system health:', error);
    throw error;
  }
}

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

// --- Security Questions API Functions ---
export interface SecurityQuestion {
  id: number;
  question_text: string;
}

export async function fetchSecurityQuestions(): Promise<SecurityQuestion[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/security-questions`);
    return handleApiError(response, 'Failed to fetch security questions');
  } catch (error) {
    console.error('Error fetching security questions:', error);
    throw error;
  }
}
// --- End Security Questions API Functions ---

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
    // Ensure the response is correctly typed and handled, especially if handleApiError
    // already parses JSON and might not return the full structure needed.
    // If handleApiError returns parsed JSON, this should work.
    const data: RegisterResponse = await handleApiError(response, 'Registration failed');
    return data; 
  } catch (error) {
    console.error('Error during registration:', error);
    throw error;
  }
}

export async function loginUser(credentials: AuthRequest): Promise<AuthResponseTypeFromTypes> { // Use imported AuthResponse
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    // For login, we pass `isLoginAttempt = true` to handleApiError
    // This prevents the global 401 "token expired" handler from triggering for failed login attempts.
    return handleApiError(response, 'Login failed', true) as Promise<AuthResponseTypeFromTypes>;

  } catch (error: any) {
    // Re-throw the error to be caught by the component, which will show a toast
    // The error object should already be structured by handleApiError
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

// --- Favorites API Functions ---

export type FavoriteItemType = 'document' | 'patch' | 'link' | 'misc_file' | 'software' | 'version';

// Consider defining a specific return type for a favorite record, e.g., the favorite entry itself.
// For now, using 'any' as per the example.
export interface FavoriteRecord { 
  id: number; // ID of the user_favorites table entry
  user_id: number;
  item_id: number;
  item_type: FavoriteItemType;
  created_at: string;
}


export async function addFavoriteApi(itemId: number, itemType: FavoriteItemType): Promise<FavoriteRecord> { // Changed 'any' to 'FavoriteRecord'
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ item_id: itemId, item_type: itemType }),
    });
    return handleApiError(response, 'Failed to add favorite');
  } catch (error) {
    console.error('Error adding favorite:', error);
    throw error;
  }
}

export async function removeFavoriteApi(itemId: number, itemType: FavoriteItemType): Promise<{ msg: string }> { // Return type changed to { msg: string }
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites/${itemType}/${itemId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleApiError(response, 'Failed to remove favorite');
  } catch (error) {
    console.error('Error removing favorite:', error);
    throw error;
  }
}

export interface FavoriteStatusResponse {
  is_favorite: boolean;
  favorite_id?: number;
  favorited_at?: string;
}

export async function getFavoriteStatusApi(itemId: number, itemType: FavoriteItemType): Promise<FavoriteStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/favorites/status/${itemType}/${itemId}`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleApiError(response, 'Failed to get favorite status');
  } catch (error) {
    console.error('Error getting favorite status:', error);
    throw error;
  }
}

// Define a more specific type for what a "favorited item" might look like in the response.
// This will likely be a union of your existing types plus favorite_id and favorited_at.
// For now, using 'any' as placeholder, but this should be refined.
export interface DetailedFavoriteItem { // Placeholder - should be more specific
  favorite_id: number;
  item_id: number;
  item_type: FavoriteItemType;
  favorited_at: string;
  name: string; // Common field
  description?: string; // Common field
  software_name?: string; // Contextual
  software_id?: number; // Contextual
  version_number?: string; // Contextual
  version_id?: number; // Contextual
  // Add other fields based on what the backend's UNION ALL query for favorites returns
}


export interface PaginatedFavoritesResponse { 
  favorites: DetailedFavoriteItem[]; // Changed 'any[]' to 'DetailedFavoriteItem[]'
  page: number;
  per_page: number;
  total_favorites: number;
  total_pages: number;
}

export async function getUserFavoritesApi(
  page?: number,
  perPage?: number,
  itemType?: FavoriteItemType
): Promise<PaginatedFavoritesResponse> {
  try {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (itemType) params.append('item_type', itemType);
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/favorites${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleApiError(response, 'Failed to fetch user favorites');
  } catch (error) {
    console.error('Error fetching user favorites:', error);
    throw error;
  }
}

// --- Global Access Control API Functions ---
export interface GlobalLoginResponse {
  message: string;
}

export async function loginGlobal(password: string): Promise<GlobalLoginResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/global-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    return handleApiError(response, 'Global login failed');
  } catch (error) {
    console.error('Error during global login:', error);
    throw error;
  }
}

export interface ChangeGlobalPasswordPayload {
  new_password: string;
}

export async function changeGlobalPassword(payload: ChangeGlobalPasswordPayload): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/settings/global-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to change global password');
  } catch (error) {
    console.error('Error changing global password:', error);
    throw error;
  }
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

// --- Password Reset API Functions ---
export interface RequestPasswordResetInfoPayload {
  username_or_email: string;
}

export interface PasswordResetInfoResponse {
  user_id: number;
  username: string;
  questions: Array<{ question_id: number; question_text: string }>;
}

export interface VerifySecurityAnswersPayload {
  user_id: number;
  answers: Array<{ question_id: number; answer: string }>;
}

export interface VerifySecurityAnswersResponse {
  reset_token: string;
  expires_at: string; // ISO date string
}

export interface ResetPasswordWithTokenPayload {
  token: string;
  new_password: string;
}

export async function requestPasswordResetInfo(payload: RequestPasswordResetInfoPayload): Promise<PasswordResetInfoResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/request-password-reset-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to request password reset info');
  } catch (error) {
    console.error('Error requesting password reset info:', error);
    throw error;
  }
}

export async function verifySecurityAnswers(payload: VerifySecurityAnswersPayload): Promise<VerifySecurityAnswersResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-security-answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to verify security answers');
  } catch (error) {
    console.error('Error verifying security answers:', error);
    throw error;
  }
}

export async function resetPasswordWithToken(payload: ResetPasswordWithTokenPayload): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password-with-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to reset password with token');
  } catch (error) {
    console.error('Error resetting password with token:', error);
    throw error;
  }
}
// --- End Password Reset API Functions ---

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
