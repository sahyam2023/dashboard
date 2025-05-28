# database.py
import sqlite3
import os

# No global DATABASE constant needed here anymore, as path will be passed in.
# BASE_DIR might still be needed for locating schema.sql relative to this file.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_db_connection(db_path: str):
    """Creates a database connection to the specified database path."""
    # print(f"DB_HELPER: Connecting to database at: {db_path}") # Optional: for debugging
    conn = sqlite3.connect(db_path)
    # conn.row_factory = sqlite3.Row # This is good, but often set in app.py's get_db for g.db
                                    # If you set it here, ensure it doesn't conflict or is consistently used.
                                    # For simplicity, let app.py handle row_factory on g.db
    return conn

def init_db(db_path: str):
    """Initializes the database at the specified path using schema.sql."""
    print(f"DB_HELPER: Attempting to initialize database at: {db_path}")
    
    # Ensure the directory for the database file exists
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir): # Check if db_dir is not empty (e.g. just filename)
        print(f"DB_HELPER: Creating directory for database: {db_dir}")
        os.makedirs(db_dir, exist_ok=True)

    conn = None
    try:
        conn = get_db_connection(db_path) # Use the modified function
        # It's good practice to set row_factory on the connection used for initialization too
        # if you rely on dict-like access in the software insertion part.
        conn.row_factory = sqlite3.Row 

        schema_path = os.path.join(BASE_DIR, 'schema.sql') # Assumes schema.sql is in the same dir as database.py
        if not os.path.exists(schema_path):
            print(f"DB_HELPER: ERROR - schema.sql not found at {schema_path}")
            return

        with open(schema_path, 'r') as f:
            sql_script = f.read()
            conn.executescript(sql_script)
        conn.commit()
        print("DB_HELPER: Database schema initialized successfully.")

        # Add initial software data (only if table is empty)
        cursor = conn.cursor() # Standard cursor for this operation
        cursor.execute("SELECT COUNT(*) FROM software")
        # fetchone() returns a tuple, e.g., (0,). Access the first element.
        count_row = cursor.fetchone()
        if count_row is not None and count_row[0] == 0:
            print("DB_HELPER: Adding initial software entries...")
            software_list = ['ITMS', 'VMS', 'Analytic Manager', 'ICCC']
            # Use executemany with a list of tuples
            cursor.executemany("INSERT INTO software (name) VALUES (?)", [(s,) for s in software_list])
            conn.commit()
            print("DB_HELPER: Initial software added.")
        elif count_row is not None:
            print("DB_HELPER: Software table already populated.")
        else:
            print("DB_HELPER: Could not determine count from software table (table might not exist - check schema).")

        # Add initial security questions (only if table is empty)
        cursor.execute("SELECT COUNT(*) FROM security_questions")
        count_row_questions = cursor.fetchone()
        if count_row_questions is not None and count_row_questions[0] == 0:
            print("DB_HELPER: Adding initial security questions...")
            default_questions = [
                ("What was your first pet's name?",),
                ("What city were you born in?",),
                ("What is your mother's maiden name?",),
                ("What was the name of your elementary school?",),
                ("What is your favorite book?",),
                ("What was the model of your first car?",)
            ]
            cursor.executemany("INSERT INTO security_questions (question_text) VALUES (?)", default_questions)
            conn.commit()
            print(f"DB_HELPER: Added {len(default_questions)} initial security questions.")
        elif count_row_questions is not None:
            print("DB_HELPER: Security questions table already populated.")
        else:
            print("DB_HELPER: Could not determine count from security_questions table (table might not exist - check schema).")

    except sqlite3.Error as e:
        print(f"DB_HELPER: An error occurred during DB initialization: {e}")
    except Exception as e: # Catch any other potential errors
        print(f"DB_HELPER: A general error occurred during DB initialization: {e}")
    finally:
        if conn:
            conn.close()

# Note: No other functions needed in this file for basic connection and init.
# Data fetching logic is now in app.py or will be called by app.py's route handlers.

# Favorite Management Functions

def add_favorite(db, user_id, item_id, item_type):
    """Adds an item to user's favorites."""
    try:
        cursor = db.execute(
            "INSERT INTO user_favorites (user_id, item_id, item_type) VALUES (?, ?, ?)",
            (user_id, item_id, item_type)
        )
        db.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # This typically means the (user_id, item_id, item_type) combination already exists,
        # which is fine, we can treat it as "already favorited".
        # For the API, we might want to fetch the existing one.
        # For now, returning None to indicate "no new row inserted" or an issue.
        print(f"DB_FAVORITES: IntegrityError when adding favorite for user {user_id}, item {item_id}, type {item_type}. Item might already be a favorite.")
        return None
    except sqlite3.Error as e:
        print(f"DB_FAVORITES: Error adding favorite for user {user_id}, item {item_id}, type {item_type}: {e}")
        return None

def remove_favorite(db, user_id, item_id, item_type):
    """Removes an item from user's favorites."""
    try:
        cursor = db.execute(
            "DELETE FROM user_favorites WHERE user_id = ? AND item_id = ? AND item_type = ?",
            (user_id, item_id, item_type)
        )
        db.commit()
        return cursor.rowcount > 0  # True if a row was deleted
    except sqlite3.Error as e:
        print(f"DB_FAVORITES: Error removing favorite for user {user_id}, item {item_id}, type {item_type}: {e}")
        return False

def get_favorite_status(db, user_id, item_id, item_type):
    """Checks if a specific item is favorited by the user."""
    try:
        cursor = db.execute(
            "SELECT id, user_id, item_id, item_type, created_at FROM user_favorites WHERE user_id = ? AND item_id = ? AND item_type = ?",
            (user_id, item_id, item_type)
        )
        return cursor.fetchone() # Returns a Row object or None
    except sqlite3.Error as e:
        print(f"DB_FAVORITES: Error fetching favorite status for user {user_id}, item {item_id}, type {item_type}: {e}")
        return None

def get_user_favorites(db, user_id, page, per_page, item_type_filter=None):
    """Retrieves a paginated list of a user's favorited items with details."""
    offset = (page - 1) * per_page
    
    # Base parts of the UNION ALL query
    # Each SELECT should have the same number and type of columns.
    # Columns: favorite_id, item_id, item_type, favorited_at, name, description, software_name, software_id, version_number
    
    select_clauses = []

    # Documents
    documents_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        d.doc_name AS name, d.description, s.name AS software_name, s.id AS software_id,
        NULL AS version_number, NULL as version_id
    FROM user_favorites uf
    JOIN documents d ON uf.item_id = d.id AND uf.item_type = 'document'
    JOIN software s ON d.software_id = s.id
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'document' or not item_type_filter:
        select_clauses.append(documents_sql)

    # Patches
    patches_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        p.patch_name AS name, p.description, s.name AS software_name, s.id AS software_id,
        v.version_number AS version_number, v.id as version_id
    FROM user_favorites uf
    JOIN patches p ON uf.item_id = p.id AND uf.item_type = 'patch'
    JOIN versions v ON p.version_id = v.id
    JOIN software s ON v.software_id = s.id
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'patch' or not item_type_filter:
        select_clauses.append(patches_sql)

    # Links
    links_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        l.title AS name, l.description, s.name AS software_name, s.id AS software_id,
        v.version_number AS version_number, v.id as version_id
    FROM user_favorites uf
    JOIN links l ON uf.item_id = l.id AND uf.item_type = 'link'
    JOIN versions v ON l.version_id = v.id
    JOIN software s ON v.software_id = s.id
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'link' or not item_type_filter:
        select_clauses.append(links_sql)

    # Misc Files
    misc_files_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        mf.user_provided_title AS name, mf.user_provided_description AS description,
        cat.name AS software_name, NULL AS software_id, -- Using category name as a stand-in for software_name for consistency
        NULL AS version_number, NULL as version_id
    FROM user_favorites uf
    JOIN misc_files mf ON uf.item_id = mf.id AND uf.item_type = 'misc_file'
    JOIN misc_categories cat ON mf.misc_category_id = cat.id
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'misc_file' or not item_type_filter:
        select_clauses.append(misc_files_sql)

    # Software
    software_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        s.name AS name, s.description, s.name AS software_name, s.id AS software_id,
        NULL AS version_number, NULL as version_id
    FROM user_favorites uf
    JOIN software s ON uf.item_id = s.id AND uf.item_type = 'software'
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'software' or not item_type_filter:
        select_clauses.append(software_sql)
    
    # Versions
    versions_sql = """
    SELECT
        uf.id AS favorite_id, uf.item_id, uf.item_type, uf.created_at AS favorited_at,
        v.version_number AS name, v.changelog AS description, s.name AS software_name, s.id AS software_id,
        v.version_number AS version_number, v.id as version_id
    FROM user_favorites uf
    JOIN versions v ON uf.item_id = v.id AND uf.item_type = 'version'
    JOIN software s ON v.software_id = s.id
    WHERE uf.user_id = :user_id
    """
    if item_type_filter == 'version' or not item_type_filter:
        select_clauses.append(versions_sql)

    if not select_clauses: # No valid item types selected or available
        return [], 0

    # Construct the full query
    query_sql = " UNION ALL ".join(select_clauses)
    
    # Add item_type filter to each part of the UNION if item_type_filter is present
    # This is slightly redundant with the conditional inclusion but ensures correctness if logic changes
    if item_type_filter:
        query_sql = query_sql.replace("WHERE uf.user_id = :user_id", f"WHERE uf.user_id = :user_id AND uf.item_type = '{item_type_filter}'")

    # Order by favorited_at and then apply pagination
    query_sql = f"SELECT * FROM ({query_sql}) ORDER BY favorited_at DESC LIMIT :limit OFFSET :offset"
    
    # Count query
    count_query_parts = []
    base_count_sql = "SELECT COUNT(uf.id) FROM user_favorites uf WHERE uf.user_id = :user_id"
    if item_type_filter:
        base_count_sql += f" AND uf.item_type = '{item_type_filter}'"
    
    # The total count is simpler: just count from user_favorites table with the filter
    count_sql = base_count_sql
    
    try:
        # Fetch items
        cursor = db.execute(query_sql, {"user_id": user_id, "limit": per_page, "offset": offset})
        items = cursor.fetchall() # List of Row objects

        # Fetch total count
        cursor = db.execute(count_sql, {"user_id": user_id})
        total_count_row = cursor.fetchone()
        total_count = total_count_row[0] if total_count_row else 0
        
        return items, total_count
    except sqlite3.Error as e:
        print(f"DB_FAVORITES: Error fetching user favorites for user {user_id}: {e}")
        return [], 0
    except Exception as e:
        print(f"DB_FAVORITES: General error fetching user favorites for user {user_id}: {e}")
        # Potentially log more details about the query_sql for debugging
        print(f"Problematic Query: {query_sql}")
        return [], 0

# --- Comment Management Functions ---

def add_comment(db, user_id, item_id, item_type, content, parent_comment_id=None):
    """Inserts a new comment into the comments table."""
    try:
        cursor = db.execute(
            """
            INSERT INTO comments (user_id, item_id, item_type, content, parent_comment_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, item_id, item_type, content, parent_comment_id)
        )
        db.commit()
        return cursor.lastrowid
    except sqlite3.Error as e:
        print(f"DB_COMMENTS: Error adding comment for item {item_id} ({item_type}) by user {user_id}: {e}")
        return None

def get_comments_for_item(db, item_id, item_type, page=1, per_page=20):
    """
    Fetches comments for a specific item_id and item_type, with pagination for top-level comments
    and nested replies.
    """
    comments_data = {
        "comments": [],
        "total_top_level_comments": 0,
        "page": page,
        "per_page": per_page,
        "total_pages": 0
    }
    offset = (page - 1) * per_page

    try:
        # Get total count of top-level comments for pagination
        count_cursor = db.execute(
            """
            SELECT COUNT(id)
            FROM comments
            WHERE item_id = ? AND item_type = ? AND parent_comment_id IS NULL
            """,
            (item_id, item_type)
        )
        total_top_level_comments_row = count_cursor.fetchone()
        if total_top_level_comments_row:
            comments_data["total_top_level_comments"] = total_top_level_comments_row[0]
        
        if comments_data["total_top_level_comments"] > 0:
            comments_data["total_pages"] = (comments_data["total_top_level_comments"] + per_page - 1) // per_page
        else:
            comments_data["total_pages"] = 0

        # Fetch ALL comments for the item, ordered by creation time to maintain threading logic.
        all_comments_cursor = db.execute(
            """
            SELECT c.id, c.content, c.user_id, u.username, c.item_id, c.item_type,
                   c.parent_comment_id, c.created_at, c.updated_at
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.item_id = ? AND c.item_type = ?
            ORDER BY c.created_at ASC
            """,
            (item_id, item_type)
        )
        all_comment_rows = all_comments_cursor.fetchall()
        
        # Convert all rows to dictionaries
        all_comments_list = [dict(row) for row in all_comment_rows]

        # Build the hierarchy from the flat list
        # This helper function will return only top-level comments, with replies nested.
        hierarchical_comments = _build_comment_hierarchy(all_comments_list)
        
        # Update total_top_level_comments based on the actual number of top-level items after hierarchy build
        comments_data["total_top_level_comments"] = len(hierarchical_comments)
        
        if comments_data["total_top_level_comments"] > 0:
            comments_data["total_pages"] = (comments_data["total_top_level_comments"] + per_page - 1) // per_page
        else:
            comments_data["total_pages"] = 0 # Ensure it's 0 if no comments

        # Apply pagination to the top-level comments
        paginated_top_level_comments = hierarchical_comments[offset : offset + per_page]
        comments_data['comments'] = paginated_top_level_comments
            
        return comments_data

    except sqlite3.Error as e:
        print(f"DB_COMMENTS: Error fetching comments for item {item_id} ({item_type}): {e}")
        comments_data["comments"] = [] 
        comments_data["total_top_level_comments"] = 0
        comments_data["total_pages"] = 0
        return comments_data

def _build_comment_hierarchy(all_comments_list: list) -> list:
    """
    Builds a nested comment hierarchy from a flat list of comment dictionaries.
    Each comment dictionary in the input list should have 'id', 'parent_comment_id',
    and will have a 'replies' list added/populated.
    """
    comment_map = {}
    top_level_comments = []

    # Initialize each comment with an empty 'replies' list and map them by ID
    for comment in all_comments_list:
        comment['replies'] = []
        comment_map[comment['id']] = comment

    # Build the hierarchy
    for comment in all_comments_list:
        parent_id = comment.get('parent_comment_id')
        if parent_id and parent_id in comment_map:
            parent_comment = comment_map[parent_id]
            parent_comment['replies'].append(comment)
        elif not parent_id: # It's a top-level comment
            top_level_comments.append(comment)
            
    return top_level_comments

def get_comment_by_id(db, comment_id):
    """Fetches a single comment by its ID, including the commenter's username."""
    try:
        cursor = db.execute(
            """
            SELECT c.id, c.content, c.user_id, u.username, c.item_id, c.item_type,
                   c.parent_comment_id, c.created_at, c.updated_at
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
            """,
            (comment_id,)
        )
        comment = cursor.fetchone()
        return comment # Returns sqlite3.Row or None
    except sqlite3.Error as e:
        print(f"DB_COMMENTS: Error fetching comment by ID {comment_id}: {e}")
        return None

def update_comment_content(db, comment_id, user_id, new_content):
    """Updates the content of an existing comment, verifying user ownership."""
    try:
        # First, verify the user owns the comment
        comment_owner_cursor = db.execute("SELECT user_id FROM comments WHERE id = ?", (comment_id,))
        comment_owner_row = comment_owner_cursor.fetchone()

        if not comment_owner_row:
            print(f"DB_COMMENTS: Update failed. Comment ID {comment_id} not found.")
            return False 
        
        if comment_owner_row['user_id'] != user_id:
            print(f"DB_COMMENTS: Update failed. User {user_id} does not own comment ID {comment_id}.")
            return False

        # Proceed with update
        cursor = db.execute(
            """
            UPDATE comments
            SET content = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            WHERE id = ? AND user_id = ?
            """,
            (new_content, comment_id, user_id)
        )
        db.commit()
        return cursor.rowcount > 0 # True if a row was updated
    except sqlite3.Error as e:
        print(f"DB_COMMENTS: Error updating comment ID {comment_id} by user {user_id}: {e}")
        return False

def delete_comment_by_id(db, comment_id, user_id, role):
    """
    Deletes a comment by its ID, verifying ownership or admin privileges.
    Replies are deleted via CASCADE.
    """
    try:
        # Verify ownership or admin role
        comment_owner_cursor = db.execute("SELECT user_id FROM comments WHERE id = ?", (comment_id,))
        comment_owner_row = comment_owner_cursor.fetchone()

        if not comment_owner_row:
            print(f"DB_COMMENTS: Delete failed. Comment ID {comment_id} not found.")
            return False

        is_owner = comment_owner_row['user_id'] == user_id
        is_admin = role in ('admin', 'super_admin')

        if not (is_owner or is_admin):
            print(f"DB_COMMENTS: Delete failed. User {user_id} (role: {role}) is not authorized to delete comment ID {comment_id}.")
            return False
        
        # Proceed with deletion
        cursor = db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        db.commit()
        return cursor.rowcount > 0 # True if a row (and its replies) were deleted
    except sqlite3.Error as e:
        print(f"DB_COMMENTS: Error deleting comment ID {comment_id} by user {user_id} (role: {role}): {e}")
        return False

# --- Notification Management Functions ---

def create_notification(db, user_id, type, message, item_id=None, item_type=None):
    """Inserts a new notification into the notifications table."""
    try:
        cursor = db.execute(
            """
            INSERT INTO notifications (user_id, type, message, item_id, item_type)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, type, message, item_id, item_type)
        )
        db.commit()
        return cursor.lastrowid
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error creating notification for user {user_id}: {e}")
        return None

def get_unread_notifications(db, user_id, limit=None):
    """Fetches unread notifications for a user, optionally limited."""
    try:
        query = """
            SELECT id, user_id, type, message, item_id, item_type, is_read, created_at, updated_at
            FROM notifications
            WHERE user_id = ? AND is_read = FALSE
            ORDER BY created_at DESC
        """
        params = (user_id,)
        if limit is not None:
            query += " LIMIT ?"
            params += (limit,)
        
        cursor = db.execute(query, params)
        notifications_rows = cursor.fetchall() # List of Row objects
        
        enriched_notifications = []
        for row in notifications_rows:
            notification_dict = dict(row) # Convert row to dict
            enriched_notifications.append(_enrich_comment_notification(db, notification_dict))
            
        return enriched_notifications
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error fetching unread notifications for user {user_id}: {e}")
        return []

def _get_original_item_name(db, item_type, item_id):
    """Helper to get a display name for an item for notification enrichment."""
    name = None # Default to None if not found or type is unknown
    query = None
    name_col = "name" # Default column name for the item's "name"

    if item_type == 'document':
        query = "SELECT doc_name as name FROM documents WHERE id = ?"
    elif item_type == 'patch':
        query = "SELECT patch_name as name FROM patches WHERE id = ?"
    elif item_type == 'link':
        query = "SELECT title as name FROM links WHERE id = ?"
    elif item_type == 'misc_file':
        # misc_files might use user_provided_title or original_filename
        # This query prioritizes user_provided_title
        query = "SELECT COALESCE(user_provided_title, original_filename) as name FROM misc_files WHERE id = ?"
    elif item_type == 'software': # For completeness, if software items can be commented on directly
        query = "SELECT name FROM software WHERE id = ?"
    elif item_type == 'version': # For completeness
        query = "SELECT version_number as name FROM versions WHERE id = ?"
    # 'comment' type is handled by the caller by looking up the comment's parent item.

    if query:
        try:
            row = db.execute(query, (item_id,)).fetchone()
            if row and row[name_col]: # Check if row exists and the name column is not null
                name = row[name_col]
        except sqlite3.Error as e:
            print(f"DB_NOTIFICATIONS_ENRICH: Error fetching original item name for {item_type} ID {item_id}: {e}")
        except KeyError: # If the alias 'name' is not found for some reason
            print(f"DB_NOTIFICATIONS_ENRICH: KeyError fetching original item name for {item_type} ID {item_id}. Alias 'name' might be missing in query.")
    return name


def _enrich_comment_notification(db, notification_dict):
    """
    Enriches a notification dictionary with details about the original item
    if the notification is related to a comment.
    """
    if notification_dict.get('item_type') == 'comment' and notification_dict.get('item_id'):
        comment_id = notification_dict['item_id']
        comment = get_comment_by_id(db, comment_id) # This already returns a dict-like Row or None

        if comment:
            original_item_id = comment['item_id']
            original_item_type = comment['item_type']
            
            notification_dict['original_item_id'] = original_item_id
            notification_dict['original_item_type'] = original_item_type
            
            # Fetch the name of the original item
            original_item_name = _get_original_item_name(db, original_item_type, original_item_id)
            notification_dict['original_item_name'] = original_item_name if original_item_name else "N/A"
        else:
            # Comment not found, set original item details to indicate this
            notification_dict['original_item_id'] = None
            notification_dict['original_item_type'] = None
            notification_dict['original_item_name'] = "Comment Deleted"
            
    return notification_dict

def get_all_notifications(db, user_id, page, per_page):
    """Fetches all notifications for a user with pagination."""
    offset = (page - 1) * per_page
    try:
        # Fetch items for the current page
        items_cursor = db.execute(
            """
            SELECT id, user_id, type, message, item_id, item_type, is_read, created_at, updated_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, per_page, offset)
        )
        notifications_rows = items_cursor.fetchall()

        enriched_notifications = []
        for row in notifications_rows:
            notification_dict = dict(row) # Convert row to dict
            enriched_notifications.append(_enrich_comment_notification(db, notification_dict))

        # Fetch total count of notifications for the user
        count_cursor = db.execute(
            "SELECT COUNT(id) FROM notifications WHERE user_id = ?",
            (user_id,)
        )
        total_count_row = count_cursor.fetchone()
        total_notifications = total_count_row[0] if total_count_row else 0
        
        return enriched_notifications, total_notifications
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error fetching all notifications for user {user_id}: {e}")
        return [], 0

def mark_notification_as_read(db, notification_id, user_id):
    """Marks a specific notification as read, ensuring user ownership."""
    try:
        # Verify the user owns the notification before marking as read
        owner_cursor = db.execute("SELECT user_id FROM notifications WHERE id = ?", (notification_id,))
        owner_row = owner_cursor.fetchone()

        if not owner_row:
            print(f"DB_NOTIFICATIONS: Mark as read failed. Notification ID {notification_id} not found.")
            return False
        
        if owner_row['user_id'] != user_id:
            print(f"DB_NOTIFICATIONS: Mark as read failed. User {user_id} does not own notification ID {notification_id}.")
            return False

        cursor = db.execute(
            "UPDATE notifications SET is_read = TRUE, updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE id = ? AND user_id = ?",
            (notification_id, user_id)
        )
        db.commit()
        return cursor.rowcount > 0
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error marking notification {notification_id} as read for user {user_id}: {e}")
        return False

def mark_all_notifications_as_read(db, user_id):
    """Marks all unread notifications for a user as read."""
    try:
        cursor = db.execute(
            "UPDATE notifications SET is_read = TRUE, updated_at = (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE user_id = ? AND is_read = FALSE",
            (user_id,)
        )
        db.commit()
        return cursor.rowcount
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error marking all notifications as read for user {user_id}: {e}")
        return 0

def clear_all_notifications(db, user_id):
    """Deletes all notifications for a specific user."""
    try:
        cursor = db.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
        db.commit()
        return cursor.rowcount
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error clearing all notifications for user {user_id}: {e}")
        return 0

def get_notification_by_id(db, notification_id):
    """Fetches a single notification by its ID."""
    try:
        cursor = db.execute(
            """
            SELECT id, user_id, type, message, item_id, item_type, is_read, created_at, updated_at
            FROM notifications
            WHERE id = ?
            """,
            (notification_id,)
        )
        return cursor.fetchone() # Returns sqlite3.Row or None
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error fetching notification by ID {notification_id}: {e}")
        return None