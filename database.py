# database.py
import sqlite3
import os

# Construct the path to the database file within the instance folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INSTANCE_FOLDER_PATH = os.path.join(BASE_DIR, 'instance')
DATABASE = os.path.join(INSTANCE_FOLDER_PATH, 'software_dashboard.db')

# Ensure the instance folder exists
os.makedirs(INSTANCE_FOLDER_PATH, exist_ok=True)

def get_db_connection():
    """Creates a database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row # Return rows as dictionary-like objects
    return conn

def init_db():
    """Initializes the database using schema.sql."""
    print(f"Attempting to initialize database at: {DATABASE}")
    conn = None
    try:
        conn = get_db_connection()
        schema_path = os.path.join(BASE_DIR, 'schema.sql')
        if not os.path.exists(schema_path):
            print(f"ERROR: schema.sql not found at {schema_path}")
            return

        with open(schema_path, 'r') as f:
            sql_script = f.read()
            # Use executescript to handle multiple SQL statements
            conn.executescript(sql_script)
        conn.commit()
        print("Database initialized successfully.")

        # Add initial software data (only if table is empty)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM software")
        count = cursor.fetchone()[0]
        if count == 0:
            print("Adding initial software entries...")
            software_list = ['ITMS', 'VMS', 'Analytic Manager', 'ICCC']
            cursor.executemany("INSERT INTO software (name) VALUES (?)", [(s,) for s in software_list])
            conn.commit()
            print("Initial software added.")
        else:
            print("Software table already populated.")

    except sqlite3.Error as e:
        print(f"An error occurred during DB initialization: {e}")
    finally:
        if conn:
            conn.close()

# You'll add functions here to query data later, e.g.:
# def get_all_software(): ...
# def get_versions_for_software(software_id): ...
# def get_version_details(version_id): ...
# etc.