// src/types/index.ts

// --- Software Types ---
export interface Software {
  id: number;
  name: string;
  description: string | null;
  is_favorited?: boolean;
  favorite_id?: number;
}

// --- Version Type (from /api/versions_for_software for dropdowns) ---
// Also used for full version details in some contexts
export interface SoftwareVersion {
  id: number; // This is the version_id from the 'versions' table
  software_id?: number; // Added for consistency, though not always in dropdowns
  software_name?: string; // Added for consistency
  version_number: string;
  release_date?: string | null;
  main_download_link?: string | null;
  changelog?: string | null;
  known_bugs?: string | null;
  created_by_user_id?: number;
  created_at?: string;
  updated_by_user_id?: number | null;
  updated_at?: string | null;
  is_favorited?: boolean;
  favorite_id?: number;
}

// --- Document Types ---
export interface Document {
  id: number;
  doc_name: string;
  description: string | null;
  download_link: string; // External URL or server path
  doc_type: string | null;
  software_id: number; // FK to software table
  software_name: string; // From backend join (software.name)
  is_external_link: boolean; // Should always be present from backend
  stored_filename?: string | null;
  original_filename_ref?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  created_at?: string;
  updated_at?: string;
  uploaded_by_username?: string;
  updated_by_username?: string;
  is_favorited?: boolean;
  favorite_id?: number;
  is_downloadable?: boolean;
}

// --- Patch Types ---
export interface Patch {
  id: number;
  patch_name: string;
  description: string | null;
  download_link: string; // External URL or server path
  release_date: string | null; // YYYY-MM-DD string

  // Version related fields from backend JOINs
  version_id: number;     // Actual FK to 'versions' table (v.id)
  version_number: string; // Display string like "1.2.3" (v.version_number)
  
  // Software related fields from backend JOINs (software associated with the version)
  software_id: number;    // ID of the Software Product (s.id)
  software_name: string;  // Name of the Software Product (s.name)
  
  is_external_link: boolean; // Should always be present
  stored_filename?: string | null;
  original_filename_ref?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  created_at?: string;
  updated_at?: string;
  patch_by_developer?: string | null;
  uploaded_by_username?: string;
  updated_by_username?: string;
  is_favorited?: boolean;
  favorite_id?: number;
  is_downloadable?: boolean;
}

// --- Link Types ---
export interface Link {
  id: number;
  title: string;
  url: string; // External URL or server path
  description: string | null;
  
  // Software related fields for the link itself
  software_id: number;   // FK to software table (l.software_id)
  software_name: string; // From backend JOIN (s.name) - make non-optional if always joined

  // Version related fields (MANDATORY for Links) from backend JOINs
  version_id: number;    // Actual FK to 'versions' table (v.id)
  version_number: string;// Display string like "1.2.3" (v.version_number)

  is_external_link: boolean; // Should always be present
  stored_filename?: string | null;
  original_filename_ref?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  created_at?: string;
  updated_at?: string;
  uploaded_by_username?: string;
  updated_by_username?: string;
  is_favorited?: boolean;
  favorite_id?: number;
  is_downloadable?: boolean;
  // category?: string; // Removed as it's not in the current backend schema for links
}


// --- Auth Types ---
export interface AuthRequest {
  username: string;
  password?: string;
  email?: string;
}

export interface SecurityAnswerPayload {
  question_id: number;
  answer: string;
}

export interface RegisterRequest extends AuthRequest {
  password: string; // Make password required
  password_hash?: never;
  security_answers: SecurityAnswerPayload[];
}

export interface LoginRequest extends AuthRequest {
  password: string; // Make password required
  password_hash?: never;
}

export interface AuthResponse {
  access_token: string;
  username: string;
  role: string;
  password_reset_required?: boolean; // Added this line
}

export interface RegisterResponse {
  msg: string;
  user_id: number; // Made non-optional as per backend successful response
  role: string; // Added
  access_token: string; // Added
  username: string; // Added
}

// --- Admin Payload Base for Items with Flexible Version Handling ---
interface BasePayloadWithFlexibleVersion {
  software_id: number;        // ID of the Software Product (context for typed_version_string)
  version_id?: number | null;  // If selecting an existing version from a dropdown
  typed_version_string?: string; // If typing a new/different version string
  description?: string;
  is_external_link?: boolean; // Usually set based on endpoint or input mode in the form
}

// --- Admin Payloads for Patches ---
export interface AddPatchPayloadFlexible extends BasePayloadWithFlexibleVersion {
  patch_name: string;
  release_date?: string; // YYYY-MM-DD string
  download_link?: string; // For URL mode (required if inputMode is URL)
  patch_by_developer?: string | null; // Added
  // software_id is inherited.
  // version_id OR typed_version_string must lead to a valid version (enforced by form/backend).
}
export type EditPatchPayloadFlexible = Partial<AddPatchPayloadFlexible>;

// --- Admin Payloads for Links ---
export interface AddLinkPayloadFlexible extends BasePayloadWithFlexibleVersion {
  title: string;
  url?: string; // For URL mode (required if inputMode is URL and not file upload)
  // software_id is inherited.
  // version_id OR typed_version_string must lead to a valid version (enforced by form/backend as version is mandatory for links).
}
export type EditLinkPayloadFlexible = Partial<AddLinkPayloadFlexible>;

// --- Admin Payloads for Documents (No flexible version handling needed for documents directly) ---
export interface AddDocumentPayload {
  software_id: number;
  doc_name: string;
  download_link?: string; // URL if is_external_link is true
  is_external_link?: boolean;
  description?: string;
  doc_type?: string;
}
// For editing documents, can use Partial<AddDocumentPayload> if appropriate
export type EditDocumentPayload = Partial<AddDocumentPayload>;


// --- Misc Category Types ---
export interface MiscCategory {
  id: number;
  name: string;
  description: string | null;
  created_at?: string;
  // created_by_user_id?: number; // Optional if needed
  // updated_at?: string;
  // updated_by_user_id?: number; // Optional if needed
}

export interface AddCategoryPayload {
  name: string;
  description?: string;
}

export interface EditCategoryPayload { // Defined for clarity
  name?: string;
  description?: string;
}
// export type EditCategoryPayload = Partial<AddCategoryPayload>; // This also works


// --- Misc File Types ---
export interface MiscFile {
  id: number;
  misc_category_id: number;
  category_name?: string; // From backend JOIN
  user_id: number; // User who uploaded/created
  user_provided_title: string | null;
  user_provided_description: string | null;
  original_filename: string;
  stored_filename: string;
  file_path: string; // Server path, e.g., /misc_uploads/unique_name.ext
  file_type: string | null;
  file_size: number | null;
  created_at?: string; // Assuming backend field is created_at
  updated_at?: string;
  uploaded_by_username?: string;
  updated_by_username?: string;
  is_favorited?: boolean;
  favorite_id?: number;
  is_downloadable?: boolean;
}
// No specific EditMiscFilePayload type is defined here as edit operations for misc files
// (like replacing the file or changing metadata) will likely use FormData via editAdminMiscFile.

// --- File Permission Management Types ---
export type PermissibleFileType = 'document' | 'patch' | 'link' | 'misc_file';

export interface FilePermission {
  id: number;
  user_id: number;
  file_id: number;
  file_type: PermissibleFileType;
  can_view: boolean;
  can_download: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FilePermissionUpdatePayload {
  file_id: number;
  file_type: PermissibleFileType;
  can_view: boolean;
  can_download: boolean;
}

export interface UpdateUserFilePermissionsResponse {
  msg: string;
  permissions: FilePermission[];
}