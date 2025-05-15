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

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'zip', 'exe', 'msi', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'}

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
def _admin_handle_file_upload_and_db_insert(
    table_name, upload_folder_config_key, server_path_prefix,
    metadata_fields, required_form_fields, sql_insert_query, sql_params_tuple
):
    current_user_id = int(get_jwt_identity()) # Assumes already string from token

    if 'file' not in request.files: return jsonify(msg="No file part"), 400
    file = request.files['file']
    if file.filename == '': return jsonify(msg="No selected file"), 400

    form_data = {}
    for field in metadata_fields: # e.g., ['software_id', 'doc_name', 'description', 'doc_type']
        form_data[field] = request.form.get(field)
    
    for req_field in required_form_fields: # e.g., ['software_id', 'doc_name_or_file']
        # Special handling if doc_name can default to filename
        if req_field == 'doc_name_or_file' and not form_data.get(metadata_fields[1]) and not file.filename: # Assuming metadata_fields[1] is doc_name
            return jsonify(msg=f"Missing required field: {metadata_fields[1]} (or provide a file with a name)"), 400
        elif req_field != 'doc_name_or_file' and not form_data.get(req_field):
            return jsonify(msg=f"Missing required metadata: {req_field}"), 400
    
    # Convert IDs if necessary (example for software_id)
    if 'software_id' in form_data and form_data['software_id']:
        try:
            form_data['software_id'] = int(form_data['software_id'])
        except ValueError: return jsonify(msg="Invalid software_id format"), 400
    if 'version_id' in form_data and form_data['version_id']: # For patches, links
        try:
            form_data['version_id'] = int(form_data['version_id'])
        except ValueError: return jsonify(msg="Invalid version_id format"), 400
    if 'misc_category_id' in form_data and form_data['misc_category_id']: # For misc_files
        try:
            form_data['misc_category_id'] = int(form_data['misc_category_id'])
        except ValueError: return jsonify(msg="Invalid misc_category_id format"), 400


    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename if file.filename is not None else "unnamed_file")
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        stored_filename = f"{uuid.uuid4().hex}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config[upload_folder_config_key], stored_filename)
        download_link_or_path = f"{server_path_prefix}/{stored_filename}"

        try:
            file.save(file_save_path)
            file_size = os.path.getsize(file_save_path)

            # Construct params for SQL, ensure order matches sql_insert_query
            # This part needs to be flexible based on the sql_params_tuple definition
            # Example, this is pseudocode, needs actual implementation based on sql_params_tuple structure
            final_sql_params = []
            for param_name in sql_params_tuple:
                if param_name == 'download_link_or_url': final_sql_params.append(download_link_or_path)
                elif param_name == 'is_external_link': final_sql_params.append(False)
                elif param_name == 'stored_filename': final_sql_params.append(stored_filename)
                elif param_name == 'original_filename_ref': final_sql_params.append(original_filename)
                elif param_name == 'file_size': final_sql_params.append(file_size)
                elif param_name == 'file_type': final_sql_params.append(file.mimetype)
                elif param_name == 'created_by_user_id': final_sql_params.append(current_user_id)
                elif param_name == 'updated_by_user_id': final_sql_params.append(current_user_id)
                elif param_name == 'user_id': final_sql_params.append(current_user_id) # for misc_files
                elif param_name in form_data: final_sql_params.append(form_data[param_name])
                else: final_sql_params.append(None) # Default for missing optional params

            db = get_db()
            cursor = db.execute(sql_insert_query, tuple(final_sql_params))
            db.commit()
            new_id = cursor.lastrowid
            
            new_item_cursor = db.execute(f"SELECT * FROM {table_name} WHERE id = ?", (new_id,))
            new_item = dict(new_item_cursor.fetchone()) if new_item_cursor.rowcount > 0 else None
            if new_item: return jsonify(new_item), 201
            app.logger.error(f"Failed to retrieve newly uploaded item from {table_name}, ID: {new_id}")
            return jsonify(msg=f"Item uploaded but metadata retrieval failed for {table_name}"), 500
        except sqlite3.IntegrityError as e:
            if os.path.exists(file_save_path): os.remove(file_save_path)
            app.logger.error(f"Admin upload for {table_name} DB IntegrityError: {e}")
            return jsonify(msg=f"Database error: {e}"), 409
        except Exception as e:
            if os.path.exists(file_save_path): os.remove(file_save_path)
            app.logger.error(f"Admin upload for {table_name} Exception: {e}")
            return jsonify(msg=f"Server error during file upload: {e}"), 500
    return jsonify(msg="File type not allowed or invalid file"), 400


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
@app.route('/api/admin/patches/add_with_url', methods=['POST'])
@jwt_required()
@admin_required
def admin_add_patch_with_url():
    return _admin_add_item_with_external_link(
        table_name='patches',
        data=request.get_json(),
        required_fields=['version_id', 'patch_name', 'download_link'],
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date,
                                             is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""", # Note: TRUE for is_external_link
        sql_params_tuple=( # Order must match VALUES clause
            'version_id', 'patch_name', 'download_link', 'description', 'release_date',
            'is_external_link', 'created_by_user_id', 'updated_by_user_id'
        )
    )

@app.route('/api/admin/patches/upload_file', methods=['POST'])
@jwt_required()
@admin_required
def admin_upload_patch_file():
    return _admin_handle_file_upload_and_db_insert(
        table_name='patches',
        upload_folder_config_key='PATCH_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/patches', # Used to construct download_link for DB
        metadata_fields=['version_id', 'patch_name', 'description', 'release_date'], # Form fields expected
        required_form_fields=['version_id', 'patch_name'], # 'patch_name' or file if it defaults
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date,
                                             is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                             created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""", # Note: FALSE for is_external_link
        sql_params_tuple=( # Order must match VALUES clause
            'version_id', 'patch_name', 'download_link_or_url', 'description', 'release_date',
            'is_external_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
            'created_by_user_id', 'updated_by_user_id'
        )
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


@app.route('/api/admin/links/upload_file', methods=['POST'])
@jwt_required()
@admin_required
def admin_upload_link_file():
    return _admin_handle_file_upload_and_db_insert(
        table_name='links',
        upload_folder_config_key='LINK_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/links', # Or just /link_uploads/
        metadata_fields=['software_id', 'version_id', 'title', 'description'],
        required_form_fields=['software_id', 'title'], # title or file if it defaults
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                           created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""",
        sql_params_tuple=(
            'software_id', 'version_id', 'title', 'download_link_or_url', 'description',
            'is_external_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
            'created_by_user_id', 'updated_by_user_id'
        )
    )

@app.route('/api/admin/patches/<int:patch_id>/edit_url', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_patch_url(patch_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT * FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch:
        return jsonify(msg="Patch not found"), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    # Fields: version_id, patch_name, description, release_date, download_link (external)
    version_id_str = data.get('version_id', str(patch['version_id']))
    patch_name = data.get('patch_name', patch['patch_name'])
    description = data.get('description', patch['description'])
    release_date = data.get('release_date', patch['release_date']) # Ensure frontend sends YYYY-MM-DD
    download_link = data.get('download_link', patch['download_link'])

    if not version_id_str or not patch_name or not download_link:
        return jsonify(msg="Version, patch name, and download link are required"), 400
    
    try:
        version_id = int(version_id_str)
    except (ValueError, TypeError):
        return jsonify(msg="Invalid version_id format"), 400

    # If it was a file and becomes a URL
    if not patch['is_external_link'] and patch['stored_filename']:
        old_file_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename'])
        _delete_file_if_exists(old_file_path)

    try:
        db.execute("""
            UPDATE patches
            SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
                download_link = ?, is_external_link = TRUE, stored_filename = NULL,
                original_filename_ref = NULL, file_size = NULL, file_type = NULL,
                updated_by_user_id = ?
            WHERE id = ?
        """, (version_id, patch_name, description, release_date, download_link,
              current_user_id, patch_id))
        db.commit()
        # Fetch with joins for frontend convenience
        updated_patch = db.execute("""
            SELECT p.*, s.name as software_name, v.version_number
            FROM patches p
            JOIN versions v ON p.version_id = v.id
            JOIN software s ON v.software_id = s.id
            WHERE p.id = ?
        """, (patch_id,)).fetchone()
        return jsonify(dict(updated_patch)), 200
    except sqlite3.IntegrityError as e: # e.g. version_id doesn't exist, or unique constraint on (version_id, patch_name)
        db.rollback()
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        return jsonify(msg=f"Server error: {e}"), 500


@app.route('/api/admin/patches/<int:patch_id>/edit_file', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_patch_file(patch_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT * FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch:
        return jsonify(msg="Patch not found"), 404

    new_file = request.files.get('file')
    
    # Form data
    version_id_str = request.form.get('version_id', str(patch['version_id']))
    patch_name = request.form.get('patch_name', patch['patch_name'])
    description = request.form.get('description', patch['description'])
    release_date = request.form.get('release_date', patch['release_date'])

    if not version_id_str or not patch_name:
        return jsonify(msg="Version and patch name are required"), 400
    try:
        version_id = int(version_id_str)
    except ValueError:
        return jsonify(msg="Invalid version_id format"), 400
        
    # Initialize with old values, update if new file is processed
    new_stored_filename = patch['stored_filename']
    new_original_filename = patch['original_filename_ref']
    new_file_size = patch['file_size']
    new_file_type = patch['file_type']
    new_download_link = patch['download_link']

    file_save_path = None # To ensure it's defined for cleanup in except block

    if new_file and new_file.filename != '':
        if not allowed_file(new_file.filename):
            return jsonify(msg="File type not allowed"), 400

        if not patch['is_external_link'] and patch['stored_filename']:
            old_file_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename'])
            _delete_file_if_exists(old_file_path)
        
        original_filename = secure_filename(new_file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        stored_filename_base = uuid.uuid4().hex
        new_stored_filename = f"{stored_filename_base}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], new_stored_filename)
        
        try:
            new_file.save(file_save_path)
            new_file_size = os.path.getsize(file_save_path)
            new_file_type = new_file.mimetype
            new_original_filename = original_filename
            new_download_link = f"/official_uploads/patches/{new_stored_filename}"
        except Exception as e:
            app.logger.error(f"Error saving new patch file during edit: {e}")
            return jsonify(msg=f"Error saving new file: {e}"), 500
    elif patch['is_external_link'] and not new_file : # Was URL, trying to edit as file, but no file provided
        return jsonify(msg="To change from URL to File, a file must be uploaded."), 400

    try:
        db.execute("""
            UPDATE patches
            SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
                download_link = ?, is_external_link = FALSE, stored_filename = ?,
                original_filename_ref = ?, file_size = ?, file_type = ?,
                updated_by_user_id = ?
            WHERE id = ?
        """, (version_id, patch_name, description, release_date,
              new_download_link, new_stored_filename, new_original_filename,
              new_file_size, new_file_type, current_user_id, patch_id))
        db.commit()
        updated_patch = db.execute("""
            SELECT p.*, s.name as software_name, v.version_number
            FROM patches p
            JOIN versions v ON p.version_id = v.id
            JOIN software s ON v.software_id = s.id
            WHERE p.id = ?
        """, (patch_id,)).fetchone()
        return jsonify(dict(updated_patch)), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path): _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path): _delete_file_if_exists(file_save_path)
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


@app.route('/api/admin/links/<int:link_id>/edit_url', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_link_url(link_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    # Fields: software_id, version_id (optional), title, description, url (external)
    software_id_str = data.get('software_id', str(link_item['software_id']))
    version_id_str = data.get('version_id', str(link_item['version_id']) if link_item['version_id'] is not None else None)
    title = data.get('title', link_item['title'])
    description = data.get('description', link_item['description'])
    url = data.get('url', link_item['url']) # This is the external URL

    if not software_id_str or not title or not url:
        return jsonify(msg="Software, title, and URL are required"), 400

    try:
        software_id = int(software_id_str)
        version_id = int(version_id_str) if version_id_str and version_id_str.lower() != 'null' else None
    except (ValueError, TypeError):
        return jsonify(msg="Invalid software_id or version_id format"), 400

    if not link_item['is_external_link'] and link_item['stored_filename']:
        old_file_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename'])
        _delete_file_if_exists(old_file_path)

    try:
        db.execute("""
            UPDATE links
            SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
                is_external_link = TRUE, stored_filename = NULL, original_filename_ref = NULL,
                file_size = NULL, file_type = NULL, updated_by_user_id = ?
            WHERE id = ?
        """, (software_id, version_id, title, description, url, current_user_id, link_id))
        db.commit()
        updated_link = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number as version_name
            FROM links l
            JOIN software s ON l.software_id = s.id
            LEFT JOIN versions v ON l.version_id = v.id
            WHERE l.id = ?
        """, (link_id,)).fetchone()
        return jsonify(dict(updated_link) if updated_link else None), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        return jsonify(msg=f"Database error: {e}"), 409
    except Exception as e:
        db.rollback()
        return jsonify(msg=f"Server error: {e}"), 500

@app.route('/api/admin/links/<int:link_id>/edit_file', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_link_file(link_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    new_file = request.files.get('file')

    # Form data
    software_id_str = request.form.get('software_id', str(link_item['software_id']))
    version_id_str = request.form.get('version_id', str(link_item['version_id']) if link_item['version_id'] is not None else None)
    title = request.form.get('title', link_item['title'])
    description = request.form.get('description', link_item['description'])

    if not software_id_str or not title:
        return jsonify(msg="Software and title are required"), 400
    
    try:
        software_id = int(software_id_str)
        version_id = int(version_id_str) if version_id_str and version_id_str.lower() != 'null' and version_id_str != '' else None
    except ValueError:
        return jsonify(msg="Invalid software_id or version_id format"), 400
        
    new_stored_filename = link_item['stored_filename']
    new_original_filename = link_item['original_filename_ref']
    new_file_size = link_item['file_size']
    new_file_type = link_item['file_type']
    new_url = link_item['url'] # This will be server path for uploaded file

    file_save_path = None

    if new_file and new_file.filename != '':
        if not allowed_file(new_file.filename):
            return jsonify(msg="File type not allowed"), 400

        if not link_item['is_external_link'] and link_item['stored_filename']:
            old_file_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename'])
            _delete_file_if_exists(old_file_path)
        
        original_filename = secure_filename(new_file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        stored_filename_base = uuid.uuid4().hex
        new_stored_filename = f"{stored_filename_base}{'.' + ext if ext else ''}"
        file_save_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], new_stored_filename)
        
        try:
            new_file.save(file_save_path)
            new_file_size = os.path.getsize(file_save_path)
            new_file_type = new_file.mimetype
            new_original_filename = original_filename
            new_url = f"/official_uploads/links/{new_stored_filename}" # Server path for this file
        except Exception as e:
            app.logger.error(f"Error saving new link file during edit: {e}")
            return jsonify(msg=f"Error saving new file: {e}"), 500
    elif link_item['is_external_link'] and not new_file :
        return jsonify(msg="To change from URL to File, a file must be uploaded."), 400

    try:
        db.execute("""
            UPDATE links
            SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
                is_external_link = FALSE, stored_filename = ?, original_filename_ref = ?,
                file_size = ?, file_type = ?, updated_by_user_id = ?
            WHERE id = ?
        """, (software_id, version_id, title, description, new_url,
              new_stored_filename, new_original_filename, new_file_size, new_file_type,
              current_user_id, link_id))
        db.commit()
        updated_link = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number as version_name
            FROM links l
            JOIN software s ON l.software_id = s.id
            LEFT JOIN versions v ON l.version_id = v.id
            WHERE l.id = ?
        """, (link_id,)).fetchone()
        return jsonify(dict(updated_link) if updated_link else None), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        if file_save_path and os.path.exists(file_save_path): _delete_file_if_exists(file_save_path)
        return jsonify(msg=f"Database error: {e}"), 409
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
                        'original_filename_ref', 'stored_filename', 'download_link_or_url', 'file_type', 'file_size',
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
@app.route('/api/admin/links/add_with_url', methods=['POST'])
@jwt_required()
@admin_required
def admin_add_link_with_url():
    return _admin_add_item_with_external_link(
        table_name='links',
        data=request.get_json(),
        required_fields=['software_id', 'title', 'url'], # version_id is optional for links
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""",
        sql_params_tuple=(
            'software_id', 'version_id', 'title', 'url', 'description',
            'is_external_link', 'created_by_user_id', 'updated_by_user_id'
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