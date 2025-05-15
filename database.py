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


    except sqlite3.Error as e:
        print(f"DB_HELPER: An error occurred during DB initialization: {e}")
    except Exception as e: # Catch any other potential errors
        print(f"DB_HELPER: A general error occurred during DB initialization: {e}")
    finally:
        if conn:
            conn.close()

# Note: No other functions needed in this file for basic connection and init.
# Data fetching logic is now in app.py or will be called by app.py's route handlers.