import pytest
import sqlite3
from datetime import datetime, timedelta, date
import os
import sys

# Add the parent directory to sys.path to allow imports from app and database
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Now import from app and database
# Note: Flask app specific imports might need a test app context if used directly
from app import get_daily_counts, get_weekly_counts, get_daily_download_counts, get_weekly_download_counts, get_dashboard_stats
import database # For init_db

# --- Fixtures ---
@pytest.fixture
def db_conn():
    """Fixture to set up an in-memory SQLite database for testing."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    # Initialize schema
    # Assuming database.init_db takes a connection string/path or can be adapted
    # For simplicity, we'll directly use the schema from database.SCHEMA_SQL if accessible
    # or replicate its core parts here if needed.
    # Let's assume database.init_db can work with a connection object or we adapt.
    
    # Temporarily create a dummy DB file for init_db if it insists on a path
    dummy_db_path = "test_temp_db_for_init.sqlite"
    database.init_db(dummy_db_path) # This will create tables in the dummy file
    
    # Now, we need to get the schema from the dummy file and apply it to in-memory
    # Or, more simply, if database.SCHEMA_SQL is a string constant:
    if hasattr(database, 'SCHEMA_SQL'):
         conn.executescript(database.SCHEMA_SQL)
    else: # Fallback: Manually define schema or read from schema.sql if available
        # This is a simplified schema for demonstration if SCHEMA_SQL is not directly accessible
        # In a real scenario, ensure the full schema is loaded.
        schema = """
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action_type TEXT NOT NULL,
            target_table TEXT,
            target_id INTEGER,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE download_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            file_type TEXT NOT NULL,
            user_id INTEGER,
            ip_address TEXT,
            download_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            software_id INTEGER,
            doc_name TEXT,
            description TEXT,
            is_external_link BOOLEAN DEFAULT FALSE,
            file_size INTEGER,
            stored_filename TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE patches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version_id INTEGER,
            patch_name TEXT,
            description TEXT,
            is_external_link BOOLEAN DEFAULT FALSE,
            file_size INTEGER,
            stored_filename TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            software_id INTEGER,
            version_id INTEGER,
            title TEXT,
            description TEXT,
            is_external_link BOOLEAN DEFAULT FALSE,
            file_size INTEGER,
            stored_filename TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE misc_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            misc_category_id INTEGER,
            user_provided_title TEXT,
            user_provided_description TEXT,
            file_size INTEGER,
            stored_filename TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE misc_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE software (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Assuming for staleness, though not typical
        );
        CREATE TABLE versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            software_id INTEGER NOT NULL,
            version_number TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE users ( id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT ); -- Minimal for stats
        """
        conn.executescript(schema)
    conn.commit()
    
    yield conn # Provide the connection to the test
    
    conn.close()
    if os.path.exists(dummy_db_path):
        os.remove(dummy_db_path)


# --- Helper to insert audit logs ---
def insert_audit_log(db, action_type, timestamp_str, username="testuser", user_id=1):
    dt_obj = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO audit_logs (user_id, username, action_type, timestamp) VALUES (?, ?, ?, ?)",
        (user_id, username, action_type, dt_obj)
    )
    db.commit()

# --- Helper to insert download logs ---
def insert_download_log(db, timestamp_str, file_id=1, file_type="document", user_id=1):
    dt_obj = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO download_log (file_id, file_type, user_id, download_timestamp) VALUES (?, ?, ?, ?)",
        (file_id, file_type, user_id, dt_obj)
    )
    db.commit()

# --- Tests for User Activity Trends ---
upload_action_types = [
    'CREATE_DOCUMENT_FILE', 'CREATE_PATCH_FILE', 'CREATE_LINK_FILE', 'CREATE_MISC_FILE',
    'UPDATE_DOCUMENT_FILE', 'UPDATE_PATCH_FILE', 'UPDATE_LINK_FILE', 'UPDATE_MISC_FILE_UPLOAD'
]

def test_get_daily_counts_empty(db_conn):
    counts = get_daily_counts(db_conn, ['USER_LOGIN'], days=7)
    assert len(counts) == 7
    for item in counts:
        assert item['count'] == 0
        assert datetime.strptime(item['date'], "%Y-%m-%d") # Check date format

def test_get_weekly_counts_empty(db_conn):
    counts = get_weekly_counts(db_conn, ['USER_LOGIN'], weeks=4)
    assert len(counts) == 4
    for item in counts:
        assert item['count'] == 0
        assert datetime.strptime(item['week_start_date'], "%Y-%m-%d")

def test_get_daily_counts_logins_with_data(db_conn):
    today_str = date.today().strftime("%Y-%m-%d")
    yesterday_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    
    insert_audit_log(db_conn, 'USER_LOGIN', f"{today_str} 10:00:00")
    insert_audit_log(db_conn, 'USER_LOGIN', f"{today_str} 12:00:00")
    insert_audit_log(db_conn, 'USER_LOGIN', f"{yesterday_str} 20:00:00")
    insert_audit_log(db_conn, 'SOME_OTHER_ACTION', f"{today_str} 11:00:00")

    counts = get_daily_counts(db_conn, ['USER_LOGIN'], days=7)
    assert len(counts) == 7
    
    today_found = False
    yesterday_found = False
    for item in counts:
        if item['date'] == today_str:
            assert item['count'] == 2
            today_found = True
        elif item['date'] == yesterday_str:
            assert item['count'] == 1
            yesterday_found = True
        else:
            assert item['count'] == 0 # Other days should be 0
    assert today_found
    assert yesterday_found

def test_get_weekly_counts_uploads_with_data(db_conn):
    # Get current week's Sunday and last week's Sunday
    today = date.today()
    current_week_sunday_obj = today - timedelta(days=(today.weekday() + 1) % 7)
    last_week_sunday_obj = current_week_sunday_obj - timedelta(days=7)
    
    current_week_sunday = current_week_sunday_obj.strftime("%Y-%m-%d")
    last_week_sunday = last_week_sunday_obj.strftime("%Y-%m-%d")

    # One upload this week (e.g., Monday of current week)
    insert_audit_log(db_conn, 'CREATE_DOCUMENT_FILE', (current_week_sunday_obj + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"))
    # Two uploads last week
    insert_audit_log(db_conn, 'CREATE_PATCH_FILE', (last_week_sunday_obj + timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"))
    insert_audit_log(db_conn, 'UPDATE_MISC_FILE_UPLOAD', (last_week_sunday_obj + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"))

    counts = get_weekly_counts(db_conn, upload_action_types, weeks=4)
    assert len(counts) == 4

    current_week_found = False
    last_week_found = False
    for item in counts:
        if item['week_start_date'] == current_week_sunday:
            assert item['count'] == 1
            current_week_found = True
        elif item['week_start_date'] == last_week_sunday:
            assert item['count'] == 2
            last_week_found = True
        else:
            assert item['count'] == 0
    assert current_week_found
    assert last_week_found


# --- Tests for Download Trends ---
def test_get_daily_download_counts_empty(db_conn):
    counts = get_daily_download_counts(db_conn, days=7)
    assert len(counts) == 7
    for item in counts:
        assert item['count'] == 0

def test_get_weekly_download_counts_empty(db_conn):
    counts = get_weekly_download_counts(db_conn, weeks=4)
    assert len(counts) == 4
    for item in counts:
        assert item['count'] == 0

def test_get_daily_download_counts_with_data(db_conn):
    today_str = date.today().strftime("%Y-%m-%d")
    two_days_ago_str = (date.today() - timedelta(days=2)).strftime("%Y-%m-%d")
    insert_download_log(db_conn, f"{today_str} 09:00:00")
    insert_download_log(db_conn, f"{two_days_ago_str} 15:00:00")
    insert_download_log(db_conn, f"{two_days_ago_str} 16:00:00")

    counts = get_daily_download_counts(db_conn, days=7)
    today_found = False
    two_days_ago_found = False
    for item in counts:
        if item['date'] == today_str:
            assert item['count'] == 1
            today_found = True
        elif item['date'] == two_days_ago_str:
            assert item['count'] == 2
            two_days_ago_found = True
        else:
            assert item['count'] == 0
    assert today_found
    assert two_days_ago_found

# --- Mock Flask App Context for get_dashboard_stats ---
@pytest.fixture
def app_context(db_conn):
    # Basic Flask app for context, not running a server
    from flask import Flask, g
    app = Flask(__name__)
    app.config['TESTING'] = True
    
    with app.app_context():
        g.db = db_conn # Manually set the db connection on g
        yield app

# --- Tests for Storage Utilization (indirectly via get_dashboard_stats) ---
def test_storage_utilization_empty(app_context, db_conn):
    # db_conn is already empty from its fixture
    with app_context.test_request_context(): # Required if get_dashboard_stats uses request context
        stats = get_dashboard_stats().get_json()
    assert stats['total_storage_utilized_bytes'] == 0

def test_storage_utilization_with_data(app_context, db_conn):
    db_conn.execute("INSERT INTO documents (doc_name, file_size, is_external_link, stored_filename) VALUES (?, ?, ?, ?)", ("doc1.pdf", 1000, False, "file1.pdf"))
    db_conn.execute("INSERT INTO documents (doc_name, file_size, is_external_link) VALUES (?, ?, ?)", ("doc2_ext.pdf", 2000, True)) # External
    db_conn.execute("INSERT INTO patches (patch_name, file_size, is_external_link, stored_filename) VALUES (?, ?, ?, ?)", ("patch1.zip", 3000, False, "file2.zip"))
    db_conn.execute("INSERT INTO links (title, file_size, is_external_link, stored_filename) VALUES (?, ?, ?, ?)", ("link_file.txt", 500, False, "file3.txt"))
    db_conn.execute("INSERT INTO misc_files (user_provided_title, file_size, stored_filename) VALUES (?, ?, ?)", ("misc1.dat", 1500, "file4.dat"))
    db_conn.execute("INSERT INTO documents (doc_name, file_size, is_external_link, stored_filename) VALUES (?, ?, ?, ?)", ("doc3.pdf", None, False, "file5.pdf")) # Null size
    db_conn.commit()

    with app_context.test_request_context():
        stats = get_dashboard_stats().get_json()
    assert stats['total_storage_utilized_bytes'] == 1000 + 3000 + 500 + 1500 # 6000

# --- Tests for Content Health (indirectly via get_dashboard_stats) ---
def test_content_health_missing_descriptions_all_ok(app_context, db_conn):
    db_conn.execute("INSERT INTO documents (id, doc_name, description) VALUES (1, 'D1', 'Desc D1')")
    db_conn.execute("INSERT INTO patches (id, patch_name, description) VALUES (1, 'P1', 'Desc P1')")
    db_conn.commit()
    
    with app_context.test_request_context():
        stats = get_dashboard_stats().get_json()
    
    assert stats['content_health']['missing_descriptions']['documents']['missing'] == 0
    assert stats['content_health']['missing_descriptions']['documents']['total'] == 1
    assert stats['content_health']['missing_descriptions']['patches']['missing'] == 0
    assert stats['content_health']['missing_descriptions']['patches']['total'] == 1
    # ... test other types if populated

def test_content_health_missing_descriptions_some_missing(app_context, db_conn):
    db_conn.execute("INSERT INTO documents (id, doc_name, description) VALUES (1, 'D1', 'Desc D1')")
    db_conn.execute("INSERT INTO documents (id, doc_name, description) VALUES (2, 'D2', NULL)")
    db_conn.execute("INSERT INTO documents (id, doc_name, description) VALUES (3, 'D3', '')")
    db_conn.execute("INSERT INTO software (id, name, description) VALUES (1, 'S1', NULL)")
    db_conn.commit()

    with app_context.test_request_context():
        stats = get_dashboard_stats().get_json()
        
    assert stats['content_health']['missing_descriptions']['documents']['missing'] == 2
    assert stats['content_health']['missing_descriptions']['documents']['total'] == 3
    assert stats['content_health']['missing_descriptions']['software']['missing'] == 1
    assert stats['content_health']['missing_descriptions']['software']['total'] == 1


def test_content_health_stale_content_all_fresh(app_context, db_conn):
    # All items updated recently (default CURRENT_TIMESTAMP on inserts)
    db_conn.execute("INSERT INTO documents (id, doc_name) VALUES (1, 'D1')")
    db_conn.execute("INSERT INTO versions (id, software_id, version_number) VALUES (1, 1, '1.0')") # Needs software_id
    db_conn.commit()

    with app_context.test_request_context():
        stats = get_dashboard_stats().get_json()
        
    assert stats['content_health']['stale_content']['documents']['stale'] == 0
    assert stats['content_health']['stale_content']['versions']['stale'] == 0


def test_content_health_stale_content_some_stale(app_context, db_conn):
    one_year_ago_plus_one_day = (datetime.now() - timedelta(days=366)).strftime('%Y-%m-%d %H:%M:%S')
    two_years_ago = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d %H:%M:%S')

    db_conn.execute("INSERT INTO documents (id, doc_name, updated_at) VALUES (1, 'D_stale', ?)", (one_year_ago_plus_one_day,))
    db_conn.execute("INSERT INTO documents (id, doc_name) VALUES (2, 'D_fresh')") # Uses default CURRENT_TIMESTAMP
    db_conn.execute("INSERT INTO versions (id, software_id, version_number, updated_at) VALUES (1, 1, 'V_stale', ?)", (two_years_ago,))
    db_conn.commit()

    with app_context.test_request_context():
        stats = get_dashboard_stats().get_json()
        
    assert stats['content_health']['stale_content']['documents']['stale'] == 1
    assert stats['content_health']['stale_content']['documents']['total'] == 2
    assert stats['content_health']['stale_content']['versions']['stale'] == 1
    assert stats['content_health']['stale_content']['versions']['total'] == 1
    
    # Ensure misc_categories is present even if empty
    assert 'misc_categories' in stats['content_health']['stale_content']
    assert stats['content_health']['stale_content']['misc_categories']['stale'] == 0
    assert stats['content_health']['stale_content']['misc_categories']['total'] == 0

    # Ensure software is NOT in stale_content (as it has no updated_at in this schema for staleness)
    assert 'software' not in stats['content_health']['stale_content']

# Note: The flask app context setup for get_dashboard_stats is basic.
# If get_dashboard_stats or its internal calls rely on specific Flask features
# like request object for args, or specific app.config values not set here,
# those tests might need a more elaborate app fixture.
# For now, assuming g.db is the primary dependency that's correctly mocked.
# Also, the jwt_required decorator is not handled here; if tests fail due to it,
# the test client or request context might need to simulate an authenticated request.
# For this task, focus is on the data aggregation logic.
