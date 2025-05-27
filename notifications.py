# Notification Event Types
DOCUMENT_ADDED = "document_added"
DOCUMENT_DELETED = "document_deleted"
DOCUMENT_UPDATED = "document_updated"
PERMISSION_CHANGED = "permission_changed"
COMMENT_ADDED = "comment_added"
USER_MENTIONED = "user_mentioned"
FILE_UPLOAD_COMPLETED = "file_upload_completed"
FILE_DOWNLOAD_COMPLETED = "file_download_completed"
BULK_ACTION_DOCUMENTS_DELETED = "bulk_action_documents_deleted"

# Define any other constants related to notifications here
# For example, default notification preferences or roles that receive certain notifications by default.

# It might also be useful to have a list of all event types
ALL_EVENT_TYPES = [
    DOCUMENT_ADDED,
    DOCUMENT_DELETED,
    DOCUMENT_UPDATED,
    PERMISSION_CHANGED,
    COMMENT_ADDED,
    USER_MENTIONED,
    FILE_UPLOAD_COMPLETED,
    FILE_DOWNLOAD_COMPLETED,
    BULK_ACTION_DOCUMENTS_DELETED,
]
