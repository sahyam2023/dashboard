// frontend/src/components/chat/types.ts

export interface User {
  id: number;
  username: string;
  profile_picture_filename?: string | null;
  profile_picture_url?: string | null; // Frontend might construct this
  is_active?: boolean; // Optional, as /api/users for chat might only return active users
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  recipient_id: number;
  content: string; // Will store filename if it's a file message, or text content
  created_at: string; // ISO string date
  is_read: boolean;
  file_name?: string | null; // Original name of the uploaded file
  file_url?: string | null;
  file_type?: 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'doc' | 'binary' | null; // Broad categories
  sender_username?: string; // Usually joined in backend
  recipient_username?: string; // Usually joined in backend
  sender_profile_picture_url?: string | null; // Added for SocketIO message data
}

export interface Conversation {
  conversation_id: number; // Matches 'id' from conversations table, aliased in get_user_conversations
  user1_id: number;
  user2_id: number;
  created_at: string; // ISO string date for conversation creation

  // Fields from get_user_conversations
  other_user_id: number;
  other_username: string;
  other_profile_picture?: string | null; // Filename
  other_profile_picture_url?: string | null; // Constructed URL

  last_message_content?: string | null;
  last_message_created_at?: string | null; // ISO string date
  last_message_sender_id?: number | null;
  unread_messages_count?: number;
}

// For API responses that include pagination
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
}

// Specifically for /api/users response if it's paginated
export interface PaginatedUsersResponse {
  users: User[];
  page: number;
  per_page: number;
  total_users: number;
  total_pages: number;
}
