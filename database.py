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