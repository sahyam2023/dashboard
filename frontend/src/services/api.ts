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
  MiscFile,
  // EditMiscFilePayload is not used if all misc file edits are via FormData
  // User, ChangePasswordPayload, UpdateEmailPayload, UpdateUserRolePayload,
  // DocumentType, Link, Patch, Software, SoftwareVersion, MiscCategory, MiscFile
  // should ideally be imported from a central types.ts file.

  // File Permission Types
  FilePermission,
  FilePermissionUpdatePayload,
  UpdateUserFilePermissionsResponse,
  // Notification Types
  Notification,
  UnreadNotificationCountResponse,
  PaginatedNotificationsResponse,
} from '../types'; // Assuming '../types' will eventually export these
import { setGlobalOfflineStatus, showErrorToast } from '../utils/toastUtils'; // Added
export type { Software } from '../types'; // Re-exporting Software type

const TOKEN_EXPIRY_SECONDS = 14400; // 4 hours (updated from 1 hour)
const OFFLINE_MESSAGE = "Backend is unavailable. Please check your connection."; // Added

// --- Type Definitions (Ensure these are consistent with your backend and UI needs) ---
// Base entity types (assuming these are defined in '../types' or need to be defined here)
// For brevity, I'm showing User, DocumentType, Patch, Link, MiscFile as they are directly used in paginated responses.
// Ensure Software, SoftwareVersion, AuthRequest, AuthResponse, etc., are also properly defined/imported.

// WatchPreference types are now imported from '../types'
import { WatchPreference, UpdateWatchPreferencePayload } from '../types';


export interface User {
  id: number;
  username: string;
  email: string | null;
  role: 'user' | 'admin' | 'super_admin';
  is_active: boolean;
  created_at?: string;
  profile_picture_filename?: string | null; // Added
  profile_picture_url?: string | null;    // Added
  password_reset_required?: boolean;      // Added
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

// --- Interface for Maintenance Mode Status ---
export interface MaintenanceStatusResponse {
  maintenance_mode_enabled: boolean;
  msg?: string; // Optional message, e.g., if setting not found and defaulting
}
// --- End of Interface for Maintenance Mode Status ---

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

// --- Comment Management Types ---
export interface Comment {
  id: number;
  content: string;
  user_id: number;
  username: string; // Included from backend JOIN
  item_id: number;
  item_type: string;
  parent_comment_id: number | null;
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
  replies?: Comment[]; // For nested replies
}

export interface PaginatedCommentsResponse {
  comments: Comment[];
  total_top_level_comments: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AddCommentPayload {
  content: string;
  parent_comment_id?: number | null;
}

export interface UpdateCommentPayload {
  content: string;
}

export interface UserMentionSuggestion {
  id: number;
  username: string;
}
// --- End Comment Management Types ---

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7000';

// Helper to construct Authorization header
const getAuthHeader = (): Record<string, string> => {
  const tokenDataString = localStorage.getItem('tokenData');
  if (tokenDataString) {
    try {
      const tokenData = JSON.parse(tokenDataString);
      if (tokenData && tokenData.token) {
        return { 'Authorization': `Bearer ${tokenData.token}` };
      }
    } catch (error) {
      console.error("Failed to parse tokenData from localStorage", error);
      return {}; // Return empty if parsing fails
    }
  }
  return {}; 
};

// Generic error handler for API calls
const handleApiError = async (response: Response, defaultMessage: string, isLoginAttempt: boolean = false) => {
  if (response.ok) {
    setGlobalOfflineStatus(false); // Connection successful
  }
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If parsing errorData fails, use a generic message
      errorData = { msg: `${defaultMessage}: ${response.status} ${response.statusText}` };
    }

    // Check for 503 Maintenance Mode and if a token was used (i.e., not a login attempt)
    if (response.status === 503 && errorData?.maintenance_mode_active === true && !isLoginAttempt && localStorage.getItem('tokenData')) {
      // Dispatch a custom event for maintenance mode forced logout
      const maintenanceMessage = errorData?.msg || "You have been logged out as the system is now in maintenance mode.";
      document.dispatchEvent(new CustomEvent('maintenanceModeForcedLogout', { detail: { message: maintenanceMessage } }));
      
      const error: any = new Error(maintenanceMessage);
      error.response = { data: errorData, status: response.status };
      error.isMaintenanceModeError = true; // Custom flag
      throw error; // Stop further processing in the calling function
    }

    // Check for 401 Unauthorized and if a token was likely used (i.e., not a login attempt itself)
    if (response.status === 401 && !isLoginAttempt && localStorage.getItem('tokenData')) {
      // Dispatch a custom event for token invalidation (e.g. blacklisted or expired)
      // This event should be listened to by AuthContext to handle logout and redirect
      document.dispatchEvent(new CustomEvent('tokenInvalidated'));
      
      // We don't throw an error here because the event handler will navigate away.
      // Returning a promise that never resolves can prevent further processing in the calling function.
      // Or, ensure calling functions are robust to this. For now, we'll let it proceed to throw,
      // but the UI should be redirected by the event.
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
    const response = await fetch(`${API_BASE_URL}/api/software`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    // Using handleApiError for consistent processing (including offline status reset on success)
    return handleApiError(response, 'Failed to fetch software');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching software:', error);
    throw error;
  }
}

export async function fetchChatImageBlob(fileUrl: string): Promise<Blob> {
  try {
    // Ensure API_BASE_URL is prepended if fileUrl is relative (e.g., /files/chat_uploads/...)
    // If fileUrl from the backend is already a full path, this might not be needed,
    // but it's safer to ensure it's correctly formed.
    // Current backend file_url for chat messages is relative like: "/files/chat_uploads/CONVO_ID/FILENAME"
    const fullUrl = `${API_BASE_URL}${fileUrl}`;
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { ...getAuthHeader() }, // Crucial for auth
    });
    if (!response.ok) {
      // Handle error response (e.g., throw an error with status)
      // Consider using handleApiError if it can be adapted or a similar specialized error handler
      const errorText = await response.text(); // Get more details if possible
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}. Body: ${errorText.substring(0,100)}`);
    }
    return response.blob();
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true); // Use your existing offline handler
      showErrorToast(OFFLINE_MESSAGE); // Use your existing toast utility
    }
    console.error('Error fetching chat image blob:', fileUrl, error);
    throw error; // Re-throw to be caught by the calling component
  }
}

// --- Chat API Functions ---
// Assuming types like User, Conversation, Message, PaginatedUsersResponse are imported from '../components/chat/types'
// If not, they should be imported or defined here.
// For this example, let's assume they are available from:
import {
  User as ChatUser, // Alias to avoid conflict with User interface already in this file
  Conversation as ChatConversation, // This is the full conversation type
  // NewConversationResponse, // Removed as per previous subtask; type no longer exists
  Message as ChatMessage,
  PaginatedUsersResponse as ChatPaginatedUsersResponse
} from '../components/chat/types';


export async function getUsers(page: number, per_page: number, search?: string): Promise<ChatPaginatedUsersResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: per_page.toString(),
    });
    if (search) {
      params.append('search', search);
    }
    const response = await fetch(`${API_BASE_URL}/api/chat/users?${params.toString()}`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, 'Failed to fetch users');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching users:', error);
    throw error;
  }
}

export async function createConversation(user2_id: number): Promise<ChatConversation> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ user2_id }),
    });
    
    // The backend for this route returns an object with 'id', 'user1_id', 'user2_id', 'created_at'.
    // We need to map 'id' to 'conversation_id' to match the ChatConversation type.
    const backendResponse = await handleApiError(response, 'Failed to create or get conversation');

    if (backendResponse && typeof backendResponse.id !== 'undefined') {
      backendResponse.conversation_id = backendResponse.id;
      delete backendResponse.id; // Remove original 'id' to align with ChatConversation type
    }
    // The backendResponse might not have all fields of ChatConversation (e.g. other_username, last_message_content).
    // However, it now has conversation_id and the core fields.
    // Components using this must be aware of what fields are actually populated by this specific API call.
    return backendResponse as ChatConversation;
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error creating/getting conversation:', error);
    throw error;
  }
}

export async function getUserConversations(): Promise<ChatConversation[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, 'Failed to fetch user conversations');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching user conversations:', error);
    throw error;
  }
}

export async function getMessages(conversation_id: number, limit: number, offset: number): Promise<ChatMessage[]> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversation_id}/messages?${params.toString()}`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, `Failed to fetch messages for conversation ${conversation_id}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error fetching messages for conversation ${conversation_id}:`, error);
    throw error;
  }
}

export async function uploadChatFile(file: File, conversationId: number): Promise<{ file_url: string; file_name: string; file_type: string, file_extension?: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversation_id', conversationId.toString());

    const response = await fetch(`${API_BASE_URL}/api/chat/upload_file`, {
      method: 'POST',
      headers: { ...getAuthHeader() }, // Content-Type is set automatically for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to upload chat file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error uploading chat file:', error);
    throw error;
  }
}

export async function sendMessage(
  conversation_id: number,
  content: string,
  file_url?: string,
  file_name?: string,
  file_type?: string
): Promise<ChatMessage> {
  try {
    const payload: any = { content };
    if (file_url && file_name && file_type) {
      payload.file_url = file_url;
      payload.file_name = file_name;
      payload.file_type = file_type;
    }

    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversation_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, `Failed to send message to conversation ${conversation_id}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error sending message to conversation ${conversation_id}:`, error);
    throw error;
  }
}

// Add the new function here:
export async function startConversationAndSendMessage(
  recipientUserId: number,
  content: string,
  fileUrl?: string,
  fileName?: string,
  fileType?: string
): Promise<ChatConversation> { // Assuming backend returns the full conversation object
  try {
    const payload: any = {
      recipient_id: recipientUserId,
      content: content
    };
    if (fileUrl && fileName && fileType) {
      payload.file_url = fileUrl;
      payload.file_name = fileName;
      payload.file_type = fileType;
    }

    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/start_and_send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    // Assuming handleApiError will parse the JSON response and return it as ChatConversation
    // The backend should return the full conversation object, potentially including the first message as 'last_message'
    return handleApiError(response, 'Failed to start conversation and send message');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error starting conversation with user ${recipientUserId}:`, error);
    throw error;
  }
}

export async function findConversationByUserId(otherUserId: number): Promise<ChatConversation | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/with_user/${otherUserId}`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });

    if (response.status === 404) {
      try { await response.text(); } catch (e) { /* Consume body if any, ignore error */ }
      setGlobalOfflineStatus(false); 
      return null; 
    }

    const responseData = await handleApiError(response, `Finding conversation with user ${otherUserId}`);

    if (response.ok) {
      if (responseData && typeof responseData.conversation_id === 'number') {
        return responseData as ChatConversation;
      } else {
        // console.warn('findConversationByUserId: Received OK response but data is not a valid conversation object:', responseData);
        return null;
      }
    }
    
    // console.warn('findConversationByUserId: Unexpected state after handleApiError for non-OK response.');
    return null; 

  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    // console.error(`Error in findConversationByUserId for user ${otherUserId}:`, error); // Error will be logged by ChatMain
    throw error; 
  }
}
// --- End Chat API Functions ---

// --- Super Admin File Permission Management Functions ---

export async function getUserFilePermissions(userId: number): Promise<FilePermission[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/permissions`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, `Failed to fetch file permissions for user ${userId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error fetching file permissions for user ${userId}:`, error);
    throw error;
  }
}

export async function updateUserFilePermissions(
  userId: number,
  permissions: FilePermissionUpdatePayload[]
): Promise<UpdateUserFilePermissionsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(permissions),
    });
    return handleApiError(response, `Failed to update file permissions for user ${userId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error updating file permissions for user ${userId}:`, error);
    throw error;
  }
}

// --- Bulk Action API Functions ---

/**
 * Represents the type of item being targeted in a bulk action.
 * Should align with backend's `ALLOWED_BULK_ITEM_TYPES`.
 */
export type BulkItemType = 'document' | 'patch' | 'link' | 'misc_file';

/**
 * Response type for bulk delete operations.
 */
export interface BulkDeleteResponse {
  msg: string;
  deleted_count: number;
  failed_ids: number[];
}

/**
 * Response type for bulk move operations.
 */
export interface BulkMoveResponse {
  msg: string;
  moved_count: number;
  failed_items: Array<{ id: number; error: string }>; // Backend sends failed_items_details
}

/**
 * Performs a bulk delete operation on specified items.
 * @param itemIds - An array of item IDs to delete.
 * @param itemType - The type of items to delete (e.g., 'document', 'patch').
 * @returns A promise that resolves to the backend's response.
 */
export async function bulkDeleteItems(itemIds: number[], itemType: BulkItemType): Promise<BulkDeleteResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bulk/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ item_ids: itemIds, item_type: itemType }),
    });
    return handleApiError(response, `Failed to bulk delete ${itemType} items`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error bulk deleting ${itemType} items:`, error);
    throw error;
  }
}

/**
 * Performs a bulk download operation for specified items.
 * The backend will respond with a zip file containing the requested items.
 * @param itemIds - An array of item IDs to download.
 * @param itemType - The type of items to download (e.g., 'document', 'patch').
 * @returns A promise that resolves to a Blob (the zip file).
 */
export async function bulkDownloadItems(itemIds: number[], itemType: BulkItemType): Promise<Blob> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bulk/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ item_ids: itemIds, item_type: itemType }),
    });

    if (!response.ok) {
      // If response is not OK, backend should send a JSON error message
      // Use handleApiError to parse it and throw an error
      // Note: handleApiError throws, so we don't need to return its result here.
      // We await it to ensure the error is processed before any further (unlikely) execution.
      await handleApiError(response, `Failed to initiate bulk download for ${itemType} items`);
      // The line above will throw, so the code below this won't execute on error.
      // Adding a fallback throw just in case handleApiError's behavior changes or is misinterp.
      throw new Error(`Bulk download initiation failed with status ${response.status}`);
    }
    setGlobalOfflineStatus(false); // Successful response implies connection is fine
    // If response is OK, expect a blob (zip file)
    return response.blob();
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error bulk downloading ${itemType} items:`, error);
    throw error;
  }
}

/**
 * Performs a bulk move operation on specified items.
 * @param itemIds - An array of item IDs to move.
 * @param itemType - The type of items to move.
 * @param targetMetadata - An object containing the target foreign key IDs (e.g., { target_software_id: 123 }).
 * @returns A promise that resolves to the backend's response.
 */
export async function bulkMoveItems(
  itemIds: number[], 
  itemType: BulkItemType, 
  targetMetadata: Record<string, any>
): Promise<BulkMoveResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bulk/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ 
        item_ids: itemIds, 
        item_type: itemType, 
        target_metadata: targetMetadata 
      }),
    });
    return handleApiError(response, `Failed to bulk move ${itemType} items`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error bulk moving ${itemType} items:`, error);
    throw error;
  }
}
// --- End Bulk Action API Functions ---
// --- User Dashboard Layout Preferences API Functions ---
// Simplified layout type for API communication.
// `react-grid-layout` uses `Layout[]` which is `Array<Layout>`
// where Layout is {i: string, x: number, y: number, w: number, h: number, ...otherProps}
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  // Add other properties if your backend expects/stores them
}
export type LayoutObject = Record<string, LayoutItem[]>; // e.g., { lg: LayoutItem[], md: LayoutItem[], ... }

export async function getUserDashboardLayout(): Promise<LayoutObject> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/dashboard-layout`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    // Assuming handleApiError correctly parses and returns the JSON object
    return handleApiError(response, 'Failed to fetch dashboard layout');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching dashboard layout:', error);
    throw error; // Re-throw to be caught by the calling component
  }
}

export async function saveUserDashboardLayout(layout: LayoutObject): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/dashboard-layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(layout),
    });
    return handleApiError(response, 'Failed to save dashboard layout');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error saving dashboard layout:', error);
    throw error; // Re-throw to be caught by the calling component
  }
}

// --- User Watch Preferences API Functions ---
export async function fetchUserWatchPreferences(): Promise<WatchPreference[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/watch_preferences`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch user watch preferences');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching user watch preferences:', error);
    throw error;
  }
}

export async function updateUserWatchPreferences(
  payload: UpdateWatchPreferencePayload[]
): Promise<{ message: string; updated_preferences: WatchPreference[] }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/watch_preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update user watch preferences');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating user watch preferences:', error);
    throw error;
  }
}
// --- End User Watch Preferences API Functions ---

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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch system health');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching system health:', error);
    throw error;
  }
}

// --- Maintenance Mode API Functions (for Super Admin) ---
export async function getMaintenanceModeStatus(): Promise<MaintenanceStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/maintenance-mode`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch maintenance mode status');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching maintenance mode status:', error);
    throw error;
  }
}

export async function enableMaintenanceMode(): Promise<MaintenanceStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/maintenance-mode/enable`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to enable maintenance mode');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error enabling maintenance mode:', error);
    throw error;
  }
}

export async function disableMaintenanceMode(): Promise<MaintenanceStatusResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/maintenance-mode/disable`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to disable maintenance mode');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error disabling maintenance mode:', error);
    throw error;
  }
}
// --- End Maintenance Mode API Functions ---

// --- Audit Log Fetch Function ---
export async function fetchAuditLogEntries(params: URLSearchParams): Promise<AuditLogResponse> {
  try {
    const url = `${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch audit logs');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch dashboard statistics');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
    const response = await fetch(`${API_BASE_URL}/api/security-questions`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch security questions');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch admin software versions');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching admin software versions:', error);
    throw error;
  }
}

export async function fetchAdminVersionById(versionId: number): Promise<AdminSoftwareVersion> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/versions/${versionId}`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch software version by ID');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  createdTo?: string,
  search?: string // Added search parameter
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
    if (search && search.trim() !== '') params.append('search', search); // Add search to params if provided
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/links${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Links can be public or require auth depending on permissions,
        // getAuthHeader() will include Authorization if token exists.
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch links');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  updatedTo?: string, // New
  search?: string // Added search parameter
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
    if (search && search.trim() !== '') params.append('search', search); // Add search to params if provided
    // <<< --- END OF NEW LOGIC --- >>>

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/documents${queryString ? `?${queryString}` : ''}`;
        
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Documents can be public or require auth depending on permissions
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch documents');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  releaseFrom?: string,
  releaseTo?: string,
  patchedByDeveloper?: string,
  search?: string // Added search parameter
): Promise<PaginatedPatchesResponse> {
  try {
    const params = new URLSearchParams();
    if (softwareId) params.append('software_id', softwareId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);

    if (releaseFrom) params.append('release_from', releaseFrom);
    if (releaseTo) params.append('release_to', releaseTo);
    if (patchedByDeveloper) params.append('patched_by_developer', patchedByDeveloper);
    if (search && search.trim() !== '') params.append('search', search); // Add search to params if provided

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/patches${queryString ? `?${queryString}` : ''}`;
        
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch patches');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching patches:', error);
    throw error;
  }
}

export async function searchData(query: string): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        // Search results can be public or require auth depending on permissions
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    // Using handleApiError for consistent processing
    return handleApiError(response, 'Failed to search');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error searching:', error);
    throw error;
  }
}

export async function fetchVersionsForSoftware(softwareId: number): Promise<SoftwareVersion[]> { 
  try {
    const response = await fetch(`${API_BASE_URL}/api/versions_for_software?software_id=${softwareId}`, {
      method: 'GET',
      headers: {
        // This is often a public endpoint or for populating dropdowns
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch versions for software');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching versions for software:', error);
    throw error;
  }
}

// --- Authentication Functions ---

export async function registerUser(data: RegisterRequest): Promise<RegisterResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const responseData: RegisterResponse = await handleApiError(response, 'Registration failed');
    return responseData; 
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
    // The type assertion `as Promise<AuthResponseTypeFromTypes>` is important here
    // if handleApiError has a more generic return type like `Promise<any>`.
    const data = await handleApiError(response, 'Login failed', true) as AuthResponseTypeFromTypes;
    
    // Assuming authContext.login is available, e.g. via a hook or passed in.
    // This part is conceptual as api.ts doesn't directly use AuthContext.
    // The actual call to authContext.login will be in the component that uses this loginUser function.
    // For the purpose of this subtask, we're ensuring the data structure is correct.
    // The AuthContext will consume data.user_id.
    // Example of what would happen in the component:
    // const auth = useAuth(); 
    // auth.login(data.access_token, data.username, data.role, data.user_id, TOKEN_EXPIRY_SECONDS, data.password_reset_required);

    return data; // Return the full data object including user_id

  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching protected data:', error);
    throw error; 
  }
}

// --- Admin Document Functions ---

// Payload type for editing documents, ensure this is defined in types.ts
// For example:
// export interface EditDocumentPayload {
//   software_id: number;
//   doc_name: string;
//   description: string;
//   doc_type: string;
//   // any other metadata fields
// }
// Make sure AddDocumentPayload can be used or a specific EditDocumentPayload is created and imported.
// For now, we will use AddDocumentPayload for data fields if suitable, or assume EditDocumentPayload exists.

export async function addAdminDocumentWithUrl(payload: AddDocumentPayload): Promise<DocumentType> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/add_with_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({...payload, is_external_link: true }), 
    });
    return handleApiError(response, 'Failed to add document with URL');
  } catch (error: any) { 
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) { 
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error adding admin patch with URL:', error); throw error;
  }
}

export async function uploadAdminPatchFile(formData: FormData): Promise<Patch> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/upload_file`, {
      method: 'POST', headers: { ...getAuthHeader() }, body: formData,
    });
    return handleApiError(response, 'Failed to upload patch file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error uploading admin patch file:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error adding admin link with URL:', error); throw error;
  }
}
export async function uploadAdminLinkFile(formData: FormData): Promise<Link> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/upload_file`, {
      method: 'POST', headers: { ...getAuthHeader() }, body: formData,
    });
    return handleApiError(response, 'Failed to upload link file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error uploading admin link file:', error); throw error;
  }
}

// --- Misc Category API Functions ---

export async function fetchMiscCategories(): Promise<MiscCategory[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/misc_categories`, {
      method: 'GET',
      headers: {
        // Public endpoint
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch misc categories');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error uploading misc file:', error);
    throw error;
  }
}

export async function fetchMiscFiles(
  categoryId?: number,
  page?: number,
  perPage?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  search?: string // Added search parameter
): Promise<PaginatedMiscFilesResponse> {
  try {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', categoryId.toString());
    if (page) params.append('page', page.toString());
    if (perPage) params.append('per_page', perPage.toString());
    if (sortBy) params.append('sort_by', sortBy);
    if (sortOrder) params.append('sort_order', sortOrder);
    if (search && search.trim() !== '') params.append('search', search); // Add search to params if provided

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/misc_files${queryString ? `?${queryString}` : ''}`;
        
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Misc files can be public or require auth depending on permissions
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch misc files');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating document with URL:', error); throw error;
  }
}

// Updated editAdminDocumentFile
export async function editAdminDocumentFile(documentId: number, data: AddDocumentPayload, file?: File | null): Promise<DocumentType> {
  try {
    const formData = new FormData();
    // Append all fields from data to formData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value)); // Ensure value is string
      }
    });

    if (file) {
      formData.append('file', file);
    }

    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, // Content-Type is set automatically for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to update document with file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating document with file:', error); throw error;
  }
}

export async function deleteAdminDocument(documentId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/documents/${documentId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete document');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting document:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating patch with URL:', error); throw error;
  }
}

// Updated editAdminPatchFile
export async function editAdminPatchFile(patchId: number, data: EditPatchPayloadFlexible, file?: File | null): Promise<Patch> {
  try {
    const formData = new FormData();
    // Append all fields from data to formData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Special handling for compatible_vms_version_ids_json as it's expected to be a JSON string
        if (key === 'compatible_vms_version_ids_json' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    if (file) {
      formData.append('file', file);
    }

    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, // Content-Type is set automatically for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to update patch with file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating patch with file:', error); throw error;
  }
}

export async function deleteAdminPatch(patchId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/patches/${patchId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete patch');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting patch:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating link with URL:', error); throw error;
  }
}

// Updated editAdminLinkFile
export async function editAdminLinkFile(linkId: number, data: EditLinkPayloadFlexible, file?: File | null): Promise<Link> {
  try {
    const formData = new FormData();
    // Append all fields from data to formData
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
         // Special handling for compatible_vms_version_ids_json as it's expected to be a JSON string
        if (key === 'compatible_vms_version_ids_json' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    if (file) {
      formData.append('file', file);
    }

    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/edit_file`, {
      method: 'PUT',
      headers: { ...getAuthHeader() }, // Content-Type is set automatically for FormData
      body: formData,
    });
    return handleApiError(response, 'Failed to update link with file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating link with file:', error); throw error;
  }
}

export async function deleteAdminLink(linkId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/links/${linkId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete link');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting link:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating misc category:', error); throw error;
  }
}

export async function deleteAdminMiscCategory(categoryId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_categories/${categoryId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete misc category');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting misc category:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating misc file:', error); throw error;
  }
}

export async function deleteAdminMiscFile(fileId: number): Promise<{ msg: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/misc_files/${fileId}/delete`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to delete misc file');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting misc file:', error); throw error;
  }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to get favorite status');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch user favorites');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating email:', error);
    throw error;
  }
}

// --- Username Update Function ---
export interface UpdateUsernamePayload {
  new_username: string;
  current_password: string;
}

export interface UpdateUsernameResponse {
  msg: string;
  new_username: string; // Backend confirms the new username
}

export async function updateUsername(payload: UpdateUsernamePayload): Promise<UpdateUsernameResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/profile/update-username`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to update username');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error updating username:', error);
    throw error;
  }
}
// --- End Username Update Function ---

// --- User Profile Picture Upload ---
export interface UploadProfilePictureResponse {
  msg: string; // Success message from backend
  profile_picture_url: string; // The new URL of the profile picture
}

export async function uploadUserProfilePicture(formData: FormData): Promise<UploadProfilePictureResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/profile/upload-picture`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(), // Authorization token
        // Content-Type is not set here, browser sets it for FormData
      },
      body: formData,
    });
    return handleApiError(response, 'Failed to upload profile picture');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error uploading profile picture:', error);
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error resetting password with token:', error);
    throw error;
  }
}
// --- End Password Reset API Functions ---

// --- Comment Management API Functions ---
export async function addComment(itemType: string, itemId: number, payload: AddCommentPayload): Promise<Comment> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items/${itemType}/${itemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, `Failed to add comment to ${itemType} ID ${itemId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error adding comment to ${itemType} ID ${itemId}:`, error);
    throw error;
  }
}

export async function fetchComments(itemType: string, itemId: number, page: number = 1, perPage: number = 20): Promise<PaginatedCommentsResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    const response = await fetch(`${API_BASE_URL}/api/items/${itemType}/${itemId}/comments?${params.toString()}`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(), // Optional auth for potentially user-specific details in future
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, `Failed to fetch comments for ${itemType} ID ${itemId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error fetching comments for ${itemType} ID ${itemId}:`, error);
    throw error;
  }
}

export async function updateComment(commentId: number, payload: UpdateCommentPayload): Promise<Comment> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, `Failed to update comment ID ${commentId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error updating comment ID ${commentId}:`, error);
    throw error;
  }
}

export async function deleteComment(commentId: number): Promise<{ msg: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    // handleApiError will parse JSON response (e.g., { msg: "..." }) or return null for 204
    return handleApiError(response, `Failed to delete comment ID ${commentId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error deleting comment ID ${commentId}:`, error);
    throw error;
  }
}

export async function fetchUserMentionSuggestions(query: string): Promise<UserMentionSuggestion[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/mention_suggestions?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache', // Typically good for suggestion endpoints
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to fetch user mention suggestions');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching user mention suggestions:', error);
    throw error;
  }
}
// --- End Comment Management API Functions ---

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
      headers: {
        ...getAuthHeader(),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    return handleApiError(response, 'Failed to list users');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
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
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error deleting user:', error);
    throw error;
  }
}

// --- Notification API Functions ---
export async function fetchNotifications(
  page: number = 1, 
  perPage: number = 10, 
  status?: 'all' | 'read' | 'unread' // Optional status filter
): Promise<PaginatedNotificationsResponse> {
  try {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    if (status) {
      params.append('status', status);
    }
    const response = await fetch(`${API_BASE_URL}/api/notifications?${params.toString()}`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, 'Failed to fetch notifications');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching notifications:', error);
    throw error;
  }
}

export async function fetchUnreadNotificationCount(): Promise<UnreadNotificationCountResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/unread_count`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, 'Failed to fetch unread notification count');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching unread notification count:', error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: number): Promise<Notification> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
    });
    return handleApiError(response, 'Failed to mark notification as read');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(): Promise<{ msg: string, count_marked_read?: number }> { 
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/mark_all_read`, {
      method: 'PUT',
      headers: { ...getAuthHeader() },
    });
    // Assuming backend returns { msg: string, count_marked_read: number }
    // If backend returns only { msg: string }, then adjust the Promise type and how response is handled.
    // For now, assuming it could include count_marked_read for better feedback.
    return handleApiError(response, 'Failed to mark all notifications as read');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

export async function clearAllNotifications(): Promise<{ msg: string, count_deleted?: number }> { 
  try {
    const response = await fetch(`${API_BASE_URL}/api/notifications/clear_all`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    // Similar to markAllNotificationsAsRead, assuming backend could return count_deleted.
    return handleApiError(response, 'Failed to clear all notifications');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error clearing all notifications:', error);
    throw error;
  }
}
// --- End Notification API Functions ---

// --- Super Admin Create User ---
export interface SuperAdminCreateUserPayload {
  username: string;
  password: string;
  email?: string;
  role: 'user' | 'admin' | 'super_admin';
  security_answers: Array<{ question_id: number; answer: string }>;
}

export async function superAdminCreateUser(userData: SuperAdminCreateUserPayload): Promise<User> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/users/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(userData),
    });
    return handleApiError(response, 'Failed to create user via super admin');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error creating user via super admin:', error);
    throw error;
  }
}
// --- End Super Admin Create User ---

// --- Super Admin Database Reset Functions ---
export interface DatabaseResetStartResponse {
  message: string;
  backup_path: string;
  log_file: string;
}

export async function startDatabaseReset(reason: string): Promise<DatabaseResetStartResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/database/reset/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ reason }),
    });
    return handleApiError(response, 'Failed to start database reset process');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error starting database reset:', error);
    throw error;
  }
}

export interface DatabaseResetConfirmPayload {
  reset_password: string;
  confirmation_text: string;
}

export interface DatabaseResetConfirmResponse {
  message: string;
}

export async function confirmDatabaseReset(payload: DatabaseResetConfirmPayload): Promise<DatabaseResetConfirmResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/database/reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to confirm database reset');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error confirming database reset:', error);
    throw error;
  }
}
// --- End Super Admin Database Reset Functions ---

// --- Announcement API ---
export interface CreateAnnouncementResponse {
  msg: string;
  announcement_id: number;
}

export const createAnnouncement = async (message: string): Promise<CreateAnnouncementResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/superadmin/announcements/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ message: message }),
    });
    return handleApiError(response, 'Failed to create announcement');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error creating announcement:', error);
    throw error;
  }
};
// --- End Announcement API ---

// --- Chat Batch Clear API Function ---
export interface ClearBatchConversationsResultDetails {
  conversation_id: number;
  status: string; // e.g., "cleared", "skipped", "error"
  messages_deleted: number;
  files_deleted: number;
  error?: string | null;
}
export interface ClearBatchConversationsResponse {
  status: string; // "success" or "failed"
  details?: ClearBatchConversationsResultDetails[];
  message?: string; // Overall message, especially on failure
  msg?: string; // Alternative for message, ensure consistency with handleApiError
}

export async function clearBatchConversations(conversationIds: number[]): Promise<ClearBatchConversationsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/clear-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ conversation_ids: conversationIds }),
    });
    // The handleApiError will throw for non-OK responses.
    // The expected success response (200 OK) will be parsed here.
    return handleApiError(response, 'Failed to clear batch conversations');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error clearing batch conversations:', error);
    // Re-throw to be caught by the calling component, which will handle UI updates (e.g., toast)
    throw error;
  }
}
// --- End Chat Batch Clear API Function ---

// --- User Feedback API Functions ---
export interface UserFeedback {
  id: number;
  user_id: number;
  message_content: string;
  type: 'bug' | 'feedback';
  created_at: string; // ISO date string
  is_resolved: boolean;
  username?: string; // Joined from users table
  profile_picture_filename?: string | null; // Joined from users table
}

export interface UserFeedbackSubmission {
  message_content: string;
  type: 'bug' | 'feedback';
}

// Generic PaginatedResponse (if not already defined elsewhere)
export interface PaginatedResponse<T> {
  feedback: T[]; // Renaming 'items' to 'feedback' to match backend key for this specific response
  total_feedback: number;
  total_pages: number;
  page: number;
  per_page: number;
}

export async function submitUserFeedback(payload: UserFeedbackSubmission): Promise<UserFeedback> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleApiError(response, 'Failed to submit user feedback');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error submitting user feedback:', error);
    throw error;
  }
}

export async function fetchAdminFeedback(params: {
  page?: number;
  perPage?: number;
  resolved_status?: 'true' | 'false' | 'all';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<PaginatedResponse<UserFeedback>> {
  try {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.perPage) queryParams.append('per_page', params.perPage.toString());
    if (params.resolved_status) queryParams.append('resolved_status', params.resolved_status);
    if (params.sortBy) queryParams.append('sort_by', params.sortBy);
    if (params.sortOrder) queryParams.append('sort_order', params.sortOrder);

    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}/api/admin/feedback${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, 'Failed to fetch admin feedback');
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error('Error fetching admin feedback:', error);
    throw error;
  }
}

export async function updateAdminFeedbackStatus(feedbackId: number, isResolved: boolean): Promise<UserFeedback> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/feedback/${feedbackId}/resolve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ is_resolved: isResolved }),
    });
    return handleApiError(response, `Failed to update feedback status for ID ${feedbackId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error updating feedback status for ID ${feedbackId}:`, error);
    throw error;
  }
}
// --- End User Feedback API Functions ---

export const getUserChatStatus = async (userId: number): Promise<{ is_online: boolean; last_seen: string | null }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/user_status/${userId}`, {
      method: 'GET',
      headers: { ...getAuthHeader(), 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    return handleApiError(response, `Failed to fetch chat status for user ${userId}`);
  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    console.error(`Error fetching chat status for user ${userId}:`, error);
    throw error;
  }
};

// --- Large File Upload (Chunked) ---

function generateUUID() { // Public Domain/MIT
  let d = new Date().getTime();//Timestamp
  let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    let r = Math.random() * 16;//random number between 0 and 16
    if(d > 0){//Use timestamp until depleted
      r = (d + r)%16 | 0;
      d = Math.floor(d/16);
    } else {//Use microseconds since page-load if supported
      r = (d2 + r)%16 | 0;
      d2 = Math.floor(d2/16);
    }
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Uploads a file in chunks to the backend.
 * @param file The file to upload.
 * @param itemType The type of item being uploaded (e.g., 'document', 'patch').
 * @param metadata An object containing all other necessary form data.
 * @param onProgress A callback function to report upload progress (percentage 0-100).
 * @returns A promise that resolves to the server's response for the last chunk (finalized file details).
 */
export async function uploadFileInChunks(
  file: File,
  itemType: string,
  metadata: Record<string, any>,
  onProgress: (progress: number) => void
): Promise<any> { // The return type 'any' should ideally be the specific type of the uploaded item (DocumentType, Patch, etc.)
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
  const total_chunks = Math.ceil(file.size / CHUNK_SIZE);
  const upload_id = (crypto.randomUUID ? crypto.randomUUID() : generateUUID()); // Generate a unique ID for this upload session

  let finalResponse: any = null;

  try {
    for (let chunk_number = 0; chunk_number < total_chunks; chunk_number++) {
      const start_byte = chunk_number * CHUNK_SIZE;
      const end_byte = Math.min(file.size, start_byte + CHUNK_SIZE);
      const file_chunk = file.slice(start_byte, end_byte);

      const formData = new FormData();
      formData.append('file_chunk', file_chunk, file.name); // Add filename for the blob
      formData.append('chunk_number', chunk_number.toString());
      formData.append('total_chunks', total_chunks.toString());
      formData.append('upload_id', upload_id);
      formData.append('original_filename', file.name);
      formData.append('item_type', itemType);

      // Append all metadata fields to FormData
      for (const key in metadata) {
        if (Object.prototype.hasOwnProperty.call(metadata, key) && metadata[key] !== undefined && metadata[key] !== null) {
          formData.append(key, metadata[key]);
        }
      }

      // Log FormData content for debugging the first chunk
      // if (chunk_number === 0 || chunk_number === total_chunks -1) {
      //   console.log(`FormData for chunk ${chunk_number} (upload_id: ${upload_id}):`);
      //   formData.forEach((value, key) => {
      //     if (value instanceof File) {
      //       console.log(`${key}: File { name: "${value.name}", size: ${value.size}, type: "${value.type}" }`);
      //     } else {
      //       console.log(`${key}: ${value}`);
      //     }
      //   });
      // }


      const response = await fetch(`${API_BASE_URL}/api/admin/upload_large_file`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          // Content-Type is automatically set by the browser for FormData
        },
        body: formData,
      });

      // Use handleApiError for response checking. It will throw on non-OK responses.
      // The response from handleApiError is the parsed JSON body.
      const chunkResponse = await handleApiError(response, `Failed to upload chunk ${chunk_number + 1}/${total_chunks}`);

      if (chunk_number === total_chunks - 1) {
        finalResponse = chunkResponse; // Store the response from the last chunk
      }

      // Report progress
      const progress = ((chunk_number + 1) / total_chunks) * 100;
      onProgress(progress);

      // Optional: Small delay between chunks if needed, though typically not necessary
      // await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!finalResponse) {
      // This case should ideally not be reached if total_chunks > 0 and loop completes
      throw new Error("Upload completed but no final response was received.");
    }
    return finalResponse;

  } catch (error: any) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      setGlobalOfflineStatus(true);
      showErrorToast(OFFLINE_MESSAGE);
    }
    // Re-throw the error so the calling component can handle it (e.g., display error message)
    console.error('Error during chunked file upload:', error);
    // The error object might already be structured by handleApiError.
    // If not, or if it's a different type of error, ensure it's useful.
    throw error;
  }
}
