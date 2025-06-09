# database.py
import sqlite3
import os
import sys # Added for PyInstaller path handling
import pytz
from datetime import datetime, timezone # ensure timezone is imported if needed

IST = pytz.timezone('Asia/Kolkata')

# No global DATABASE constant needed here anymore, as path will be passed in.
# BASE_DIR might still be needed for locating schema.sql relative to this file.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_db_connection(db_path: str):
    """Creates a database connection to the specified database path."""
    # print(f"DB_HELPER: Connecting to database at: {db_path}") # Optional: for debugging
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA busy_timeout = 5000")
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

        if getattr(sys, 'frozen', False):
            # Running as a PyInstaller bundle
            schema_path = os.path.join(sys._MEIPASS, 'schema.sql')
        else:
            # Running as a normal script
            schema_path = os.path.join(BASE_DIR, 'schema.sql') # Assumes schema.sql is in the same dir as database.py

        if not os.path.exists(schema_path):
            print(f"DB_HELPER: ERROR - schema.sql not found at {schema_path}")
            # Attempt to list files in MEIPASS if frozen, for debugging
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                try:
                    print(f"DB_HELPER: Listing files in sys._MEIPASS ({sys._MEIPASS}): {os.listdir(sys._MEIPASS)}")
                except Exception as e_ls:
                    print(f"DB_HELPER: Error listing sys._MEIPASS: {e_ls}")
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
            software_list = ['ITMS', 'VMS', 'Analytic Manager', 'ICCC', 'VA']
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

def get_favorite_status(db, user_id, item_id, item_type) -> 'sqlite3.Row | None':
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
        items = cursor.fetchall() # List of 'sqlite3.Row' objects

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

# --- User Watch Preference Functions ---

def get_watch_preferences(db, user_id: int) -> list['sqlite3.Row']: # Already updated, no change needed
    """Fetches all watch preferences for a given user."""
    try:
        cursor = db.execute(
            """
            SELECT id, user_id, content_type, category, created_at
            FROM user_watch_preferences
            WHERE user_id = ?
            ORDER BY content_type, category
            """,
            (user_id,)
        )
        return cursor.fetchall() # Returns a list of 'sqlite3.Row' objects
    except sqlite3.Error as e:
        # Consider logging the error to app.logger if available, or print for now
        print(f"DB_WATCH_PREFS: Error fetching watch preferences for user {user_id}: {e}")
        return []

def add_watch_preference(db, user_id: int, content_type: str, category: str = None):
    """Adds a watch preference for a user."""
    try:
        cursor = db.execute(
            "INSERT INTO user_watch_preferences (user_id, content_type, category) VALUES (?, ?, ?)",
            (user_id, content_type, category)
        )
        db.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # This typically means the preference already exists.
        print(f"DB_WATCH_PREFS: IntegrityError adding watch preference for user {user_id}, type {content_type}, category {category}. Preference might already exist.")
        # Optionally, fetch and return existing ID if needed, for now, None indicates no new row.
        return None 
    except sqlite3.Error as e:
        print(f"DB_WATCH_PREFS: Error adding watch preference for user {user_id}, type {content_type}, category {category}: {e}")
        return None

def remove_watch_preference(db, user_id: int, content_type: str, category: str = None):
    """Removes a watch preference for a user."""
    try:
        # The CASE statement handles NULL category correctly.
        # category parameter is passed twice to the query.
        cursor = db.execute(
            """
            DELETE FROM user_watch_preferences
            WHERE user_id = ? AND content_type = ? AND
                  CASE WHEN ? IS NULL THEN category IS NULL ELSE category = ? END
            """,
            (user_id, content_type, category, category)
        )
        db.commit()
        return cursor.rowcount > 0  # True if a row was deleted
    except sqlite3.Error as e:
        print(f"DB_WATCH_PREFS: Error removing watch preference for user {user_id}, type {content_type}, category {category}: {e}")
        return False

def add_default_watch_preferences(db, user_id: int):
    """Adds a predefined set of default watch preferences for a new user."""
    default_preferences = [
        # Content Type, Category (None for all categories of that content type or general)
        ('documents', 'general'), # General documents
        ('patches', None),         # All patches
        ('links', None),           # All links
        ('misc', None)       # All misc_files (or a common category if defined)
        # ('comments', 'reply') # Example: if users could opt-in to all replies by default
    ]
    
    added_count = 0
    # print(f"DB_WATCH_PREFS: Adding default watch preferences for user {user_id}.")
    for content_type, category in default_preferences:
        try:
            # add_watch_preference returns lastrowid on success, None on failure/existing
            if add_watch_preference(db, user_id, content_type, category) is not None:
                added_count += 1
        except Exception as e: # Catch any unexpected error from add_watch_preference
            print(f"DB_WATCH_PREFS: Unexpected error adding default preference ({content_type}, {category}) for user {user_id}: {e}")
            
    print(f"DB_WATCH_PREFS: Added {added_count} default watch preferences for user {user_id}.")
    return added_count

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
    comment_map = {} # type: ignore
    top_level_comments = [] # type: ignore

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
        return comment # Returns 'sqlite3.Row | None'
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
            SET content = ?, updated_at = (strftime('%Y-%m-%d %H:%M:%S', 'now', '+05:30'))
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

def get_watching_users(db, content_type: str, category: str = None) -> list['sqlite3.Row']:
    """
    Retrieves users who are watching a specific content_type and category.
    If category is None, it looks for preferences where category IS NULL.
    """
    query = """
        SELECT DISTINCT u.id, u.username, u.email, u.role, u.created_at
        FROM user_watch_preferences w
        JOIN users u ON w.user_id = u.id
        WHERE w.content_type = ?
    """
    params = [content_type]

    if category is not None:
        query += " AND w.category = ?"
        params.append(category)
    else:
        query += " AND w.category IS NULL"

    try:
        cursor = db.execute(query, params)
        return cursor.fetchall()  # Returns a list of sqlite3.Row objects
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error fetching watching users for {content_type} / {category}: {e}")
        return []

def create_notification(db, user_id: int, type: str, message: str, item_id: int = None, item_type: str = None, content_type: str = None, category: str = None):
    """Inserts a new notification into the notifications table."""
    try:
        cursor = db.execute(
            """
            INSERT INTO notifications (user_id, type, message, item_id, item_type, content_type, category)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, type, message, item_id, item_type, content_type, category)
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
            SELECT id, user_id, type, message, item_id, item_type, content_type, category, is_read, created_at, updated_at
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
            SELECT id, user_id, type, message, item_id, item_type, content_type, category, is_read, created_at, updated_at
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
            "UPDATE notifications SET is_read = TRUE, updated_at = (strftime('%Y-%m-%d %H:%M:%S', 'now', '+05:30')) WHERE id = ? AND user_id = ?",
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
            "UPDATE notifications SET is_read = TRUE, updated_at = (strftime('%Y-%m-%d %H:%M:%S', 'now', '+05:30')) WHERE user_id = ? AND is_read = FALSE",
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
            SELECT id, user_id, type, message, item_id, item_type, content_type, category, is_read, created_at, updated_at
            FROM notifications
            WHERE id = ?
            """,
            (notification_id,)
        )
        return cursor.fetchone() # Returns 'sqlite3.Row | None'
    except sqlite3.Error as e:
        print(f"DB_NOTIFICATIONS: Error fetching notification by ID {notification_id}: {e}")
        return None

# --- Conversation and Message Functions ---

def get_conversation_by_users(db, user1_id: int, user2_id: int) -> 'sqlite3.Row | None':
    """Retrieves a conversation between two specific users, ensuring user1_id < user2_id."""
    if user1_id == user2_id:
        print("DB_CONVERSATIONS: Users cannot have a conversation with themselves.")
        return None
    # Ensure user1_id is always the smaller one for consistent querying
    if user1_id > user2_id:
        user1_id, user2_id = user2_id, user1_id

    try:
        cursor = db.execute(
            "SELECT id, user1_id, user2_id, created_at FROM conversations WHERE user1_id = ? AND user2_id = ?",
            (user1_id, user2_id)
        )
        return cursor.fetchone()
    except sqlite3.Error as e:
        print(f"DB_CONVERSATIONS: Error fetching conversation between user {user1_id} and {user2_id}: {e}")
        return None

def create_conversation(db, user1_id: int, user2_id: int) -> 'sqlite3.Row | None': # Already updated
    """
    Ensures user1_id < user2_id before inserting.
    Checks if a conversation already exists. If so, returns the existing conversation.
    If not, creates a new conversation and returns it.
    """
    if user1_id == user2_id:
        print("DB_CONVERSATIONS: Cannot create a conversation with oneself.")
        # Or raise an error, depending on how app layer wants to handle this.
        return None

    # Ensure user1_id is always the smaller one to match CHECK constraint and simplify lookups
    u1, u2 = (user1_id, user2_id) if user1_id < user2_id else (user2_id, user1_id)

    existing_conversation = get_conversation_by_users(db, u1, u2)
    if existing_conversation:
        return existing_conversation

    try:
        cursor = db.execute(
            "INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)",
            (u1, u2)
        )
        db.commit()
        new_conversation_id = cursor.lastrowid
        # Fetch the newly created conversation to return it as a Row object
        return get_conversation_by_id(db, new_conversation_id)
    except sqlite3.IntegrityError as e:
        # This could happen if another request created the conversation simultaneously,
        # or if the CHECK constraint (user1_id < user2_id) fails, though we handle order above.
        print(f"DB_CONVERSATIONS: IntegrityError creating conversation between {u1} and {u2}: {e}. It might already exist.")
        # Attempt to fetch again, in case of race condition.
        return get_conversation_by_users(db, u1, u2)
    except sqlite3.Error as e:
        print(f"DB_CONVERSATIONS: Error creating conversation between {u1} and {u2}: {e}")
        return None

def get_conversation_by_id(db, conversation_id: int) -> 'sqlite3.Row | None':
    """Retrieves a conversation by its ID."""
    try:
        cursor = db.execute(
            "SELECT id, user1_id, user2_id, created_at FROM conversations WHERE id = ?",
            (conversation_id,)
        )
        return cursor.fetchone()
    except sqlite3.Error as e:
        print(f"DB_CONVERSATIONS: Error fetching conversation by ID {conversation_id}: {e}")
        return None

def send_message(db, conversation_id: int, sender_id: int, recipient_id: int, content: str, file_name: str = None, file_url: str = None, file_type: str = None) -> 'sqlite3.Row | None':
    """Inserts a new message into the messages table and returns the newly created message."""
    try:
        # Initial logging of received parameters
        # print(f"DB_MESSAGES: send_message called with file_name='{file_name}', file_url='{file_url}'")

        db_file_name_to_store = file_name  # Default to original file_name

        if file_url and file_url.startswith("/files/chat_uploads/"):
            try:
                # Extract the unique filename from the URL
                # Example: /files/chat_uploads/123/unique_abc123_original.jpg -> unique_abc123_original.jpg
                extracted_unique_filename = file_url.split('/')[-1]
                if extracted_unique_filename:
                    db_file_name_to_store = extracted_unique_filename
                    # print(f"DB_MESSAGES: Local chat upload detected. Overriding file_name. Original: '{file_name}', Extracted from URL: '{extracted_unique_filename}', Storing: '{db_file_name_to_store}'")
                else:
                    # print(f"DB_MESSAGES: file_url matched prefix, but extracted filename was empty. file_url: '{file_url}'")
                    pass # Keep original file_name if extraction fails or is empty
            except Exception as e_extract:
                # print(f"DB_MESSAGES: Error extracting filename from file_url '{file_url}': {e_extract}. Using original file_name: '{file_name}'")
                pass # Fallback to original file_name on any error during extraction

        # print(f"DB_MESSAGES: Final db_file_name_to_store: '{db_file_name_to_store}'")

        cursor = db.execute(
            """INSERT INTO messages (conversation_id, sender_id, recipient_id, content, file_name, file_url, file_type)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (conversation_id, sender_id, recipient_id, content, db_file_name_to_store, file_url, file_type)
        )
        db.commit()
        new_message_id = cursor.lastrowid
        # Fetch the newly created message
        return get_message_by_id(db, new_message_id)
    except sqlite3.Error as e:
        # print(f"DB_MESSAGES: Error sending message in conversation {conversation_id} from user {sender_id} to {recipient_id}: {e}")
        return None

def get_message_by_id(db, message_id: int) -> 'sqlite3.Row | None':
    """Retrieves a message by its ID."""
    try:
        cursor = db.execute(
            "SELECT id, conversation_id, sender_id, recipient_id, content, created_at, is_read, file_name, file_url, file_type FROM messages WHERE id = ?",
            (message_id,)
        )
        return cursor.fetchone()
    except sqlite3.Error as e:
        # print(f"DB_MESSAGES: Error fetching message by ID {message_id}: {e}")
        return None

def get_messages(db, conversation_id: int, limit: int = 50, offset: int = 0) -> list['sqlite3.Row']:
    """
    Retrieves messages for a given conversation, ordered by created_at (descending).
    Implements pagination using limit and offset.
    """
    try:
        cursor = db.execute(
            """
            SELECT m.id, m.conversation_id, m.sender_id, s_sender.username as sender_username,
                   m.recipient_id, s_recipient.username as recipient_username, m.content, m.created_at, m.is_read,
                   m.file_name, m.file_url, m.file_type
            FROM messages m
            JOIN users s_sender ON m.sender_id = s_sender.id
            JOIN users s_recipient ON m.recipient_id = s_recipient.id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (conversation_id, limit, offset)
        )
        return cursor.fetchall()
    except sqlite3.Error as e:
        # print(f"DB_MESSAGES: Error fetching messages for conversation {conversation_id}: {e}")
        return []

def get_user_conversations(db, user_id: int) -> list['sqlite3.Row']:
    """
    Retrieves all conversations for a given user.
    Joins with the users table to get the other participant's username and profile picture.
    Orders conversations by the created_at of the most recent message in each conversation (descending).
    
    -- FIXED a bug where multiple messages with the same timestamp would cause duplicate conversations.
    -- The subquery now uses MAX(id) as a tie-breaker to ensure exactly one last message is found.
    """
    try:
        cursor = db.execute(
            """
            SELECT
                c.id as conversation_id,
                c.user1_id,
                c.user2_id,
                CASE
                    WHEN c.user1_id = :user_id THEN u2.username
                    ELSE u1.username
                END as other_username,
                CASE
                    WHEN c.user1_id = :user_id THEN u2.profile_picture_filename
                    ELSE u1.profile_picture_filename
                END as other_profile_picture,
                CASE
                    WHEN c.user1_id = :user_id THEN u2.id
                    ELSE u1.id
                END as other_user_id,
                c.created_at as conversation_created_at, -- For sorting convos without messages
                lm.last_message_content,
                lm.last_message_created_at,
                lm.last_message_sender_id,
                lm.last_message_id,
                lm.last_message_is_read,
                (SELECT COUNT(*) FROM messages m_unread
                 WHERE m_unread.conversation_id = c.id
                 AND m_unread.recipient_id = :user_id
                 AND m_unread.is_read = FALSE) as unread_messages_count
            FROM conversations c
            JOIN users u1 ON c.user1_id = u1.id
            JOIN users u2 ON c.user2_id = u2.id
            LEFT JOIN (
                SELECT
                    m.conversation_id,
                    m.id as last_message_id,
                    m.content as last_message_content,
                    m.created_at as last_message_created_at,
                    m.sender_id as last_message_sender_id,
                    m.is_read as last_message_is_read
                FROM messages m
                -- This subquery now finds the single highest message ID for each conversation,
                -- which is guaranteed to be unique and represents the last message sent.
                INNER JOIN (
                    SELECT conversation_id, MAX(id) as max_id
                    FROM messages
                    GROUP BY conversation_id
                ) mm ON m.id = mm.max_id
            ) lm ON c.id = lm.conversation_id
            WHERE c.user1_id = :user_id OR c.user2_id = :user_id
            ORDER BY lm.last_message_created_at DESC, c.created_at DESC
            """,
            {"user_id": user_id}
        )
        return cursor.fetchall()
    except sqlite3.Error as e:
        print(f"DB_CONVERSATIONS: Error fetching conversations for user {user_id}: {e}")
        return []
    
def mark_messages_as_read(db, conversation_id: int, user_id: int) -> int:
    """
    Marks messages in a conversation as read for a specific user where they are the recipient.
    Returns a tuple: (number of messages whose status was changed by this call, 
                      list of {'id': message_id, 'sender_id': original_sender_id} for all messages from the other user that are now read).
    """
    reader_user_id = user_id # Alias for clarity

    try:
        # Determine the other user_id in the conversation
        conv_details_cursor = db.execute(
            "SELECT user1_id, user2_id FROM conversations WHERE id = ?",
            (conversation_id,)
        )
        conv_row = conv_details_cursor.fetchone()
        if not conv_row:
            print(f"DB_MESSAGES: Conversation ID {conversation_id} not found during mark_as_read.")
            return 0, []
        
        other_user_id = None
        if conv_row[0] == reader_user_id:
            other_user_id = conv_row[1]
        elif conv_row[1] == reader_user_id:
            other_user_id = conv_row[0]
        else:
            # This should not happen if reader_user_id is part of the conversation
            print(f"DB_MESSAGES: reader_user_id {reader_user_id} not part of conversation {conversation_id}.")
            return 0, []

        # Perform the UPDATE to mark messages as read
        update_cursor = db.execute(
            """
            UPDATE messages
            SET is_read = TRUE
            WHERE conversation_id = ?
              AND recipient_id = ?
              AND is_read = FALSE
            """,
            (conversation_id, reader_user_id)
        )
        rows_updated_count = update_cursor.rowcount
        db.commit() # Commit the update

        # Now, SELECT all messages in this conversation sent by the other_user_id to the reader_user_id
        # that are currently marked as read. This list will be used by app.py to notify the sender.
        # This ensures that even if rows_updated_count is 0 (messages were already read by another means),
        # we still gather the list of messages that the sender should be notified about.
        # We are interested in messages *sent by the other user* that are now read by the reader.
        select_read_messages_cursor = db.execute(
            "SELECT id, sender_id FROM messages WHERE conversation_id = ? AND sender_id = ? AND recipient_id = ? AND is_read = TRUE ORDER BY created_at DESC",
            (conversation_id, other_user_id, reader_user_id)
        )
        # The sender_id in these details will be other_user_id.
        all_relevant_read_messages_details = [{'id': row[0], 'sender_id': row[1]} for row in select_read_messages_cursor.fetchall()]
        
        return rows_updated_count, all_relevant_read_messages_details
    except sqlite3.Error as e:
        # print(f"DB_MESSAGES: Error marking messages as read for conversation {conversation_id}, user {reader_user_id}: {e}")
        db.rollback() # Rollback on error
        return 0, []


def get_total_unread_messages(db, user_id: int) -> int:
    """Gets the total number of unread messages for a user from active senders."""
    try:
        # The users table should have an 'is_active' column (boolean or integer 0/1)
        # Ensure 'u.is_active = TRUE' or 'u.is_active = 1' matches your schema.
        count = db.execute(
            """
            SELECT COUNT(m.id)
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.recipient_id = ? AND m.is_read = FALSE AND u.is_active = TRUE
            """,
            (user_id,),
        ).fetchone()[0]
        return count
    except sqlite3.Error as e:
        # Consider logging the error to app.logger if available
        print(f"DB_MESSAGES: Error getting total unread messages for user {user_id}: {e}")
        return 0


def get_online_users_count(db) -> int:
    """Gets the total number of online users."""
    try:
        count = db.execute("SELECT COUNT(*) FROM users WHERE is_online = TRUE").fetchone()[0]
        return count
    except sqlite3.Error as e:
        print(f"DB_USERS: Error getting online users count: {e}")
        return 0

def clear_messages_for_user_in_conversation(db, conversation_id: int, user_id: int) -> int:
    """
    Clears all messages for a given conversation_id.
    The user_id parameter is included for API consistency but not used in the
    current two-sided message deletion logic for this specific conversation.
    Returns the number of messages deleted.
    """
    try:
        cursor = db.execute(
            "DELETE FROM messages WHERE conversation_id = ?",
            (conversation_id,)
        )
        db.commit()
        # print(f"DB_MESSAGES: Cleared {cursor.rowcount} messages for conversation_id {conversation_id} (requested by user_id {user_id}).")
        return cursor.rowcount
    except sqlite3.Error as e:
        # print(f"DB_MESSAGES: Error clearing messages for conversation_id {conversation_id} (requested by user_id {user_id}): {e}")
        # Consider rolling back if part of a larger transaction, though commit is here.
        return 0
