# app.py
import os
import uuid
import sqlite3
from functools import wraps
from flask import Flask, request, g, jsonify, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    create_access_token, jwt_required, JWTManager,
    get_jwt_identity, verify_jwt_in_request
)
from werkzeug.utils import secure_filename
import database # Your database.py helper

# --- Configuration ---
# Best practice: Use app.instance_path for user-generated content if possible
# This ensures files are not in your main app directory.
INSTANCE_FOLDER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
if not os.path.exists(INSTANCE_FOLDER_PATH):
    os.makedirs(INSTANCE_FOLDER_PATH, exist_ok=True)

# Define separate upload folders for clarity and potential different serving rules
DOC_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'documents')
PATCH_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'patches')
LINK_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'links')
MISC_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'misc_uploads')

# Ensure all upload folders exist
for folder in [DOC_UPLOAD_FOLDER, PATCH_UPLOAD_FOLDER, LINK_UPLOAD_FOLDER, MISC_UPLOAD_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True) # exist_ok=True is helpful

ALLOWED_EXTENSIONS = {
    'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 
    'mp4', 'mov', 'avi', 'wmv', # Video
    'mp3', 'wav', # Audio
    'zip', 'rar', '7z', 'tar', 'gz', # Archives
    'exe', 'msi', 'dmg', # Installers/Executables
    'dll', # Dynamic Link Libraries
    'doc', 'docx', 'odt', # Documents
    'xls', 'xlsx', 'csv', 'ods', # Spreadsheets
    'ppt', 'pptx', 'odp', # Presentations
    'iso', # Disc Images
    'log', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', # Config/Data files
    'py', 'js', 'java', 'c', 'cpp', 'h', 'cs', 'html', 'css', # Code files
    # Add any other specific extensions you anticipate
}
app = Flask(__name__, instance_relative_config=True) # instance_relative_config=True is good practice

# CORS Configuration (Restrict origins in production)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}}, # Adjust frontend origin
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# App Configuration
app.config['DATABASE'] = os.path.join(INSTANCE_FOLDER_PATH, 'software_dashboard.db') # DB in instance folder
app.config['SECRET_KEY'] = '161549f75b4148cd529620b59c4fd706b40ae5805912a513811e575c7cd23439fa63a8300b6f93295f353520c026bc25b1d07c4e1c369d3839cf74deca7e52210f3ac8967052cc51be1ceb45d81f57b8bd16ab5019d063a2de13ee802e1507d9e4dca8f6114ff1ed81300768acb5a95f48c100ad457ec1f8331f6fe9320bb816' 
app.config['JWT_SECRET_KEY'] = '991ca90ca06a362033f84c9a295a7c0f880caac7a74aefcf23df09f3b783c8e5a9bb0d8c1fcacf614d78cc3b580540419f55e08a29802eb9ea5e83a16eac641c0c028c814267dc94b261aa6a209462ea052773739f1429b7333185bf2b8bf8ba7ac19bccf691f4eece8d47174b6b3e191766d6a1a5c9a3ad21fd672f864e8a357d3c4b3fb838312a047156965a5756d73504db10b3920a3e6bfba5288443be112953e6b46132f6022280b192087384d6f8e91094bb5bbf21deac4bff2aaeda3f607db786b4847096f6112bad168e5223638c47146c74a9da65a54a86060c5298238169e1f2646f670c5f8014fe4997f9a2d8964e52938b627e31f58a70ece4d7'
app.config['BCRYPT_LOG_ROUNDS'] = 12

# Store upload folder paths in app config for easy access in routes
app.config['DOC_UPLOAD_FOLDER'] = DOC_UPLOAD_FOLDER
app.config['PATCH_UPLOAD_FOLDER'] = PATCH_UPLOAD_FOLDER
app.config['LINK_UPLOAD_FOLDER'] = LINK_UPLOAD_FOLDER
app.config['MISC_UPLOAD_FOLDER'] = MISC_UPLOAD_FOLDER

bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# --- Database Connection & Helpers ---
def get_db():
    if 'db' not in g:
        g.db = database.get_db_connection(app.config['DATABASE']) # Pass DB path
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def find_user_by_id(user_id):
    return get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

def find_user_by_username(username):
    return get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

def find_user_by_email(email):
    if not email or not email.strip(): return None
    return get_db().execute("SELECT * FROM users WHERE email = ?", (email.strip(),)).fetchone()

def create_user_in_db(username, password, email=None):
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    actual_email = email.strip() if email and email.strip() else None
    try:
        cursor = get_db().execute(
            "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
            (username, hashed_password, actual_email)
        )
        get_db().commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError as e:
        app.logger.error(f"DB IntegrityError creating user '{username}': {e}")
        return None
    except Exception as e:
        app.logger.error(f"DB General Exception creating user '{username}': {e}")
        return None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Authorization Decorator ---
def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        current_user_id_str = get_jwt_identity()
        try:
            user = find_user_by_id(int(current_user_id_str))
            if not user or user['role'] != 'admin':
                return jsonify(msg="Administration rights required."), 403
        except ValueError:
             return jsonify(msg="Invalid user identity in token."), 400
        return fn(*args, **kwargs)
    return wrapper

# --- Authentication Endpoints ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400
    username, password, email = data.get('username'), data.get('password'), data.get('email')

    if not username or not password: return jsonify(msg="Missing username or password"), 400
    if find_user_by_username(username): return jsonify(msg="Username already exists"), 409
    if email and find_user_by_email(email): return jsonify(msg="Email address already registered"), 409

    user_id = create_user_in_db(username, password, email)
    if user_id: return jsonify(msg="User created successfully", user_id=user_id), 201
    return jsonify(msg="Failed to create user due to a database issue."), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400
    username, password = data.get('username'), data.get('password')

    if not username or not password: return jsonify(msg="Missing username or password"), 400
    user = find_user_by_username(username)
    if user and bcrypt.check_password_hash(user['password_hash'], password):
        access_token = create_access_token(identity=str(user['id'])) # Ensure identity is string
        return jsonify(access_token=access_token, username=user['username'], role=user['role']), 200
    return jsonify(msg="Bad username or password"), 401

# --- Public GET Endpoints (Read-only data for dashboard) ---
@app.route('/api/software', methods=['GET'])
def get_all_software_api():
    software_list = get_db().execute("SELECT id, name, description FROM software ORDER BY name").fetchall()
    return jsonify([dict(row) for row in software_list])

@app.route('/api/versions_for_software', methods=['GET'])
def get_versions_for_software_api():
    software_id = request.args.get('software_id', type=int)
    if not software_id: return jsonify(msg="software_id parameter is required"), 400
    versions = get_db().execute(
        "SELECT id, version_number, release_date FROM versions WHERE software_id = ? ORDER BY release_date DESC, version_number DESC", (software_id,)
    ).fetchall()
    return jsonify([dict(row) for row in versions])

@app.route('/api/documents', methods=['GET'])
def get_all_documents_api():
    # Add filtering by software_id
    software_id_filter = request.args.get('software_id', type=int)
    query = "SELECT d.*, s.name as software_name FROM documents d JOIN software s ON d.software_id = s.id"
    params = []
    if software_id_filter:
        query += " WHERE d.software_id = ?"
        params.append(software_id_filter)
    query += " ORDER BY s.name, d.doc_name"
    documents = get_db().execute(query, params).fetchall()
    return jsonify([dict(row) for row in documents])

@app.route('/api/patches', methods=['GET'])
def get_all_patches_api():
    software_id_filter = request.args.get('software_id', type=int) # For filtering by parent software
    query = """
        SELECT p.*, s.name as software_name, v.version_number
        FROM patches p
        JOIN versions v ON p.version_id = v.id
        JOIN software s ON v.software_id = s.id
    """
    params = []
    if software_id_filter:
        query += " WHERE s.id = ?"
        params.append(software_id_filter)
    query += " ORDER BY s.name, v.release_date DESC, v.version_number DESC, p.patch_name"
    patches = get_db().execute(query, params).fetchall()
    return jsonify([dict(row) for row in patches])

@app.route('/api/links', methods=['GET'])
def get_all_links_api():
    software_id_filter = request.args.get('software_id', type=int)
    version_id_filter = request.args.get('version_id', type=int)
    query = """
        SELECT l.*, s.name as software_name, v.version_number as version_name
        FROM links l
        JOIN software s ON l.software_id = s.id
        LEFT JOIN versions v ON l.version_id = v.id
        WHERE 1=1
    """ # Using LEFT JOIN for version as it's optional
    params = []
    if software_id_filter:
        query += " AND l.software_id = ?"
        params.append(software_id_filter)
    if version_id_filter:
        query += " AND l.version_id = ?"
        params.append(version_id_filter)
    query += " ORDER BY s.name, v.version_number, l.title"
    links = get_db().execute(query, params).fetchall()
    return jsonify([dict(row) for row in links])

@app.route('/api/misc_categories', methods=['GET'])
def get_all_misc_categories_api():
    categories = get_db().execute("SELECT id, name, description FROM misc_categories ORDER BY name").fetchall()
    return jsonify([dict(row) for row in categories])

@app.route('/api/misc_files', methods=['GET'])
def get_all_misc_files_api():
    category_id_filter = request.args.get('category_id', type=int)
    query = """
        SELECT mf.*, mc.name as category_name
        FROM misc_files mf
        JOIN misc_categories mc ON mf.misc_category_id = mc.id
    """
    params = []
    if category_id_filter:
        query += " WHERE mf.misc_category_id = ?"
        params.append(category_id_filter)
    query += " ORDER BY mc.name, mf.user_provided_title, mf.original_filename"
    files = get_db().execute(query, params).fetchall()
    return jsonify([dict(row) for row in files])

# --- Admin Content Management Endpoints (POST for adding new content) ---

# Add this near your other helper functions in app.py
def _delete_file_if_exists(file_path):
    """Safely deletes a file if it exists."""
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            app.logger.info(f"Successfully deleted file: {file_path}")
            return True
        except OSError as e:
            app.logger.error(f"Error deleting file {file_path}: {e}")
            return False
    return False # File didn't exist or path was None

# Helper function for handling file uploads and DB insertion (DRY principle)
# app.py

def _admin_handle_file_upload_and_db_insert(
    table_name, upload_folder_config_key, server_path_prefix,
    metadata_fields, required_form_fields, sql_insert_query, sql_params_tuple,
    resolved_fks: dict = None
):
    current_user_id = int(get_jwt_identity())
    if resolved_fks is None:
        resolved_fks = {}

    if 'file' not in request.files:
        app.logger.warning(f"_admin_helper: 'file' not in request.files for table {table_name}")
        return jsonify(msg="No file part in request"), 400
    
    uploaded_file_obj = request.files['file']

    if uploaded_file_obj.filename == '':
        app.logger.warning(f"_admin_helper: No file selected (filename is empty) for table {table_name}")
        return jsonify(msg="No file selected"), 400

    form_data = {}
    for field in metadata_fields:
        form_data[field] = request.form.get(field)
    
    for fk_name, fk_value in resolved_fks.items():
        form_data[fk_name] = fk_value

    for req_field in required_form_fields:
        if req_field == 'file':
            if not uploaded_file_obj or not uploaded_file_obj.filename:
                app.logger.warning(f"_admin_helper: Validation failed for 'file' requirement for table {table_name}.")
                return jsonify(msg="Missing required file upload"), 400
        elif req_field not in form_data or form_data.get(req_field) is None or \
             (isinstance(form_data.get(req_field), str) and str(form_data.get(req_field)).strip() == ""):
            app.logger.warning(f"_admin_helper: Missing required metadata field '{req_field}' for table {table_name}. Value: {form_data.get(req_field)}")
            return jsonify(msg=f"Missing required metadata: {req_field}"), 400

    if uploaded_file_obj and allowed_file(uploaded_file_obj.filename):
        original_filename = secure_filename(uploaded_file_obj.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        stored_filename = f"{uuid.uuid4().hex}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config[upload_folder_config_key], stored_filename)
        download_link_or_path = f"{server_path_prefix}/{stored_filename}"

        try:
            uploaded_file_obj.save(file_save_path)
            file_size = os.path.getsize(file_save_path)

            final_sql_params = []
            for param_name_in_tuple in sql_params_tuple:
                if param_name_in_tuple == 'download_link_or_url': final_sql_params.append(download_link_or_path)
                elif param_name_in_tuple == 'is_external_link': final_sql_params.append(False)
                elif param_name_in_tuple == 'stored_filename': final_sql_params.append(stored_filename)
                elif param_name_in_tuple == 'original_filename_ref' or param_name_in_tuple == 'original_filename': 
                    final_sql_params.append(original_filename)
                elif param_name_in_tuple == 'file_size': final_sql_params.append(file_size)
                elif param_name_in_tuple == 'file_type': final_sql_params.append(uploaded_file_obj.mimetype)
                elif param_name_in_tuple == 'created_by_user_id': final_sql_params.append(current_user_id)
                elif param_name_in_tuple == 'updated_by_user_id': final_sql_params.append(current_user_id)
                elif param_name_in_tuple == 'user_id' and table_name == 'misc_files': # For misc_files.user_id
                    final_sql_params.append(current_user_id)
                elif param_name_in_tuple in form_data:
                    final_sql_params.append(form_data[param_name_in_tuple])
                else:
                    app.logger.warning(f"_admin_helper: SQL param '{param_name_in_tuple}' not found in form_data for table '{table_name}'. Appending None.")
                    final_sql_params.append(None)

            db = get_db()
            cursor = db.execute(sql_insert_query, tuple(final_sql_params))
            db.commit()
            new_id = cursor.lastrowid
            app.logger.info(f"_admin_helper: Successfully inserted into {table_name}, new ID: {new_id}")

            # --- CORRECTED FETCH-BACK SECTION ---
            fetch_back_query = ""
            if table_name == 'patches':
                 fetch_back_query = """
                    SELECT p.*, s.name as software_name, v.version_number
                    FROM patches p
                    JOIN versions v ON p.version_id = v.id
                    JOIN software s ON v.software_id = s.id
                    WHERE p.id = ?"""
            elif table_name == 'links':
                 fetch_back_query = """
                    SELECT l.*, s.name as software_name, v.version_number as version_name
                    FROM links l
                    JOIN software s ON l.software_id = s.id
                    LEFT JOIN versions v ON l.version_id = v.id
                    WHERE l.id = ?"""
            elif table_name == 'misc_files': # **** THIS WAS MISSING/REPLACED ****
                 fetch_back_query = """
                    SELECT mf.*, mc.name as category_name
                    FROM misc_files mf
                    JOIN misc_categories mc ON mf.misc_category_id = mc.id
                    WHERE mf.id = ?"""
            elif table_name == 'documents': # **** THIS WAS MISSING/REPLACED ****
                 fetch_back_query = """
                    SELECT d.*, s.name as software_name
                    FROM documents d
                    JOIN software s ON d.software_id = s.id
                    WHERE d.id = ?"""
            else:
                # This default is a fallback, but ideally all tables handled by this helper
                # should have specific fetch-back queries if they need joins.
                app.logger.warning(f"_admin_helper: Using default fetch-back query for table {table_name}. No joins performed.")
                fetch_back_query = f"SELECT * FROM {table_name} WHERE id = ?"

            app.logger.debug(f"_admin_helper: Attempting to fetch back from {table_name} with ID {new_id} using query: {fetch_back_query}")
            new_item_cursor = None
            new_item_row = None
            try:
                new_item_cursor = db.execute(fetch_back_query, (new_id,))
                new_item_row = new_item_cursor.fetchone()
            except Exception as e_fetch:
                app.logger.error(f"_admin_helper: EXCEPTION during fetch back for {table_name} ID {new_id}: {e_fetch}")
                return jsonify(msg=f"Item uploaded but DB error during metadata retrieval for {table_name}: {e_fetch}"), 500
            
            if new_item_row:
                app.logger.info(f"_admin_helper: Successfully fetched back item from {table_name} ID {new_id}.")
                try:
                    new_item = dict(new_item_row)
                    app.logger.debug(f"_admin_helper: Converted fetched row to dict: {new_item}")
                    return jsonify(new_item), 201
                except Exception as e_dict:
                    app.logger.error(f"_admin_helper: EXCEPTION converting sqlite3.Row to dict for {table_name} ID {new_id}: {e_dict}. Row data: {new_item_row}")
                    return jsonify(msg=f"Item uploaded, metadata fetched but failed to process for {table_name}."), 500
            else:
                app.logger.error(f"_admin_helper: Failed to retrieve (fetchone() was None) newly uploaded item from {table_name}, ID: {new_id} after using specific query.")
                # Try a simpler query without the JOIN for diagnosis
                simple_check_cursor = db.execute(f"SELECT * FROM {table_name} WHERE id = ?", (new_id,))
                simple_row = simple_check_cursor.fetchone()
                if simple_row:
                    app.logger.warning(f"_admin_helper: Simple fetch for {table_name} ID {new_id} FOUND a row. Problem might be with the JOIN or data for JOIN in the specific fetch-back query. Simple row: {dict(simple_row)}")
                else:
                    app.logger.error(f"_admin_helper: Simple fetch for {table_name} ID {new_id} also FAILED to find the row. This is very unexpected after successful insert.")
                return jsonify(msg=f"Item uploaded but metadata retrieval failed for {table_name}"), 500

        except sqlite3.IntegrityError as e:
            if os.path.exists(file_save_path): os.remove(file_save_path)
            app.logger.error(f"Admin upload for {table_name} DB IntegrityError: {e}")
            return jsonify(msg=f"Database error: {e}"), 409
        except Exception as e:
            if os.path.exists(file_save_path): os.remove(file_save_path)
            app.logger.error(f"Admin upload for {table_name} Exception: {e}")
            return jsonify(msg=f"Server error during file upload: {e}"), 500
    else: # This else corresponds to "if uploaded_file_obj and allowed_file(...)"
        app.logger.warning(f"_admin_helper: File type not allowed or file object invalid for {uploaded_file_obj.filename if uploaded_file_obj else 'N/A'} for table {table_name}")
        return jsonify(msg="File type not allowed or invalid file object."), 400

def get_or_create_version_id(db: sqlite3.Connection, software_id: int, version_string: str, user_id: int) -> int | None:
    """
    Finds an existing version by software_id and version_string, or creates a new one.
    Returns the version_id or None if an error occurs.
    Commits the new version if created.
    """
    if not software_id or not version_string or not user_id:
        app.logger.error("get_or_create_version_id: Missing required arguments.")
        return None

    version_string = version_string.strip()
    if not version_string:
        app.logger.error("get_or_create_version_id: Version string cannot be empty.")
        return None

    try:
        # Attempt to find existing version
        existing_version = db.execute(
            "SELECT id FROM versions WHERE software_id = ? AND version_number = ?",
            (software_id, version_string)
        ).fetchone()

        if existing_version:
            return existing_version['id']
        else:
            # Create new version if not found
            # Set a default release_date to today for new versions created this way.
            # Other fields like main_download_link, changelog, known_bugs will be NULL.
            cursor = db.execute(
                """INSERT INTO versions (software_id, version_number, created_by_user_id, updated_by_user_id, release_date)
                   VALUES (?, ?, ?, ?, date('now'))""",
                (software_id, version_string, user_id, user_id)
            )
            db.commit() # Commit the new version creation immediately
            new_version_id = cursor.lastrowid
            app.logger.info(f"Created new version '{version_string}' for software_id {software_id}, new version_id: {new_version_id}")
            return new_version_id
    except sqlite3.IntegrityError as e:
        # This could happen if software_id doesn't exist (FK constraint on versions.software_id)
        db.rollback()
        app.logger.error(f"get_or_create_version_id: DB integrity error for version '{version_string}', software {software_id}: {e}")
        return None # Propagate error by returning None
    except Exception as e:
        db.rollback()
        app.logger.error(f"get_or_create_version_id: General exception for version '{version_string}', software {software_id}: {e}")
        return None # Propagate error

def _admin_add_item_with_external_link(
    table_name, data, required_fields, sql_insert_query, sql_params_tuple
):
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        app.logger.error(f"ADMIN_HELPER_LINK: Invalid user ID format in JWT: {current_user_id_str} for table {table_name}")
        return jsonify(msg="Invalid user identity in token"), 400 # Or 401/403

    if not data:
        app.logger.warning(f"ADMIN_HELPER_LINK: Missing JSON data for table {table_name}")
        return jsonify(msg="Missing JSON data"), 400

    form_data = {}
    all_present = True
    missing_fields_list = [] # For better error message

    for field_name in sql_params_tuple: # Iterate through expected params to build form_data map
        if field_name not in ['is_external_link', 'created_by_user_id', 'updated_by_user_id', 
                               'stored_filename', 'original_filename_ref', 'file_size', 'file_type']: # System-set fields
            form_data[field_name] = data.get(field_name)

    for req_field in required_fields:
        if not form_data.get(req_field): # Check if the value is missing or falsy (e.g., empty string for text)
            # Allow 0 for IDs if that's valid, but generally IDs are > 0
            if isinstance(form_data.get(req_field), int) and form_data.get(req_field) == 0:
                pass # Allow 0 if it's a valid ID in some context (though unusual for FKs)
            else:
                all_present = False
                missing_fields_list.append(req_field)

    if not all_present:
        error_msg = f"Missing one or more required fields: {', '.join(missing_fields_list)}"
        app.logger.warning(f"ADMIN_HELPER_LINK: {error_msg} for table {table_name}. Data: {data}")
        return jsonify(msg=error_msg), 400

    # Convert IDs (example, adapt if more ID fields are used by different tables)
    if 'software_id' in form_data and form_data['software_id'] is not None:
        try: form_data['software_id'] = int(form_data['software_id'])
        except (ValueError, TypeError): return jsonify(msg="Invalid software_id format"), 400
    if 'version_id' in form_data and form_data['version_id'] is not None:
        try: form_data['version_id'] = int(form_data['version_id'])
        except (ValueError, TypeError): return jsonify(msg="Invalid version_id format"), 400
    # Add similar conversions for other ID fields if necessary


    final_sql_params = []
    for param_name_in_tuple in sql_params_tuple:
        if param_name_in_tuple == 'is_external_link':
            final_sql_params.append(True)
        elif param_name_in_tuple == 'created_by_user_id':
            final_sql_params.append(current_user_id)
        elif param_name_in_tuple == 'updated_by_user_id': # Also set updated_by on creation
            final_sql_params.append(current_user_id)
        elif param_name_in_tuple in form_data:
            final_sql_params.append(form_data[param_name_in_tuple])
        else:
            # This handles optional fields that were not in required_fields AND not in form_data
            # and also system-set file fields that are NULL for external links
            final_sql_params.append(None)

    db = get_db()
    try:
        app.logger.info(f"ADMIN_HELPER_LINK: Attempting to insert into {table_name}. Params: {final_sql_params}")
        cursor = db.execute(sql_insert_query, tuple(final_sql_params))
        db.commit()
        new_id = cursor.lastrowid
        app.logger.info(f"ADMIN_HELPER_LINK: Inserted into {table_name} with ID: {new_id}. Fetching back...")

        # Fetch the newly created item to return it
        new_item_row = db.execute(f"SELECT * FROM {table_name} WHERE id = ?", (new_id,)).fetchone()
        
        if new_item_row:
            new_item = dict(new_item_row)
            app.logger.info(f"ADMIN_HELPER_LINK: Successfully fetched back new item from {table_name}: {new_item}")
            return jsonify(new_item), 201
        else:
            app.logger.error(f"ADMIN_HELPER_LINK: CRITICAL - Failed to fetch newly added item from {table_name} with ID: {new_id} immediately after commit.")
            # Data IS in the DB. This part of your UI message is correct.
            # The question is why it can't be fetched back immediately.
            # Return a 207 Multi-Status: one part succeeded (insert), one part failed (fetch-back for immediate confirmation)
            return jsonify(msg=f"Item added to {table_name} (ID: {new_id}) but could not be immediately retrieved for confirmation. Please refresh the list."), 207

    except sqlite3.IntegrityError as e:
        db.rollback() # Rollback on integrity error
        app.logger.error(f"ADMIN_HELPER_LINK: DB IntegrityError for {table_name}: {e}. Data: {form_data}")
        return jsonify(msg=f"Database integrity error (e.g., duplicate entry for context): {e}"), 409
    except Exception as e:
        db.rollback() # Rollback on any other error
        app.logger.error(f"ADMIN_HELPER_LINK: General Exception for {table_name}: {e}. Data: {form_data}")
        return jsonify(msg=f"Server error while adding item to {table_name}: {e}"), 500

# --- Specific Admin Endpoints using Helpers ---
@app.route('/api/admin/documents/add_with_url', methods=['POST'])
@jwt_required() 
@admin_required
def admin_add_document_with_url():
    return _admin_add_item_with_external_link(
        table_name='documents', data=request.get_json(),
        required_fields=['software_id', 'doc_name', 'download_link'],
        sql_insert_query="""INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", # 8 params
        sql_params_tuple=('software_id', 'doc_name', 'download_link', 'description', 'doc_type',
                          'is_external_link', 'created_by_user_id', 'updated_by_user_id')
    )

@app.route('/api/admin/documents/upload_file', methods=['POST'])
@jwt_required() 
@admin_required
def admin_upload_document_file():
    return _admin_handle_file_upload_and_db_insert(
        table_name='documents', upload_folder_config_key='DOC_UPLOAD_FOLDER', server_path_prefix='/official_uploads/docs',
        metadata_fields=['software_id', 'doc_name', 'description', 'doc_type'],
        required_form_fields=['software_id', 'doc_name_or_file'],
        sql_insert_query="""INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                               created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", # 12 params
        sql_params_tuple=('software_id', 'doc_name', 'download_link_or_url', 'description', 'doc_type',
                          'is_external_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
                          'created_by_user_id', 'updated_by_user_id')
    )

# Similar endpoints for Patches
# app.py

@app.route('/api/admin/patches/add_with_url', methods=['POST'])
@jwt_required()
@admin_required
def admin_add_patch_with_url():
    current_user_id = int(get_jwt_identity())
    db = get_db()
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    software_id_str = data.get('software_id') # Needed if typed_version_string is used
    provided_version_id_str = data.get('version_id') # From dropdown
    typed_version_string = data.get('typed_version_string') # From typed input

    final_version_id = None

    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id = int(provided_version_id_str)
            # Optional: Verify this version_id belongs to software_id if software_id is also sent
            # and is required even when version_id is directly provided.
            # if software_id_str:
            #     temp_sw_id = int(software_id_str)
            #     ver_check = db.execute("SELECT id FROM versions WHERE id = ? AND software_id = ?", (final_version_id, temp_sw_id)).fetchone()
            #     if not ver_check:
            #         return jsonify(msg="Provided version_id does not match the provided software_id."), 400
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        if not software_id_str: # software_id is required to create/find a version by string
            return jsonify(msg="software_id is required when using typed_version_string."), 400
        try:
            software_id = int(software_id_str)
        except ValueError:
            return jsonify(msg="Invalid software_id format for typed_version_string."), 400
        
        final_version_id = get_or_create_version_id(db, software_id, typed_version_string, current_user_id)
        if final_version_id is None:
            return jsonify(msg=f"Failed to find or create version '{typed_version_string}' for software ID {software_id}."), 500
    else: # Neither version_id nor typed_version_string provided for a patch
        return jsonify(msg="Either version_id (from selection) or typed_version_string (for new/find) is required for a patch."), 400

    # Update data payload for the helper
    data['version_id'] = final_version_id # This is now the resolved ID
    data.pop('software_id', None) # Clean up, helper doesn't need these if version_id is set
    data.pop('typed_version_string', None)

    return _admin_add_item_with_external_link(
        table_name='patches',
        data=data,
        required_fields=['version_id', 'patch_name', 'download_link'],
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date,
                                             is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""",
        sql_params_tuple=(
            'version_id', 'patch_name', 'download_link', 'description', 'release_date',
            'created_by_user_id', 'updated_by_user_id' # is_external_link removed as it's hardcoded
        )
    )
@app.route('/api/admin/patches/upload_file', methods=['POST'])
@jwt_required()
@admin_required
def admin_upload_patch_file():
    current_user_id = int(get_jwt_identity())
    db = get_db()

    software_id_str = request.form.get('software_id')
    provided_version_id_str = request.form.get('version_id')
    typed_version_string = request.form.get('typed_version_string')

    final_version_id = None

    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id = int(provided_version_id_str)
            # Optional: verify against software_id if needed
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        if not software_id_str:
            return jsonify(msg="software_id is required when using typed_version_string."), 400
        try:
            software_id = int(software_id_str)
        except ValueError:
            return jsonify(msg="Invalid software_id format for typed_version_string."), 400
        
        final_version_id = get_or_create_version_id(db, software_id, typed_version_string, current_user_id)
        if final_version_id is None:
            return jsonify(msg=f"Failed to find or create version '{typed_version_string}' for software ID {software_id}."), 500
    else:
        return jsonify(msg="Either version_id or typed_version_string is required for a patch."), 400
    
    return _admin_handle_file_upload_and_db_insert(
        table_name='patches',
        upload_folder_config_key='PATCH_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/patches',
        metadata_fields=['patch_name', 'description', 'release_date'], # software_id, typed_version_string, version_id are handled
        required_form_fields=['patch_name'], # version_id handled by resolved_fks
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date,
                                             is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                             created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""",
        sql_params_tuple=(
            'version_id', 'patch_name', 'download_link_or_url', 'description', 'release_date',
            'is_external_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
            'created_by_user_id', 'updated_by_user_id'
        ),
        resolved_fks={'version_id': final_version_id} # Pass the resolved version_id
    )


# Similar endpoints for Links
@app.route('/api/admin/documents/<int:document_id>/edit_url', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_document_url(document_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    
    doc = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not doc:
        return jsonify(msg="Document not found"), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    # Fields that can be updated for a URL-based document
    # software_id is typically not changed, but can be if needed.
    # doc_name, description, doc_type, download_link (the external URL)
    software_id = data.get('software_id', doc['software_id'])
    doc_name = data.get('doc_name', doc['doc_name'])
    description = data.get('description', doc['description'])
    doc_type = data.get('doc_type', doc['doc_type'])
    download_link = data.get('download_link', doc['download_link']) # The external URL

    if not doc_name or not download_link:
        return jsonify(msg="Document name and download link are required"), 400
    
    try:
        software_id = int(software_id)
    except (ValueError, TypeError):
        return jsonify(msg="Invalid software_id format"), 400

    # If the document was previously a file upload and is now becoming a URL
    if not doc['is_external_link'] and doc['stored_filename']:
        old_file_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], doc['stored_filename'])
        _delete_file_if_exists(old_file_path)

    try:
        db.execute("""
            UPDATE documents
            SET software_id = ?, doc_name = ?, description = ?, doc_type = ?,
                download_link = ?, is_external_link = TRUE, stored_filename = NULL,
                original_filename_ref = NULL, file_size = NULL, file_type = NULL,
                updated_by_user_id = ?
            WHERE id = ?
        """, (software_id, doc_name, description, doc_type, download_link,
              current_user_id, document_id))
        db.commit()
        
        updated_doc = db.execute("SELECT d.*, s.name as software_name FROM documents d JOIN software s ON d.software_id = s.id WHERE d.id = ?", (document_id,)).fetchone()
        return jsonify(dict(updated_doc)), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        app.logger.error(f"Admin edit document URL DB IntegrityError: {e}")
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Admin edit document URL Exception: {e}")
        return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/documents/<int:document_id>/edit_file', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_document_file(document_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()

    doc = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not doc:
        return jsonify(msg="Document not found"), 404

    # Check if a new file is being uploaded
    new_file = request.files.get('file') # Use .get() for optional file

    # Metadata from form fields
    software_id_str = request.form.get('software_id', str(doc['software_id']))
    doc_name = request.form.get('doc_name', doc['doc_name'])
    description = request.form.get('description', doc['description'])
    doc_type = request.form.get('doc_type', doc['doc_type'])

    try:
        software_id = int(software_id_str)
    except ValueError:
        return jsonify(msg="Invalid software_id format"), 400

    if not doc_name: # doc_name is required even if file provides original_filename
        return jsonify(msg="Document name is required"), 400

    new_stored_filename = doc['stored_filename']
    new_original_filename = doc['original_filename_ref']
    new_file_size = doc['file_size']
    new_file_type = doc['file_type']
    new_download_link = doc['download_link']

    if new_file and new_file.filename != '':
        if not allowed_file(new_file.filename):
            return jsonify(msg="File type not allowed"), 400

        # Delete old file if it exists and was a file upload
        if not doc['is_external_link'] and doc['stored_filename']:
            old_file_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], doc['stored_filename'])
            _delete_file_if_exists(old_file_path)
        
        original_filename = secure_filename(new_file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        stored_filename_base = uuid.uuid4().hex
        new_stored_filename = f"{stored_filename_base}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], new_stored_filename)
        
        try:
            new_file.save(file_save_path)
            new_file_size = os.path.getsize(file_save_path)
            new_file_type = new_file.mimetype
            new_original_filename = original_filename
            new_download_link = f"/official_uploads/docs/{new_stored_filename}"
        except Exception as e:
            app.logger.error(f"Error saving new uploaded file during edit: {e}")
            return jsonify(msg=f"Error saving new file: {e}"), 500
    elif not doc['is_external_link'] and not doc['stored_filename'] and not new_file :
        # This case means it was an external link before, or had no file, and still no new file uploaded.
        # If it's becoming an external link, it should use the edit_url endpoint.
        # If it's remaining a "file-based" document but just metadata is changing, this is okay.
        # However, a "file-based" document should generally have a file.
        # This logic assumes if no new file, the old file (if any) details are kept,
        # or if it was external, it stays external (which shouldn't hit this endpoint).
        # This endpoint is specifically for when it *is* or *becomes* a file-based document.
        # If it was external and is now file based, a file must be uploaded.
        if doc['is_external_link']: # If it was external, it needs a file now.
            return jsonify(msg="To change from URL to File, a file must be uploaded."), 400

    try:
        db.execute("""
            UPDATE documents
            SET software_id = ?, doc_name = ?, description = ?, doc_type = ?,
                download_link = ?, is_external_link = FALSE, stored_filename = ?,
                original_filename_ref = ?, file_size = ?, file_type = ?,
                updated_by_user_id = ?
            WHERE id = ?
        """, (software_id, doc_name, description, doc_type,
              new_download_link, new_stored_filename, new_original_filename,
              new_file_size, new_file_type, current_user_id, document_id))
        db.commit()
        
        updated_doc = db.execute("SELECT d.*, s.name as software_name FROM documents d JOIN software s ON d.software_id = s.id WHERE d.id = ?", (document_id,)).fetchone()
        return jsonify(dict(updated_doc)), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        # If a new file was saved but DB failed, try to delete the newly saved file.
        if new_file and new_file.filename != '' and 'file_save_path' in locals():
            _delete_file_if_exists(file_save_path)
        app.logger.error(f"Admin edit document file DB IntegrityError: {e}")
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        if new_file and new_file.filename != '' and 'file_save_path' in locals():
            _delete_file_if_exists(file_save_path)
        app.logger.error(f"Admin edit document file Exception: {e}")
        return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/documents/<int:document_id>/delete', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_document(document_id):
    current_user_id = int(get_jwt_identity()) # For logging or audit, though not strictly needed for delete logic
    db = get_db()
    
    doc = db.execute("SELECT id, stored_filename, is_external_link FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not doc:
        return jsonify(msg="Document not found"), 404

    # If it's not an external link and has a stored filename, delete the file
    if not doc['is_external_link'] and doc['stored_filename']:
        file_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], doc['stored_filename'])
        _delete_file_if_exists(file_path) # Helper handles existence check

    try:
        db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted document ID {document_id}")
        return jsonify(msg="Document deleted successfully"), 200 # Or 204 No Content
    except sqlite3.Error as e: # Catch specific SQLite errors if needed for FK constraints
        db.rollback()
        # Example: if FK constraint blocks delete (though schema doesn't have docs as FK target)
        # if "FOREIGN KEY constraint failed" in str(e):
        #    return jsonify(msg=f"Cannot delete document: it is referenced by other items. Details: {e}"), 409
        app.logger.error(f"Error deleting document ID {document_id}: {e}")
        return jsonify(msg=f"Database error while deleting document: {e}"), 500


# app.py

@app.route('/api/admin/links/upload_file', methods=['POST'])
@jwt_required()
@admin_required
def admin_upload_link_file():
    current_user_id = int(get_jwt_identity())
    db = get_db()

    software_id_str = request.form.get('software_id')
    provided_version_id_str = request.form.get('version_id') # From dropdown selection by frontend
    typed_version_string = request.form.get('typed_version_string') # From typed input by frontend

    if not software_id_str:
        return jsonify(msg="software_id form field is required"), 400
    try:
        software_id = int(software_id_str)
    except ValueError:
        return jsonify(msg="Invalid software_id format"), 400

    final_version_id_for_db = None
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id_for_db = int(provided_version_id_str)
            # Optional: verify version_id belongs to software_id
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        final_version_id_for_db = get_or_create_version_id(db, software_id, typed_version_string, current_user_id)
        if final_version_id_for_db is None:
            return jsonify(msg=f"Failed to find or create version '{typed_version_string}' for software ID {software_id}."), 500
    else:
        # Since version is MANDATORY for links
        return jsonify(msg="A version (either selected ID or typed string) is mandatory for links."), 400
            
    return _admin_handle_file_upload_and_db_insert(
        table_name='links',
        upload_folder_config_key='LINK_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/links',
        metadata_fields=['software_id', 'title', 'description'], 
        required_form_fields=['software_id', 'version_id', 'title'], # version_id is checked from resolved_fks
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                           created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""", # 11 '?'
        sql_params_tuple=( # Should be 11 items
            'software_id', 'version_id', 'title', 'download_link_or_url', 'description',
            # 'is_external_link', <--- REMOVE THIS
            'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
            'created_by_user_id', 'updated_by_user_id'
        ),
        resolved_fks={'version_id': final_version_id_for_db}
    )

@app.route('/api/admin/patches/<int:patch_id>/edit_url', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_patch_url(patch_id_from_url): # Renamed to avoid conflict with variable 'patch_id'
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT * FROM patches WHERE id = ?", (patch_id_from_url,)).fetchone()
    if not patch: return jsonify(msg="Patch not found"), 404

    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400

    software_id_str = data.get('software_id') # Used if version string is changing
    provided_version_id_str = data.get('version_id') # If user picks existing version
    typed_version_string = data.get('typed_version_string') # If user types/changes version string

    # Determine the version_id to update with
    final_version_id = patch['version_id'] # Default to existing version_id
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id = int(provided_version_id_str)
        except ValueError: return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip(): # If a new/different version string is typed
        if not software_id_str: # Need software_id to make sense of the typed version string
            # If software_id isn't sent, but we need it to process typed_version_string,
            # we might need to fetch the software_id of the patch's current version.
            # This assumes software_id is always sent by frontend if typed_version_string is active.
            current_version_details = db.execute("SELECT software_id FROM versions WHERE id = ?", (patch['version_id'],)).fetchone()
            if not current_version_details:
                 return jsonify(msg="Cannot determine software for the current patch version."), 500
            software_id_for_version_logic = current_version_details['software_id']
        else:
            try:
                software_id_for_version_logic = int(software_id_str)
            except ValueError: return jsonify(msg="Invalid software_id format."), 400

        resolved_id = get_or_create_version_id(db, software_id_for_version_logic, typed_version_string, current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}'."), 500
        final_version_id = resolved_id

    # Get other fields for update
    patch_name = data.get('patch_name', patch['patch_name'])
    description = data.get('description', patch['description'])
    release_date = data.get('release_date', patch['release_date'])
    download_link = data.get('download_link', patch['download_link'])

    # Basic validation for required fields during edit
    if not patch_name or not download_link: # software_id/version handled above
        return jsonify(msg="Patch name and download link are required for edit."), 400

    if not patch['is_external_link'] and patch['stored_filename']:
        _delete_file_if_exists(os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename']))

    try:
        db.execute("""
            UPDATE patches SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
            download_link = ?, is_external_link = TRUE, stored_filename = NULL,
            original_filename_ref = NULL, file_size = NULL, file_type = NULL,
            updated_by_user_id = ? WHERE id = ?""",
            (final_version_id, patch_name, description, release_date, download_link,
             current_user_id, patch_id_from_url))
        db.commit()
        updated_item = db.execute("SELECT p.*, s.name as software_name, v.version_number FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id WHERE p.id = ?", (patch_id_from_url,)).fetchone()
        return jsonify(dict(updated_item)), 200
    except sqlite3.IntegrityError as e: db.rollback(); return jsonify(msg=f"DB error: {e}"), 409
    except Exception as e: db.rollback(); return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/patches/<int:patch_id>/edit_file', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_patch_file(patch_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT * FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch: return jsonify(msg="Patch not found"), 404

    new_physical_file = request.files.get('file')
    software_id_str = request.form.get('software_id')
    provided_version_id_str = request.form.get('version_id')
    typed_version_string = request.form.get('typed_version_string')
    patch_name = request.form.get('patch_name', patch['patch_name'])
    description = request.form.get('description', patch['description'])
    release_date = request.form.get('release_date', patch['release_date'])

    # Determine final version ID using the improved logic from second file
    final_version_id = patch['version_id']  # Default to current version
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id = int(provided_version_id_str)
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id"), 400
    elif typed_version_string and typed_version_string.strip():
        # Determine software_id for get_or_create_version_id
        software_id_for_version_logic = None
        if software_id_str:
            try:
                software_id_for_version_logic = int(software_id_str)
            except ValueError:
                return jsonify(msg="Invalid software_id format"), 400
        else:
            # Fallback to current patch's version's software_id if not provided
            current_version_details = db.execute(
                "SELECT software_id FROM versions WHERE id = ?", 
                (patch['version_id'],)
            ).fetchone()
            if not current_version_details:
                return jsonify(msg="Cannot determine software for current patch version"), 500
            software_id_for_version_logic = current_version_details['software_id']

        resolved_id = get_or_create_version_id(db, software_id_for_version_logic, typed_version_string, current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}'"), 500
        final_version_id = resolved_id

    if not patch_name:
        return jsonify(msg="Patch name is required"), 400

    # File handling logic
    new_stored_filename = patch['stored_filename']
    new_original_filename = patch['original_filename_ref']
    new_file_size = patch['file_size']
    new_file_type = patch['file_type']
    new_download_link = patch['download_link']
    file_save_path = None

    if new_physical_file and new_physical_file.filename != '':
        if not allowed_file(new_physical_file.filename):
            return jsonify(msg="File type not allowed"), 400
        if not patch['is_external_link'] and patch['stored_filename']:
            _delete_file_if_exists(os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename']))
        
        original_filename = secure_filename(new_physical_file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        new_stored_filename = f"{uuid.uuid4().hex}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], new_stored_filename)
        try:
            new_physical_file.save(file_save_path)
            new_file_size = os.path.getsize(file_save_path)
            new_file_type = new_physical_file.mimetype
            new_original_filename = original_filename
            new_download_link = f"/official_uploads/patches/{new_stored_filename}"
        except Exception as e:
            return jsonify(msg=f"Error saving new file: {e}"), 500
    elif patch['is_external_link'] and not new_physical_file:
        return jsonify(msg="To change from URL to File, a file must be uploaded."), 400

    try:
        db.execute("""
            UPDATE patches SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
            download_link = ?, is_external_link = FALSE, stored_filename = ?,
            original_filename_ref = ?, file_size = ?, file_type = ?, updated_by_user_id = ?
            WHERE id = ?""",
            (final_version_id, patch_name, description, release_date, new_download_link,
             new_stored_filename, new_original_filename, new_file_size, new_file_type,
             current_user_id, patch_id))
        db.commit()
        updated_item = db.execute(
            """SELECT p.*, s.name as software_name, v.version_number 
               FROM patches p 
               JOIN versions v ON p.version_id = v.id 
               JOIN software s ON v.software_id = s.id 
               WHERE p.id = ?""", 
            (patch_id,)
        ).fetchone()
        return jsonify(dict(updated_item)), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path):
            _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"DB error: {e}"), 409
    except Exception as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path):
            _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/patches/<int:patch_id>/delete', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_patch(patch_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT id, stored_filename, is_external_link FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch:
        return jsonify(msg="Patch not found"), 404

    if not patch['is_external_link'] and patch['stored_filename']:
        file_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename'])
        _delete_file_if_exists(file_path)

    try:
        db.execute("DELETE FROM patches WHERE id = ?", (patch_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted patch ID {patch_id}")
        return jsonify(msg="Patch deleted successfully"), 200
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Error deleting patch ID {patch_id}: {e}")
        return jsonify(msg=f"Database error while deleting patch: {e}"), 500

# --- Misc Category Management ---
@app.route('/api/admin/misc_categories', methods=['POST'])
@jwt_required() 
@admin_required
def admin_add_misc_category():
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data or not data.get('name'): return jsonify(msg="Category name is required"), 400
    name, description = data['name'].strip(), data.get('description', '')
    if not name: return jsonify(msg="Category name cannot be empty"), 400
    try:
        db = get_db()
        cursor = db.execute(
            "INSERT INTO misc_categories (name, description, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?)",
            (name, description, current_user_id, current_user_id)
        )
        db.commit()
        new_cat_cursor = db.execute("SELECT * FROM misc_categories WHERE id = ?", (cursor.lastrowid,))
        return jsonify(dict(new_cat_cursor.fetchone())), 201
    except sqlite3.IntegrityError: return jsonify(msg=f"Misc category '{name}' likely already exists."), 409
    except Exception as e:
        app.logger.error(f"Add misc_category error: {e}")
        return jsonify(msg="Server error adding misc category."), 500


@app.route('/api/admin/links/<int:link_id_from_url>/edit_url', methods=['PUT']) # Renamed link_id
@jwt_required()
@admin_required
def admin_edit_link_url(link_id_from_url):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id_from_url,)).fetchone()
    if not link_item: return jsonify(msg="Link not found"), 404

    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400

    # software_id for the link itself (can it change? Assume yes for now)
    software_id_str = data.get('software_id', str(link_item['software_id']))
    provided_version_id_str = data.get('version_id')
    typed_version_string = data.get('typed_version_string')

    title = data.get('title', link_item['title'])
    description = data.get('description', link_item['description'])
    url = data.get('url', link_item['url'])

    if not software_id_str or not title or not url: # Basic required fields for a link
        return jsonify(msg="Software ID, title, and URL are required for edit."), 400
    try:
        software_id_for_link = int(software_id_str) # This is the software_id for the link table
    except ValueError: return jsonify(msg="Invalid software_id format for link."), 400

    # Determine the version_id to update with. It's mandatory.
    final_version_id_for_db = None
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id_for_db = int(provided_version_id_str)
            # You might want to verify that this new version_id actually belongs to software_id_for_link
            # if not db.execute("SELECT id FROM versions WHERE id = ? AND software_id = ?", (final_version_id_for_db, software_id_for_link)).fetchone():
            #    return jsonify(msg="Selected version does not belong to the link's specified software product."), 400
        except ValueError: return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        # Use software_id_for_link to find/create the version
        resolved_id = get_or_create_version_id(db, software_id_for_link, typed_version_string, current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}' for software ID {software_id_for_link}."), 500
        final_version_id_for_db = resolved_id
    else:
        # If neither is provided, but version is mandatory, this is an error during edit.
        # However, if only other fields are changing, we should use the existing version_id.
        # This block means user actively cleared version selection without providing a new typed one.
        # If this is not allowed, the frontend should prevent it.
        # If we must have a version, and they didn't provide one, use existing.
        # But if they *could* have provided one and didn't, it might be an attempt to remove it.
        # Given version is MANDATORY, if they don't provide a new one, we retain the old.
        # If the frontend *always* sends one (either selected, or typed, or the original if unchanged), this else might not be hit.
        # For safety, if version is mandatory, ensure final_version_id_for_db is set.
        if not link_item['version_id']: # Should not happen if version is truly mandatory from the start
            return jsonify(msg="Existing link is missing a mandatory version. Data inconsistency."), 500
        final_version_id_for_db = link_item['version_id'] # Fallback to current if no new one specified
        # A better check: if (software_id_str OR typed_version_string OR provided_version_id_str) suggests intent to change version
        # If intent to change, but none validly resolved, that's an error.
        # If no intent to change version (those fields are absent/empty), then using existing is fine.
        # The frontend logic is key here: does it always send some form of version data if version field is touched?

    if final_version_id_for_db is None: # Double check after all logic
        return jsonify(msg="A valid version association is mandatory for this link."), 400


    if not link_item['is_external_link'] and link_item['stored_filename']:
        _delete_file_if_exists(os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename']))

    try:
        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = TRUE, stored_filename = NULL, original_filename_ref = NULL,
            file_size = NULL, file_type = NULL, updated_by_user_id = ?
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, url, current_user_id, link_id_from_url))
        db.commit()
        updated_item = db.execute("SELECT l.*, s.name as software_name, v.version_number as version_name FROM links l JOIN software s ON l.software_id = s.id JOIN versions v ON l.version_id = v.id WHERE l.id = ?", (link_id_from_url,)).fetchone()
        return jsonify(dict(updated_item) if updated_item else None), 200
    except sqlite3.IntegrityError as e: db.rollback(); return jsonify(msg=f"DB error: {e}"), 409
    except Exception as e: db.rollback(); return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/links/<int:link_id_from_url>/edit_file', methods=['PUT']) # Renamed link_id
@jwt_required()
@admin_required
def admin_edit_link_file(link_id_from_url):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id_from_url,)).fetchone()
    if not link_item: return jsonify(msg="Link not found"), 404

    new_physical_file = request.files.get('file')
    software_id_str = request.form.get('software_id', str(link_item['software_id']))
    provided_version_id_str = request.form.get('version_id')
    typed_version_string = request.form.get('typed_version_string')

    title = request.form.get('title', link_item['title'])
    description = request.form.get('description', link_item['description'])

    if not software_id_str or not title:
        return jsonify(msg="Software ID and title are required for edit."), 400
    try:
        software_id_for_link = int(software_id_str)
    except ValueError: return jsonify(msg="Invalid software_id format for link."), 400

    final_version_id_for_db = None # Placeholder
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id_for_db = int(provided_version_id_str)
        except ValueError: return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        resolved_id = get_or_create_version_id(db, software_id_for_link, typed_version_string, current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}' for software ID {software_id_for_link}."), 500
        final_version_id_for_db = resolved_id
    else: # Fallback to existing if version is mandatory and no new one is specified
        final_version_id_for_db = link_item['version_id']


    if final_version_id_for_db is None: # If after all logic, version_id is still None, and it's mandatory
        return jsonify(msg="A valid version association is mandatory for this link."), 400
            
    # ... (File handling logic from your previous admin_edit_link_file) ...
    # ... (Make sure to use software_id_for_link and final_version_id_for_db in the UPDATE) ...
    new_stored_filename = link_item['stored_filename']
    new_original_filename = link_item['original_filename_ref']
    new_file_size = link_item['file_size']
    new_file_type = link_item['file_type']
    new_url = link_item['url'] # This becomes server path if file uploaded
    file_save_path = None

    if new_physical_file and new_physical_file.filename != '':
        # ... (file saving and old file deletion logic as before) ...
        if not allowed_file(new_physical_file.filename): return jsonify(msg="File type not allowed"), 400
        if not link_item['is_external_link'] and link_item['stored_filename']:
            _delete_file_if_exists(os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename']))
        
        original_filename = secure_filename(new_physical_file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        new_stored_filename = f"{uuid.uuid4().hex}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], new_stored_filename)
        try:
            new_physical_file.save(file_save_path)
            new_file_size = os.path.getsize(file_save_path)
            new_file_type = new_physical_file.mimetype
            new_original_filename = original_filename
            new_url = f"/official_uploads/links/{new_stored_filename}"
        except Exception as e: return jsonify(msg=f"Error saving new file: {e}"), 500
    elif link_item['is_external_link'] and not new_physical_file : # Switching from URL to File, new file is mandatory
        return jsonify(msg="To change from URL to File, a file must be uploaded."), 400
    # If it's already a file link and no new file is provided, metadata only update is fine.

    try:
        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = FALSE, stored_filename = ?, original_filename_ref = ?,
            file_size = ?, file_type = ?, updated_by_user_id = ?
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, new_url, new_stored_filename,
             new_original_filename, new_file_size, new_file_type, current_user_id, link_id_from_url))
        db.commit()
        # Fetch back with JOINs
        updated_item = db.execute("SELECT l.*, s.name as software_name, v.version_number as version_name FROM links l JOIN software s ON l.software_id = s.id JOIN versions v ON l.version_id = v.id WHERE l.id = ?", (link_id_from_url,)).fetchone()
        return jsonify(dict(updated_item) if updated_item else None), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path): _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"DB error: {e}"), 409
    except Exception as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path): _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"Server error: {e}"), 500

@app.route('/api/admin/links/<int:link_id>/delete', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_link(link_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT id, stored_filename, is_external_link FROM links WHERE id = ?", (link_id,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    if not link_item['is_external_link'] and link_item['stored_filename']:
        file_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename'])
        _delete_file_if_exists(file_path)

    try:
        db.execute("DELETE FROM links WHERE id = ?", (link_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted link ID {link_id}")
        return jsonify(msg="Link deleted successfully"), 200
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Error deleting link ID {link_id}: {e}")
        return jsonify(msg=f"Database error while deleting link: {e}"), 500
@app.route('/api/admin/misc_categories/<int:category_id>/edit', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_misc_category(category_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    category = db.execute("SELECT * FROM misc_categories WHERE id = ?", (category_id,)).fetchone()
    if not category:
        return jsonify(msg="Misc category not found"), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    name = data.get('name', category['name']).strip()
    description = data.get('description', category['description']) # Can be None or empty

    if not name:
        return jsonify(msg="Category name cannot be empty"), 400

    try:
        db.execute("""
            UPDATE misc_categories
            SET name = ?, description = ?, updated_by_user_id = ?
            WHERE id = ?
        """, (name, description, current_user_id, category_id))
        db.commit()
        updated_category = db.execute("SELECT * FROM misc_categories WHERE id = ?", (category_id,)).fetchone()
        return jsonify(dict(updated_category)), 200
    except sqlite3.IntegrityError as e: # Likely unique constraint on name
        db.rollback()
        return jsonify(msg=f"Database error: Category name '{name}' might already exist. {e}"), 409
    except Exception as e:
        db.rollback()
        return jsonify(msg=f"Server error: {e}"), 500

@app.route('/api/admin/misc_categories/<int:category_id>/delete', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_misc_category(category_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    category = db.execute("SELECT id FROM misc_categories WHERE id = ?", (category_id,)).fetchone()
    if not category:
        return jsonify(msg="Misc category not found"), 404

    # Check if there are any misc_files associated with this category
    files_in_category = db.execute("SELECT COUNT(*) as count FROM misc_files WHERE misc_category_id = ?", (category_id,)).fetchone()
    if files_in_category and files_in_category['count'] > 0:
        return jsonify(msg=f"Cannot delete category: {files_in_category['count']} file(s) still exist in it. Please delete or move them first."), 409 # 409 Conflict

    try:
        db.execute("DELETE FROM misc_categories WHERE id = ?", (category_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted misc category ID {category_id}")
        return jsonify(msg="Misc category deleted successfully"), 200
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Error deleting misc category ID {category_id}: {e}")
        return jsonify(msg=f"Database error while deleting misc category: {e}"), 500

@app.route('/api/admin/misc_files/<int:file_id>/edit', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_misc_file(file_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    misc_file_item = db.execute("SELECT * FROM misc_files WHERE id = ?", (file_id,)).fetchone()
    if not misc_file_item:
        return jsonify(msg="Misc file not found"), 404

    new_physical_file = request.files.get('file') # Optional: user might be uploading a new version of the file

    # Form data for metadata
    misc_category_id_str = request.form.get('misc_category_id', str(misc_file_item['misc_category_id']))
    user_provided_title = request.form.get('user_provided_title', misc_file_item['user_provided_title'])
    user_provided_description = request.form.get('user_provided_description', misc_file_item['user_provided_description'])

    if not misc_category_id_str: # Category is mandatory
        return jsonify(msg="Misc category ID is required"), 400
    
    try:
        misc_category_id = int(misc_category_id_str)
    except ValueError:
        return jsonify(msg="Invalid misc_category_id format"), 400

    # Initialize with old values, update if new physical file is processed
    new_stored_filename = misc_file_item['stored_filename']
    new_original_filename = misc_file_item['original_filename'] # In misc_files, original_filename is stored directly
    new_file_path = misc_file_item['file_path']
    new_file_size = misc_file_item['file_size']
    new_file_type = misc_file_item['file_type']
    
    # Path for potentially newly saved file (for cleanup on error)
    current_file_save_path = None 

    if new_physical_file and new_physical_file.filename != '':
        if not allowed_file(new_physical_file.filename):
            return jsonify(msg="New file type not allowed"), 400

        # Delete old physical file
        old_physical_file_path = os.path.join(app.config['MISC_UPLOAD_FOLDER'], misc_file_item['stored_filename'])
        _delete_file_if_exists(old_physical_file_path)
        
        original_fn = secure_filename(new_physical_file.filename)
        ext = original_fn.rsplit('.', 1)[1].lower() if '.' in original_fn else ''
        stored_fn_base = uuid.uuid4().hex
        new_stored_filename = f"{stored_fn_base}{'.' + ext if ext else ''}"
        current_file_save_path = os.path.join(app.config['MISC_UPLOAD_FOLDER'], new_stored_filename)
        
        try:
            new_physical_file.save(current_file_save_path)
            new_file_size = os.path.getsize(current_file_save_path)
            new_file_type = new_physical_file.mimetype
            new_original_filename = original_fn # Update original filename if new file
            new_file_path = f"/misc_uploads/{new_stored_filename}"
        except Exception as e:
            app.logger.error(f"Error saving new misc_file physical file during edit: {e}")
            return jsonify(msg=f"Error saving new physical file: {e}"), 500
    
    # Ensure title defaults to original filename if not provided and new file is uploaded
    # or if title was empty and original filename changed due to new upload.
    if not user_provided_title and new_original_filename:
        user_provided_title = new_original_filename


    try:
        db.execute("""
            UPDATE misc_files
            SET misc_category_id = ?, user_provided_title = ?, user_provided_description = ?,
                original_filename = ?, stored_filename = ?, file_path = ?,
                file_type = ?, file_size = ?, updated_by_user_id = ?
            WHERE id = ?
        """, (misc_category_id, user_provided_title, user_provided_description,
              new_original_filename, new_stored_filename, new_file_path,
              new_file_type, new_file_size, current_user_id, file_id))
        db.commit()

        updated_file = db.execute("""
            SELECT mf.*, mc.name as category_name
            FROM misc_files mf
            JOIN misc_categories mc ON mf.misc_category_id = mc.id
            WHERE mf.id = ?
        """, (file_id,)).fetchone()
        return jsonify(dict(updated_file)), 200
    except sqlite3.IntegrityError as e: # e.g., unique constraint on (misc_category_id, user_provided_title) or (misc_category_id, original_filename)
        db.rollback()
        if current_file_save_path and os.path.exists(current_file_save_path): 
            _delete_file_if_exists(current_file_save_path)
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        if current_file_save_path and os.path.exists(current_file_save_path): 
            _delete_file_if_exists(current_file_save_path)
        return jsonify(msg=f"Server error: {e}"), 500

@app.route('/api/admin/misc_files/<int:file_id>/delete', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_misc_file(file_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    misc_file_item = db.execute("SELECT id, stored_filename FROM misc_files WHERE id = ?", (file_id,)).fetchone()
    if not misc_file_item:
        return jsonify(msg="Misc file not found"), 404

    # Delete the physical file from MISC_UPLOAD_FOLDER
    physical_file_path = os.path.join(app.config['MISC_UPLOAD_FOLDER'], misc_file_item['stored_filename'])
    _delete_file_if_exists(physical_file_path)

    try:
        db.execute("DELETE FROM misc_files WHERE id = ?", (file_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted misc file ID {file_id} (physical file: {misc_file_item['stored_filename']})")
        return jsonify(msg="Misc file deleted successfully"), 200
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Error deleting misc file ID {file_id}: {e}")
        return jsonify(msg=f"Database error while deleting misc file: {e}"), 500

# --- Misc File Upload ---
@app.route('/api/admin/misc_files/upload', methods=['POST'])
@jwt_required() 
@admin_required
def admin_upload_misc_file():
    sql_query = """INSERT INTO misc_files (misc_category_id, user_id, user_provided_title, user_provided_description,
                                        original_filename, stored_filename, file_path, file_type, file_size,
                                        created_by_user_id, updated_by_user_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""" # 11 params
    sql_params_order = ('misc_category_id', 'user_id', 'user_provided_title', 'user_provided_description',
                        'original_filename', 'stored_filename', 'download_link_or_url', 'file_type', 'file_size',
                        'created_by_user_id', 'updated_by_user_id')

    # Note: 'user_provided_title' and 'user_provided_description' come from request.form
    # 'download_link_or_url' in the tuple maps to 'file_path' in the table for misc_files
    # Need to ensure form field names match what _admin_handle_file_upload_and_db_insert expects
    # e.g. frontend sends 'user_provided_title' and 'user_provided_description' for misc files.

    return _admin_handle_file_upload_and_db_insert(
        table_name='misc_files', upload_folder_config_key='MISC_UPLOAD_FOLDER', server_path_prefix='/misc_uploads',
        metadata_fields=['misc_category_id', 'user_provided_title', 'user_provided_description'], # These are form field names
        required_form_fields=['misc_category_id', 'file'], # 'file' implies file is present
        sql_insert_query=sql_query,
        sql_params_tuple=sql_params_order
    )

#ADMIN
# app.py

@app.route('/api/admin/links/add_with_url', methods=['POST'])
@jwt_required()
@admin_required
def admin_add_link_with_url():
    current_user_id = int(get_jwt_identity())
    db = get_db()
    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400

    software_id_str = data.get('software_id')
    provided_version_id_str = data.get('version_id')
    typed_version_string = data.get('typed_version_string')

    if not software_id_str:
        return jsonify(msg="software_id is required"), 400
    try:
        software_id = int(software_id_str)
    except ValueError:
        return jsonify(msg="Invalid software_id format"), 400

    final_version_id_for_db = None
    if provided_version_id_str and provided_version_id_str.strip():
        try:
            final_version_id_for_db = int(provided_version_id_str)
            # Optional: Verify version belongs to software
            # if not db.execute("SELECT id FROM versions WHERE id = ? AND software_id = ?", (final_version_id_for_db, software_id)).fetchone():
            #     return jsonify(msg="Selected version does not belong to the specified software."), 400
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id."), 400
    elif typed_version_string and typed_version_string.strip():
        final_version_id_for_db = get_or_create_version_id(db, software_id, typed_version_string, current_user_id)
        if final_version_id_for_db is None:
            return jsonify(msg=f"Failed to find or create version '{typed_version_string}' for software ID {software_id}."), 500
    else:
        # If version is mandatory, this is an error
        return jsonify(msg="A version (either selected ID or typed string) is mandatory for links."), 400
    
    data['version_id'] = final_version_id_for_db
    data.pop('typed_version_string', None)
    # software_id is still needed for the links table directly.

    return _admin_add_item_with_external_link(
        table_name='links',
        data=data,
        required_fields=['software_id', 'version_id', 'title', 'url'], # version_id now effectively required
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""",
        sql_params_tuple=(
            'software_id', 'version_id', 'title', 'url', 'description',
            'created_by_user_id', 'updated_by_user_id' # is_external_link removed from tuple (hardcoded)
        )
    )

# --- File Serving Endpoints ---
@app.route('/official_uploads/docs/<path:filename>')
def serve_official_doc_file(filename):
    return send_from_directory(app.config['DOC_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/official_uploads/patches/<path:filename>')
def serve_official_patch_file(filename):
    return send_from_directory(app.config['PATCH_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/official_uploads/links/<path:filename>') # For files uploaded as "Links"
def serve_official_link_file(filename):
    return send_from_directory(app.config['LINK_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/misc_uploads/<path:filename>')
def serve_misc_file(filename):
    return send_from_directory(app.config['MISC_UPLOAD_FOLDER'], filename, as_attachment=True)

# --- Search API (Keep as is, or enhance later) ---
@app.route('/api/search', methods=['GET'])
def search_api():
    # ... (your existing search logic)
    query = request.args.get('q', '')
    if not query: return jsonify({"error": "Search query parameter 'q' is required."}), 400
    results = []
    # TODO: Implement actual search across relevant tables
    return jsonify(results)

# --- CLI Command ---
@app.cli.command('init-db')
def init_db_command():
    database.init_db(app.config['DATABASE']) # Pass DB path to init_db
    print('Initialized the database.')

# --- Main Execution ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)