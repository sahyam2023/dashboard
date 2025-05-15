// src/types/index.ts

// --- Software Types ---
export interface Software {
  id: number;
  name: string;
  description: string | null; // Can be null
}

// --- Link Types ---
export interface Link {
  id: number;
  title: string;
  url: string; // This will be the external URL or server path like /link_uploads/...
  description: string | null;
  software_id: number;
  version_id: number | null; // Optional
  software_name?: string; // Added by backend join for display
  version_name?: string;  // Added by backend join for display (might be version_number)
  is_external_link: boolean;
  stored_filename: string | null;
  original_filename_ref: string | null;
  file_size: number | null;
  file_type: string | null;
  created_at?: string; // From backend
  category?: string; // From original definition
}

// --- Document Types ---
export interface Document {
  id: number;
  doc_name: string;
  description: string | null;
  download_link: string;
  doc_type: string | null;
  software_name: string; // From backend join
  software_id?: number; // Consistent with other types
  is_external_link?: boolean; // Add if you use this in the frontend display logic
  // Additional fields from schema if needed (file_size, etc.)
}

// --- Patch Types ---
export interface Patch {
  id: number;
  patch_name: string;
  description: string | null;
  download_link: string;
  release_date: string | null;
  version_number: string; // From backend join
  software_name: string; // From backend join
  software_id: number; // From backend (useful for filtering)
  is_external_link?: boolean;
}

// --- Auth Types ---
export interface AuthRequest {
  username: string;
  password?: string; // Password is not always in every auth request (e.g. password reset token)
  email?: string;    // Optional for registration
}

export interface RegisterRequest extends AuthRequest {
  password_hash?: never; // Ensure password_hash is not part of the request
  password: string; // Make password required for registration
}

export interface LoginRequest extends AuthRequest {
  password_hash?: never; // Ensure password_hash is not part of the request
  password: string; // Make password required for login
}

export interface AuthResponse {
  access_token: string;
  username: string; // Or a full user object if your backend returns more
  role: string;  
}

export interface RegisterResponse {
  msg: string;
  user_id?: number; // Backend returns user_id on successful registration
}

// --- Admin Payload Types for Adding Content ---
export interface AddDocumentPayload {
  software_id: number;
  doc_name: string;
  // For adding with URL directly:
  download_link?: string; // URL if is_external_link is true
  is_external_link?: boolean;
  // Other metadata
  description?: string;
  doc_type?: string;
  // File itself is handled via FormData if not external
}

export interface AddPatchPayload {
  version_id: number;
  patch_name: string;
  download_link?: string; // URL if is_external_link is true
  is_external_link?: boolean;
  description?: string;
  release_date?: string;
}

export interface AddLinkPayload {
  software_id: number;
  version_id?: number | null; // Optional
  title: string;
  url?: string; // URL if is_external_link is true
  is_external_link?: boolean;
  description?: string;
}

// --- Misc Category Types ---
export interface MiscCategory {
  id: number;
  name: string;
  description: string | null;
  created_at?: string; // Backend's POST response might include this
}

export interface AddCategoryPayload {
  name: string;
  description?: string;
}

// --- Misc File Types (for admin uploads to Misc Categories) ---
export interface MiscFile {
  id: number;
  misc_category_id: number;
  category_name?: string; // From backend join
  user_id: number; // Admin who uploaded
  user_provided_title: string | null;
  user_provided_description: string | null;
  original_filename: string;
  stored_filename: string;
  file_path: string; // Server path, e.g., /misc_uploads/unique_name.ext
  file_type: string | null;
  file_size: number | null;
  uploaded_at: string;
}