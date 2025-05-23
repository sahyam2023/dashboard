# app.py
import os
import uuid
import sqlite3
import math # Added for math.ceil
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
    return get_db().execute("SELECT id, username, password_hash, email, role, is_active, created_at FROM users WHERE id = ?", (user_id,)).fetchone()

def find_user_by_username(username):
    return get_db().execute("SELECT id, username, password_hash, email, role, is_active, created_at FROM users WHERE username = ?", (username,)).fetchone()

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
            if not user or user['role'] not in ['admin', 'super_admin']: # Modified line
                return jsonify(msg="Administration rights required."), 403
        except ValueError:
             return jsonify(msg="Invalid user identity in token."), 400
        return fn(*args, **kwargs)
    return wrapper

# --- Super Admin Authorization Decorator ---
def super_admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        current_user_id_str = get_jwt_identity()
        try:
            user = find_user_by_id(int(current_user_id_str))
            if not user or user['role'] != 'super_admin':
                return jsonify(msg="Super administration rights required."), 403
        except ValueError:
             return jsonify(msg="Invalid user identity in token."), 400
        return fn(*args, **kwargs)
    return wrapper

# --- Super Admin User Management Endpoints ---
@app.route('/api/superadmin/users', methods=['GET'])
@jwt_required()
@super_admin_required
def list_users():
    db = get_db()

    # Get and validate query parameters
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    sort_by = request.args.get('sort_by', default='username', type=str)
    sort_order = request.args.get('sort_order', default='asc', type=str).lower()

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    allowed_sort_by = ['id', 'username', 'email', 'role', 'is_active', 'created_at']
    if sort_by not in allowed_sort_by:
        sort_by = 'username' # Default or return 400
        # return jsonify(msg=f"Invalid sort_by parameter. Allowed values: {', '.join(allowed_sort_by)}"), 400
        
    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc' # Default or return 400
        # return jsonify(msg="Invalid sort_order parameter. Allowed values: 'asc', 'desc'."), 400

    # Database Query for Total Count
    try:
        total_users_cursor = db.execute("SELECT COUNT(*) as count FROM users")
        total_users = total_users_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total user count: {e}")
        return jsonify(msg="Error fetching user count."), 500

    # Calculate Pagination Details
    total_pages = math.ceil(total_users / per_page) if total_users > 0 else 1
    offset = (page - 1) * per_page

    # Ensure page is not out of bounds
    if page > total_pages and total_users > 0 : # if total_users is 0, page will be 1, total_pages will be 1
        page = total_pages
        offset = (page - 1) * per_page


    # Database Query for Paginated Users
    # Ensure sort_by is safe before injecting into the query string
    # The allowlist check above makes it safe.
    query_string = f"SELECT id, username, email, role, is_active, created_at FROM users ORDER BY {sort_by} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        users_cursor = db.execute(query_string, (per_page, offset))
        users_list = [dict(row) for row in users_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated users: {e}")
        return jsonify(msg="Error fetching users."), 500

    return jsonify({
        "users": users_list,
        "page": page,
        "per_page": per_page,
        "total_users": total_users,
        "total_pages": total_pages
    }), 200

@app.route('/api/superadmin/users/<int:user_id>/role', methods=['PUT'])
@jwt_required()
@super_admin_required
def change_user_role(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)
    if not target_user:
        return jsonify(msg="User not found."), 404

    data = request.get_json()
    if not data or 'new_role' not in data:
        return jsonify(msg="Missing new_role in request data."), 400
    
    new_role = data['new_role']
    valid_roles = ['user', 'admin', 'super_admin']
    if new_role not in valid_roles:
        return jsonify(msg=f"Invalid role. Must be one of: {', '.join(valid_roles)}."), 400

    current_super_admin_id_str = get_jwt_identity()
    current_super_admin_id = int(current_super_admin_id_str)

    if user_id == current_super_admin_id and new_role != 'super_admin':
        # Self-demotion check
        super_admin_count_cursor = db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'")
        super_admin_count = super_admin_count_cursor.fetchone()['count']
        if super_admin_count <= 1:
            return jsonify(msg="Cannot demote the only super admin."), 400
    
    try:
        db.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        db.commit()
        updated_user = find_user_by_id(user_id) # Re-fetch to get the latest data
        return jsonify(id=updated_user['id'], username=updated_user['username'], email=updated_user['email'], role=updated_user['role'], is_active=updated_user['is_active']), 200
    except Exception as e:
        app.logger.error(f"Error changing role for user {user_id}: {e}")
        db.rollback()
        return jsonify(msg="Failed to change user role due to a server error."), 500

@app.route('/api/superadmin/users/<int:user_id>/deactivate', methods=['PUT'])
@jwt_required()
@super_admin_required
def deactivate_user(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)
    if not target_user:
        return jsonify(msg="User not found."), 404

    current_super_admin_id_str = get_jwt_identity()
    current_super_admin_id = int(current_super_admin_id_str)

    if user_id == current_super_admin_id:
        # Self-deactivation check
        active_super_admin_count_cursor = db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND is_active = TRUE")
        active_super_admin_count = active_super_admin_count_cursor.fetchone()['count']
        if active_super_admin_count <= 1:
            return jsonify(msg="Cannot deactivate the only active super admin."), 400
    
    try:
        db.execute("UPDATE users SET is_active = FALSE WHERE id = ?", (user_id,))
        db.commit()
        updated_user = find_user_by_id(user_id)
        return jsonify(id=updated_user['id'], username=updated_user['username'], email=updated_user['email'], role=updated_user['role'], is_active=updated_user['is_active']), 200
    except Exception as e:
        app.logger.error(f"Error deactivating user {user_id}: {e}")
        db.rollback()
        return jsonify(msg="Failed to deactivate user due to a server error."), 500

@app.route('/api/superadmin/users/<int:user_id>/activate', methods=['PUT'])
@jwt_required()
@super_admin_required
def activate_user(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)
    if not target_user:
        return jsonify(msg="User not found."), 404

    # No self-activation check needed as activating oneself has no negative consequence
    # unlike deactivating or demoting the last super admin.

    try:
        db.execute("UPDATE users SET is_active = TRUE WHERE id = ?", (user_id,)) # Use TRUE for boolean
        db.commit()
        updated_user = find_user_by_id(user_id)
        app.logger.info(f"Super admin {get_jwt_identity()} activated user {user_id}.")
        return jsonify(id=updated_user['id'], username=updated_user['username'], email=updated_user['email'], role=updated_user['role'], is_active=updated_user['is_active']), 200
    except Exception as e:
        app.logger.error(f"Error activating user {user_id}: {e}")
        db.rollback()
        return jsonify(msg="Failed to activate user due to a server error."), 500

@app.route('/api/superadmin/users/<int:user_id>/delete', methods=['DELETE'])
@jwt_required()
@super_admin_required
def delete_user(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)
    if not target_user:
        return jsonify(msg="User not found."), 404

    current_super_admin_id_str = get_jwt_identity()
    current_super_admin_id = int(current_super_admin_id_str)

    if user_id == current_super_admin_id:
        # Self-deletion check (ensure there's another active super admin)
        # This logic is similar to deactivation but ensures if this is the *only* super admin
        # (active or not), they cannot delete themselves if they are the last one.
        # More strictly, if they are the last *active* one.
        active_super_admin_count_cursor = db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND is_active = TRUE")
        active_super_admin_count = active_super_admin_count_cursor.fetchone()['count']
        if active_super_admin_count <= 1 and target_user['is_active']: # If target is active and is the last active SA
             return jsonify(msg="Cannot delete the only active super admin."), 400
        # If the target is inactive, and is a super admin, allow deletion even if last SA.

    try:
        # Attempt direct deletion.
        # Note: Foreign key constraints might prevent this if the user is referenced elsewhere.
        # The schema uses ON DELETE for some FKs, but created_by_user_id typically won't have ON DELETE CASCADE.
        # This will raise sqlite3.IntegrityError if FK constraints are violated.
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
        app.logger.info(f"Super admin {current_super_admin_id} deleted user {user_id}.")
        return jsonify(msg="User deleted successfully."), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        app.logger.error(f"Error deleting user {user_id} due to foreign key constraint: {e}")
        return jsonify(msg=f"Cannot delete user: This user is referenced by other records in the database. (Error: {e})"), 409 # 409 Conflict
    except Exception as e:
        db.rollback()
        app.logger.error(f"Error deleting user {user_id}: {e}")
        return jsonify(msg="Failed to delete user due to a server error."), 500

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
        if not user['is_active']:
            return jsonify(msg="Account deactivated."), 403
        access_token = create_access_token(identity=str(user['id'])) # Ensure identity is string
        return jsonify(access_token=access_token, username=user['username'], role=user['role']), 200
    return jsonify(msg="Bad username or password"), 401

# --- User Profile Management Endpoints ---
@app.route('/api/user/profile/change-password', methods=['POST'])
@jwt_required()
def change_password():
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    user = find_user_by_id(current_user_id)
    if not user:
        return jsonify(msg="User not found."), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    current_password = data.get('current_password')
    new_password = data.get('new_password')

    if not current_password or not new_password:
        return jsonify(msg="Missing current_password or new_password"), 400

    if not bcrypt.check_password_hash(user['password_hash'], current_password):
        return jsonify(msg="Incorrect current password."), 401

    hashed_new_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    
    try:
        db = get_db()
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed_new_password, current_user_id))
        db.commit()
        return jsonify(msg="Password updated successfully."), 200
    except Exception as e:
        app.logger.error(f"Error updating password for user {current_user_id}: {e}")
        return jsonify(msg="Failed to update password due to a server error."), 500

@app.route('/api/user/profile/update-email', methods=['POST'])
@jwt_required()
def update_email():
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    user = find_user_by_id(current_user_id)
    if not user:
        return jsonify(msg="User not found."), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    new_email = data.get('new_email')
    password = data.get('password')

    if not new_email or not password:
        return jsonify(msg="Missing new_email or password"), 400
    
    new_email = new_email.strip()
    if not new_email: # Check if email is empty after stripping
        return jsonify(msg="New email cannot be empty."), 400

    if not bcrypt.check_password_hash(user['password_hash'], password):
        return jsonify(msg="Incorrect password."), 401

    existing_user_with_email = find_user_by_email(new_email)
    if existing_user_with_email and existing_user_with_email['id'] != current_user_id:
        return jsonify(msg="Email already in use."), 409
    
    try:
        db = get_db()
        db.execute("UPDATE users SET email = ? WHERE id = ?", (new_email, current_user_id))
        db.commit()
        return jsonify(msg="Email updated successfully."), 200
    except Exception as e:
        app.logger.error(f"Error updating email for user {current_user_id}: {e}")
        return jsonify(msg="Failed to update email due to a server error."), 500

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
    db = get_db()

    # Get and validate query parameters for pagination and sorting
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    sort_by_param = request.args.get('sort_by', default='doc_name', type=str)
    sort_order = request.args.get('sort_order', default='asc', type=str).lower()

    # Get existing filter parameters
    software_id_filter = request.args.get('software_id', type=int)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'd.id',
        'doc_name': 'd.doc_name',
        'software_name': 's.name', # s.name is aliased as software_name in SELECT
        'doc_type': 'd.doc_type',
        'created_at': 'd.created_at',
        'updated_at': 'd.updated_at'
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'd.doc_name') # Default to d.doc_name

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select = "SELECT d.id, d.software_id, d.doc_name, d.description, d.doc_type, d.is_external_link, d.download_link, d.stored_filename, d.original_filename_ref, d.file_size, d.file_type, d.created_by_user_id, d.created_at, d.updated_by_user_id, d.updated_at, s.name as software_name"
    base_query_from = "FROM documents d JOIN software s ON d.software_id = s.id"
    
    filter_conditions = []
    params = []

    if software_id_filter:
        filter_conditions.append("d.software_id = ?")
        params.append(software_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query = f"SELECT COUNT(d.id) as count {base_query_from}{where_clause}"
    try:
        total_documents_cursor = db.execute(count_query, tuple(params)) # Use tuple for params
        total_documents = total_documents_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total document count: {e}")
        return jsonify(msg="Error fetching document count."), 500

    # Calculate Pagination Details
    total_pages = math.ceil(total_documents / per_page) if total_documents > 0 else 1
    offset = (page - 1) * per_page

    if page > total_pages and total_documents > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Database Query for Paginated Documents
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    # Add pagination params to the list of SQL parameters
    paginated_params = list(params) # Create a copy
    paginated_params.extend([per_page, offset])
    
    try:
        documents_cursor = db.execute(final_query, tuple(paginated_params)) # Use tuple for params
        documents_list = [dict(row) for row in documents_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated documents: {e}")
        return jsonify(msg="Error fetching documents."), 500

    return jsonify({
        "documents": documents_list,
        "page": page,
        "per_page": per_page,
        "total_documents": total_documents,
        "total_pages": total_pages
    }), 200

@app.route('/api/patches', methods=['GET'])
def get_all_patches_api():
    db = get_db()

    # Get and validate query parameters for pagination and sorting
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    sort_by_param = request.args.get('sort_by', default='patch_name', type=str) # Default to patch_name
    sort_order = request.args.get('sort_order', default='asc', type=str).lower()

    # Get existing filter parameters
    software_id_filter = request.args.get('software_id', type=int)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'p.id',
        'patch_name': 'p.patch_name',
        'software_name': 's.name',
        'version_number': 'v.version_number',
        'release_date': 'p.release_date',
        'created_at': 'p.created_at',
        'updated_at': 'p.updated_at'
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'p.patch_name') # Default to p.patch_name

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select = "SELECT p.id, p.version_id, p.patch_name, p.description, p.release_date, p.is_external_link, p.download_link, p.stored_filename, p.original_filename_ref, p.file_size, p.file_type, p.created_by_user_id, p.created_at, p.updated_by_user_id, p.updated_at, s.name as software_name, s.id as software_id, v.version_number"
    base_query_from = "FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id"
    
    filter_conditions = []
    params = []

    if software_id_filter:
        filter_conditions.append("s.id = ?") # Filter by software_id from the software table
        params.append(software_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query = f"SELECT COUNT(p.id) as count {base_query_from}{where_clause}"
    try:
        total_patches_cursor = db.execute(count_query, tuple(params))
        total_patches = total_patches_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total patch count: {e}")
        return jsonify(msg="Error fetching patch count."), 500

    # Calculate Pagination Details
    total_pages = math.ceil(total_patches / per_page) if total_patches > 0 else 1
    offset = (page - 1) * per_page

    if page > total_pages and total_patches > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Database Query for Paginated Patches
    # Default sort order for patches as per original implementation if no sort_by is specified by user
    # The original was: ORDER BY s.name, v.release_date DESC, v.version_number DESC, p.patch_name
    # We will use the user-specified sort_by and sort_order. If not specified, it defaults to p.patch_name asc.
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    paginated_params = list(params)
    paginated_params.extend([per_page, offset])
    
    try:
        patches_cursor = db.execute(final_query, tuple(paginated_params))
        patches_list = [dict(row) for row in patches_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated patches: {e}")
        return jsonify(msg="Error fetching patches."), 500

    return jsonify({
        "patches": patches_list,
        "page": page,
        "per_page": per_page,
        "total_patches": total_patches,
        "total_pages": total_pages
    }), 200

@app.route('/api/links', methods=['GET'])
def get_all_links_api():
    db = get_db()

    # Get and validate query parameters for pagination and sorting
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    sort_by_param = request.args.get('sort_by', default='title', type=str) 
    sort_order = request.args.get('sort_order', default='asc', type=str).lower()

    # Get existing filter parameters
    software_id_filter = request.args.get('software_id', type=int)
    version_id_filter = request.args.get('version_id', type=int)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'l.id',
        'title': 'l.title',
        'software_name': 's.name',
        'version_name': 'v.version_number', # Note: version_name in JSON, version_number in DB for v table
        'created_at': 'l.created_at',
        'updated_at': 'l.updated_at'
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'l.title') # Default to l.title

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select = "SELECT l.id, l.title, l.description, l.software_id, l.version_id, l.is_external_link, l.url, l.stored_filename, l.original_filename_ref, l.file_size, l.file_type, l.created_by_user_id, l.created_at, l.updated_by_user_id, l.updated_at, s.name as software_name, v.version_number as version_name"
    base_query_from = "FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id"
    
    filter_conditions = []
    params = []

    if software_id_filter:
        filter_conditions.append("l.software_id = ?")
        params.append(software_id_filter)
    if version_id_filter:
        filter_conditions.append("l.version_id = ?")
        params.append(version_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query = f"SELECT COUNT(l.id) as count {base_query_from}{where_clause}"
    try:
        total_links_cursor = db.execute(count_query, tuple(params))
        total_links = total_links_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total link count: {e}")
        return jsonify(msg="Error fetching link count."), 500

    # Calculate Pagination Details
    total_pages = math.ceil(total_links / per_page) if total_links > 0 else 1
    offset = (page - 1) * per_page

    if page > total_pages and total_links > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Database Query for Paginated Links
    # Original sort: ORDER BY s.name, v.version_number, l.title
    # Now using user-defined sort or default l.title
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    paginated_params = list(params)
    paginated_params.extend([per_page, offset])
    
    try:
        links_cursor = db.execute(final_query, tuple(paginated_params))
        links_list = [dict(row) for row in links_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated links: {e}")
        return jsonify(msg="Error fetching links."), 500

    return jsonify({
        "links": links_list,
        "page": page,
        "per_page": per_page,
        "total_links": total_links,
        "total_pages": total_pages
    }), 200

@app.route('/api/misc_categories', methods=['GET'])
def get_all_misc_categories_api():
    categories = get_db().execute("SELECT id, name, description FROM misc_categories ORDER BY name").fetchall()
    return jsonify([dict(row) for row in categories])

@app.route('/api/misc_files', methods=['GET'])
def get_all_misc_files_api():
    db = get_db()

    # Get and validate query parameters for pagination and sorting
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    sort_by_param = request.args.get('sort_by', default='user_provided_title', type=str) 
    sort_order = request.args.get('sort_order', default='asc', type=str).lower()

    # Get existing filter parameters
    category_id_filter = request.args.get('category_id', type=int)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'mf.id',
        'user_provided_title': 'mf.user_provided_title',
        'original_filename': 'mf.original_filename',
        'category_name': 'mc.name', # mc.name is aliased as category_name in SELECT
        'created_at': 'mf.created_at',
        'file_size': 'mf.file_size',
        'updated_at': 'mf.updated_at' 
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'mf.user_provided_title') # Default

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select = "SELECT mf.id, mf.misc_category_id, mf.user_id, mf.user_provided_title, mf.user_provided_description, mf.original_filename, mf.stored_filename, mf.file_path, mf.file_type, mf.file_size, mf.created_by_user_id, mf.created_at, mf.updated_by_user_id, mf.updated_at, mc.name as category_name"
    base_query_from = "FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id"
    
    filter_conditions = []
    params = []

    if category_id_filter:
        filter_conditions.append("mf.misc_category_id = ?")
        params.append(category_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query = f"SELECT COUNT(mf.id) as count {base_query_from}{where_clause}"
    try:
        total_misc_files_cursor = db.execute(count_query, tuple(params))
        total_misc_files = total_misc_files_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total misc_files count: {e}")
        return jsonify(msg="Error fetching misc_files count."), 500

    # Calculate Pagination Details
    total_pages = math.ceil(total_misc_files / per_page) if total_misc_files > 0 else 1
    offset = (page - 1) * per_page

    if page > total_pages and total_misc_files > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Database Query for Paginated Misc Files
    # Original sort: ORDER BY mc.name, mf.user_provided_title, mf.original_filename
    # Now using user-defined sort or default mf.user_provided_title
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    paginated_params = list(params)
    paginated_params.extend([per_page, offset])
    
    try:
        misc_files_cursor = db.execute(final_query, tuple(paginated_params))
        misc_files_list = [dict(row) for row in misc_files_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated misc_files: {e}")
        return jsonify(msg="Error fetching misc_files."), 500

    return jsonify({
        "misc_files": misc_files_list,
        "page": page,
        "per_page": per_page,
        "total_misc_files": total_misc_files,
        "total_pages": total_pages
    }), 200

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
        table_name='documents',
        upload_folder_config_key='DOC_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/docs',
        metadata_fields=['software_id', 'doc_name', 'description', 'doc_type'],
        required_form_fields=['software_id', 'doc_name'], # CHANGED: 'doc_name' is now directly required
        sql_insert_query="""INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                               created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""",
        sql_params_tuple=(
            'software_id', 'doc_name', 'download_link_or_url', 'description', 'doc_type',
             'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
            'created_by_user_id', 'updated_by_user_id'
        )
        # No resolved_fks needed here as software_id comes from form, and no version_id for documents.
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
            'stored_filename', 'original_filename_ref', 'file_size', 'file_type',
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


import os # Ensure os is imported for os.path.join
import uuid # Ensure uuid is imported if used in _delete_file_if_exists or file saving logic elsewhere
from werkzeug.utils import secure_filename # if used by _delete_file_if_exists indirectly or for consistency
import sqlite3 # For specific exception handling

# Assuming get_db, jwt_required, admin_required, get_jwt_identity,
# get_or_create_version_id, _delete_file_if_exists, app.config are defined elsewhere

@app.route('/api/admin/links/<int:link_id_from_url>/edit_url', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_link_url(link_id_from_url):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id_from_url,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    # Resolve software_id for the link
    # If 'software_id' is in payload, use it; otherwise, keep existing.
    new_software_id_payload = data.get('software_id')
    if new_software_id_payload is not None:
        try:
            software_id_for_link = int(new_software_id_payload)
        except (ValueError, TypeError):
            return jsonify(msg="Invalid software_id format for link."), 400
    else:
        software_id_for_link = link_item['software_id']

    # Resolve other fields, defaulting to existing values
    title = data.get('title', link_item['title']).strip()
    description = data.get('description', link_item['description']) # Keep as is, or strip if always string
    if description is not None: # Allow description to be set to empty string or null
        description = str(description).strip()
    url = data.get('url', link_item['url']).strip() # For edit_url, this is the external URL

    if not title or not url: # software_id_for_link is already resolved
        return jsonify(msg="Title and URL are required for edit."), 400

    # --- Version Handling ---
    final_version_id_for_db = link_item['version_id'] # Default to current version
    software_id_for_version_context = software_id_for_link # Version must match the link's software

    typed_version_string = data.get('typed_version_string')
    provided_version_id_payload = data.get('version_id') # Can be int, str, None

    if typed_version_string and typed_version_string.strip():
        resolved_id = get_or_create_version_id(db, software_id_for_version_context, typed_version_string.strip(), current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process typed version '{typed_version_string}' for software ID {software_id_for_version_context}."), 500
        final_version_id_for_db = resolved_id
    elif provided_version_id_payload is not None:
        # Handle empty string from payload explicitly (e.g., user cleared selection)
        if isinstance(provided_version_id_payload, str) and not provided_version_id_payload.strip():
            # If an empty string is sent, and version is mandatory, this implies an issue unless
            # the intent is to rely on typed_version_string (which was already checked and is not present here).
            # For edit, if no new version is actively chosen, we default to existing.
            # If user explicitly sends an empty string for version_id, it's ambiguous.
            # For now, if it's empty and no typed_string, we stick to existing.
            pass # Stays as link_item['version_id']
        else:
            try:
                parsed_id = int(str(provided_version_id_payload)) # Convert to string first for int() if it was int
                if parsed_id > 0:
                    final_version_id_for_db = parsed_id
                else: # parsed_id is 0 or negative
                    return jsonify(msg=f"Invalid version ID '{parsed_id}' provided. Must be a positive integer."), 400
            except (ValueError, TypeError):
                return jsonify(msg="Invalid format for provided version_id. Must be an integer or an integer string."), 400
    
    if final_version_id_for_db is None: # Check after all logic
        return jsonify(msg="A valid version association is mandatory for this link."), 400

    # Validate that final_version_id_for_db belongs to software_id_for_version_context
    version_valid_check = db.execute(
        "SELECT software_id FROM versions WHERE id = ? AND software_id = ?",
        (final_version_id_for_db, software_id_for_version_context)
    ).fetchone()
    if not version_valid_check:
        return jsonify(msg=f"Version ID {final_version_id_for_db} is not valid or does not belong to Software ID {software_id_for_version_context}."), 400

    # If the link was previously a file and is now becoming a URL link, delete the old file.
    if not link_item['is_external_link'] and link_item['stored_filename']:
        _delete_file_if_exists(os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename']))

    try:
        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = TRUE, stored_filename = NULL, original_filename_ref = NULL,
            file_size = NULL, file_type = NULL, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, url,
             current_user_id, link_id_from_url))
        db.commit()
        # Fetch back with JOINs for consistent response
        updated_item_dict = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number
            FROM links l
            JOIN software s ON l.software_id = s.id
            JOIN versions v ON l.version_id = v.id
            WHERE l.id = ?""", (link_id_from_url,)).fetchone()
        return jsonify(dict(updated_item_dict) if updated_item_dict else None), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        return jsonify(msg=f"Database integrity error: {e}"), 409
    except Exception as e:
        db.rollback()
        return jsonify(msg=f"Server error during link update: {e}"), 500


@app.route('/api/admin/links/<int:link_id_from_url>/edit_file', methods=['PUT'])
@jwt_required()
@admin_required
def admin_edit_link_file(link_id_from_url):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    link_item = db.execute("SELECT * FROM links WHERE id = ?", (link_id_from_url,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    # Resolve software_id for the link
    software_id_from_form = request.form.get('software_id')
    if software_id_from_form:
        try:
            software_id_for_link = int(software_id_from_form)
        except ValueError:
            return jsonify(msg="Invalid software_id format for link."), 400
    else:
        software_id_for_link = link_item['software_id']

    # Resolve other fields from form
    title = request.form.get('title', link_item['title']).strip()
    description_form = request.form.get('description') # None if not present
    description = description_form.strip() if description_form is not None else link_item['description']

    if not title:
        return jsonify(msg="Title is required for edit."), 400

    # --- Version Handling ---
    final_version_id_for_db = link_item['version_id'] # Default
    software_id_for_version_context = software_id_for_link

    typed_version_string_form = request.form.get('typed_version_string')
    provided_version_id_form = request.form.get('version_id') # Always str or None

    if typed_version_string_form and typed_version_string_form.strip():
        resolved_id = get_or_create_version_id(db, software_id_for_version_context, typed_version_string_form.strip(), current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process typed version '{typed_version_string_form}' for software ID {software_id_for_version_context}."), 500
        final_version_id_for_db = resolved_id
    elif provided_version_id_form and provided_version_id_form.strip(): # Not None and not empty
        try:
            parsed_id = int(provided_version_id_form)
            if parsed_id > 0:
                final_version_id_for_db = parsed_id
            else:
                return jsonify(msg=f"Invalid version ID '{parsed_id}' provided. Must be a positive integer."), 400
        except ValueError:
            return jsonify(msg="Invalid format for provided version_id. Must be an integer string."), 400

    if final_version_id_for_db is None:
        return jsonify(msg="A valid version association is mandatory for this link."), 400

    # Validate that final_version_id_for_db belongs to software_id_for_version_context
    version_valid_check = db.execute(
        "SELECT software_id FROM versions WHERE id = ? AND software_id = ?",
        (final_version_id_for_db, software_id_for_version_context)
    ).fetchone()
    if not version_valid_check:
        return jsonify(msg=f"Version ID {final_version_id_for_db} is not valid or does not belong to Software ID {software_id_for_version_context}."), 400

    # --- File Handling ---
    new_physical_file = request.files.get('file')
    new_stored_filename = link_item['stored_filename']
    new_original_filename = link_item['original_filename_ref']
    new_file_size = link_item['file_size']
    new_file_type = link_item['file_type']
    new_url = link_item['url'] # This becomes server path if file uploaded/changed
    file_actually_saved_path = None # To track if a new file was physically saved, for cleanup on DB error

    if new_physical_file and new_physical_file.filename != '': # A new file is being uploaded
        # if not allowed_file(new_physical_file.filename): # Assuming allowed_file function exists
        #     return jsonify(msg="File type not allowed"), 400

        # Delete old file if it existed and was managed by us
        if not link_item['is_external_link'] and link_item['stored_filename']:
            _delete_file_if_exists(os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename']))
        
        original_filename_secured = secure_filename(new_physical_file.filename)
        ext = original_filename_secured.rsplit('.', 1)[1].lower() if '.' in original_filename_secured else ''
        new_stored_filename = f"{uuid.uuid4().hex}{'.' + ext if ext else ''}"
        file_actually_saved_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], new_stored_filename)
        
        try:
            os.makedirs(app.config['LINK_UPLOAD_FOLDER'], exist_ok=True) # Ensure directory exists
            new_physical_file.save(file_actually_saved_path)
            new_file_size = os.path.getsize(file_actually_saved_path)
            new_file_type = new_physical_file.mimetype
            new_original_filename = original_filename_secured
            new_url = f"/official_uploads/links/{new_stored_filename}" # Update URL to new file path
        except Exception as e:
            if file_actually_saved_path and os.path.exists(file_actually_saved_path): # Cleanup partially saved file
                _delete_file_if_exists(file_actually_saved_path)
            return jsonify(msg=f"Error saving new file: {e}"), 500
            
    elif link_item['is_external_link']: # Switching from URL to File, but no new file provided
        # This case implies the payload wants it to be a file link, but no file was sent.
        # However, the route is edit_file, so it's assumed to become/remain a file link.
        # If no new file is provided, and it was previously external, this is an error.
        return jsonify(msg="To change from an external URL to a file-based link, a new file must be uploaded."), 400
    # If it was already a file link, and no new file is provided, it's a metadata-only update for the file link.
    # new_url, new_stored_filename etc. will retain their values from link_item.

    try:
        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = FALSE, stored_filename = ?, original_filename_ref = ?,
            file_size = ?, file_type = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, new_url, new_stored_filename,
             new_original_filename, new_file_size, new_file_type, current_user_id, link_id_from_url))
        db.commit()
        updated_item_dict = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number
            FROM links l
            JOIN software s ON l.software_id = s.id
            JOIN versions v ON l.version_id = v.id
            WHERE l.id = ?""", (link_id_from_url,)).fetchone()
        return jsonify(dict(updated_item_dict) if updated_item_dict else None), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        if file_actually_saved_path and os.path.exists(file_actually_saved_path): # Cleanup newly saved file on DB error
             _delete_file_if_exists(file_actually_saved_path)
        return jsonify(msg=f"Database integrity error: {e}"), 409
    except Exception as e:
        db.rollback()
        if file_actually_saved_path and os.path.exists(file_actually_saved_path): # Cleanup
             _delete_file_if_exists(file_actually_saved_path)
        return jsonify(msg=f"Server error during link update: {e}"), 500

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
    provided_version_id = data.get('version_id') # Can be int, string, or None from JSON
    typed_version_string = data.get('typed_version_string')

    if not software_id_str:
        return jsonify(msg="software_id is required"), 400
    try:
        software_id = int(software_id_str) # software_id for the link itself
    except (ValueError, TypeError):
        return jsonify(msg="Invalid software_id format"), 400

    final_version_id_for_db = None
    # Check if a version_id was directly provided (e.g., from dropdown)
    if provided_version_id is not None and str(provided_version_id).strip() != "": # Check if not None and not empty string
        try:
            final_version_id_for_db = int(provided_version_id)
            if final_version_id_for_db <= 0: # Assuming IDs are positive
                final_version_id_for_db = None # Treat 0 or negative as invalid selection
                if typed_version_string and typed_version_string.strip(): # Fallback to typed string if selection was invalid placeholder
                    pass # Let the next block handle typed_version_string
                else: # If selection invalid and no typed string, and version is mandatory
                    if True: # True because version is mandatory for links now
                         return jsonify(msg="Invalid version_id selected and no typed version provided."), 400
        except (ValueError, TypeError):
            return jsonify(msg="Invalid format for provided version_id."), 400
    
    # If no valid version_id from dropdown, try typed_version_string
    if final_version_id_for_db is None and typed_version_string and typed_version_string.strip():
        final_version_id_for_db = get_or_create_version_id(db, software_id, typed_version_string, current_user_id)
        if final_version_id_for_db is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}' for software ID {software_id}."), 500
    
    # If version is mandatory for links and still no valid ID
    if final_version_id_for_db is None: # Check after all attempts
        return jsonify(msg="A version (either selected ID or typed string) is mandatory for links."), 400
            
    data['version_id'] = final_version_id_for_db
    data.pop('typed_version_string', None)

    return _admin_add_item_with_external_link(
        table_name='links',
        data=data,
        required_fields=['software_id', 'version_id', 'title', 'url'],
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""",
        sql_params_tuple=(
            'software_id', 'version_id', 'title', 'url', 'description',
            'created_by_user_id', 'updated_by_user_id'
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
    query_term = request.args.get('q', '').strip()

    if not query_term:
        return jsonify({"error": "Search query parameter 'q' is required and cannot be empty."}), 400

    db = get_db()
    results = []
    
    # Prepare the search term for LIKE queries
    like_query_term = f"%{query_term.lower()}%"

    # Documents
    sql_documents = """
        SELECT id, doc_name AS name, description, 'document' AS type
        FROM documents
        WHERE LOWER(doc_name) LIKE ? OR LOWER(description) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_documents, (like_query_term, like_query_term)).fetchall()])

    # Patches
    sql_patches = """
        SELECT id, patch_name AS name, description, 'patch' AS type
        FROM patches
        WHERE LOWER(patch_name) LIKE ? OR LOWER(description) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_patches, (like_query_term, like_query_term)).fetchall()])

    # Links
    sql_links = """
        SELECT id, title AS name, description, url, 'link' AS type
        FROM links
        WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(url) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_links, (like_query_term, like_query_term, like_query_term)).fetchall()])

    # Misc Files
    sql_misc_files = """
        SELECT id, user_provided_title AS name, original_filename, user_provided_description AS description, 'misc_file' AS type
        FROM misc_files
        WHERE LOWER(user_provided_title) LIKE ? OR LOWER(user_provided_description) LIKE ? OR LOWER(original_filename) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_misc_files, (like_query_term, like_query_term, like_query_term)).fetchall()])

    # Software
    sql_software = """
        SELECT id, name, description, 'software' AS type
        FROM software
        WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_software, (like_query_term, like_query_term)).fetchall()])

    # Versions
    sql_versions = """
        SELECT v.id, v.version_number AS name, v.changelog, v.known_bugs, v.software_id, s.name AS software_name, 'version' AS type
        FROM versions v
        JOIN software s ON v.software_id = s.id
        WHERE LOWER(v.version_number) LIKE ? OR LOWER(v.changelog) LIKE ? OR LOWER(v.known_bugs) LIKE ?
    """
    results.extend([dict(row) for row in db.execute(sql_versions, (like_query_term, like_query_term, like_query_term)).fetchall()])

    return jsonify(results)

# --- CLI Command ---
@app.cli.command('init-db')
def init_db_command():
    database.init_db(app.config['DATABASE']) # Pass DB path to init_db
    print('Initialized the database.')

# --- Main Execution ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)