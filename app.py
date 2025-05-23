# app.py
import os
import uuid
import sqlite3
import json # Added for audit logging
import re
from datetime import datetime, timedelta, timezone # Added timedelta and timezone
import math # Added for math.ceil
import secrets # Added for secure token generation
import shutil # For file operations if needed, though .backup is preferred for DB
import click # For CLI arguments
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
    'py', 'js', 'java', 'c', 'cpp', 'h', 'cs', 'html', 'css', 'ps1' # Code files
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
def get_site_setting(key: str) -> str | None:
    """Fetches a setting value from the site_settings table."""
    db = get_db()
    cursor = db.execute("SELECT setting_value FROM site_settings WHERE setting_key = ?", (key,))
    row = cursor.fetchone()
    return row['setting_value'] if row else None

def update_site_setting(key: str, value: str) -> None:
    """Updates or inserts a setting in the site_settings table."""
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO site_settings (setting_key, setting_value) VALUES (?, ?)",
        (key, value)
    )
    db.commit()

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

def create_user_in_db(username, password, email=None, role='user'): # Added role, default to 'user'
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    actual_email = email.strip() if email and email.strip() else None
    try:
        cursor = get_db().execute(
            "INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)", # Added role column
            (username, hashed_password, actual_email, role) # Added role value
        )
        get_db().commit()
        user_id = cursor.lastrowid
        return user_id, role # Return user_id and role
    except sqlite3.IntegrityError as e:
        app.logger.error(f"DB IntegrityError creating user '{username}' with role '{role}': {e}")
        return None, None # Return None for both on error
    except Exception as e:
        app.logger.error(f"DB General Exception creating user '{username}' with role '{role}': {e}")
        return None, None # Return None for both on error

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Password Strength Helper ---
def is_password_strong(password: str) -> tuple[bool, str]:
    """
    Checks if the password meets the strength criteria.
    Returns: (True, "Password is strong") or (False, "error message").
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must include at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must include at least one digit."
    
    # Consolidated message if multiple criteria are preferred to be listed at once
    # For now, returning specific messages as per above.
    # A general message could be:
    # "Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, and a digit."
    
    return True, "Password is strong"

# --- Audit Log Helper ---
def log_audit_action(action_type: str, target_table: str = None, target_id: int = None, details: dict = None, user_id: int = None, username: str = None):
    """
    Logs an action to the audit_logs table.
    Automatically tries to derive user_id and username from JWT if not provided.
    """
    final_user_id = user_id
    final_username = username

    # Try to get user details from JWT if not explicitly provided
    if final_user_id is None: # Only attempt JWT if user_id isn't already specified
        try:
            # verify_jwt_in_request checks if a JWT is present and valid.
            # optional=True means it won't raise an error if JWT is missing.
            verify_jwt_in_request(optional=True) 
            current_user_id_str = get_jwt_identity() # Returns None if no identity in JWT

            if current_user_id_str:
                try:
                    jwt_user_id = int(current_user_id_str)
                    final_user_id = jwt_user_id # Set final_user_id from JWT
                    
                    # Fetch username if not provided and we have a user_id from JWT
                    if final_username is None:
                        user_details = find_user_by_id(jwt_user_id)
                        if user_details:
                            final_username = user_details['username']
                        else:
                            # This case means JWT has an ID for a user that doesn't exist.
                            # Log with the ID, but username will remain None or what was passed.
                            app.logger.warning(f"Audit log: User ID {jwt_user_id} from JWT not found in database.")
                except ValueError:
                    app.logger.error(f"Audit log: Invalid user ID format in JWT: {current_user_id_str}")
                except Exception as e_jwt_user_fetch:
                    # Catch errors during find_user_by_id or int conversion if any other
                    app.logger.error(f"Audit log: Error processing JWT user identity: {e_jwt_user_fetch}")
            # If no JWT or no identity in JWT, final_user_id and final_username remain as initially passed (or None)
        except Exception as e_jwt_verify:
            # This might catch errors from verify_jwt_in_request itself, though less common with optional=True
            app.logger.error(f"Audit log: Error during JWT verification (optional): {e_jwt_verify}")

    details_json = None
    if details is not None:
        try:
            details_json = json.dumps(details)
        except TypeError as e_json:
            app.logger.error(f"Audit log: Could not serialize details to JSON for action '{action_type}': {e_json}. Details: {details}")
            details_json = json.dumps({"error": "Could not serialize details", "original_details_type": str(type(details))})

    try:
        db = get_db()
        db.execute("""
            INSERT INTO audit_logs (user_id, username, action_type, target_table, target_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (final_user_id, final_username, action_type, target_table, target_id, details_json))
        db.commit()
    except sqlite3.Error as e_db:
        app.logger.error(f"Audit log: Database error logging action '{action_type}': {e_db}")
        # Depending on policy, you might want to rollback if part of a larger transaction elsewhere,
        # but this function is self-contained for audit logging.
        # db.rollback() # Not strictly necessary here as it's a single insert attempt.
    except Exception as e_general:
        # Catch any other unexpected errors
        app.logger.error(f"Audit log: General error logging action '{action_type}': {e_general}")

# --- Download Log Helper ---
def _log_download_activity(filename_to_serve: str, item_type: str, current_db: sqlite3.Connection):
    """Logs download activity to the download_log table."""
    try:
        table_map = {
            'document': {'table_name': 'documents', 'id_column': 'id'},
            'patch': {'table_name': 'patches', 'id_column': 'id'},
            'link_file': {'table_name': 'links', 'id_column': 'id'}, # Assuming 'links' table for files uploaded via "Links"
            'misc_file': {'table_name': 'misc_files', 'id_column': 'id'}
        }

        if item_type not in table_map:
            app.logger.error(f"Download log: Invalid item_type '{item_type}' for filename '{filename_to_serve}'.")
            return

        table_info = table_map[item_type]
        table_name = table_info['table_name']
        # id_column = table_info['id_column'] # Currently always 'id'

        item_id = None
        # Query to find the item_id based on stored_filename
        # Note: For 'misc_files', the column is 'stored_filename'.
        # For 'documents', 'patches', 'links', it's also 'stored_filename'.
        query = f"SELECT id FROM {table_name} WHERE stored_filename = ?"
        item_cursor = current_db.execute(query, (filename_to_serve,))
        item_row = item_cursor.fetchone()

        if item_row:
            item_id = item_row['id']
        else:
            app.logger.error(f"Download log: Could not find item_id for filename '{filename_to_serve}' in table '{table_name}'.")
            return # Cannot log if item not found

        user_id_for_log = None
        try:
            # Try to get user_id from JWT. Optional=True means it won't raise error if JWT is missing/invalid.
            verify_jwt_in_request(optional=True)
            current_user_jwt_identity = get_jwt_identity()
            if current_user_jwt_identity:
                user_id_for_log = int(current_user_jwt_identity)
        except ValueError:
            app.logger.warning(f"Download log: Invalid user ID format in JWT for download of '{filename_to_serve}'.")
        except Exception as e_jwt:
            # Log other JWT related errors but don't fail download logging
            app.logger.warning(f"Download log: Error processing JWT for download of '{filename_to_serve}': {e_jwt}")

        ip_address = request.remote_addr

        # Insert into download_log
        current_db.execute("""
            INSERT INTO download_log (file_id, file_type, user_id, ip_address, download_timestamp)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (item_id, item_type, user_id_for_log, ip_address))
        current_db.commit()
        app.logger.info(f"Download logged: File '{filename_to_serve}', Type '{item_type}', UserID '{user_id_for_log}', IP '{ip_address}'")

    except sqlite3.Error as e_db:
        app.logger.error(f"Download log: Database error for '{filename_to_serve}': {e_db}")
        # Potentially rollback if the commit failed, though commit is for this specific transaction.
        # current_db.rollback() # Only if part of a larger transaction that needs to be rolled back.
    except Exception as e_general:
        app.logger.error(f"Download log: General error for '{filename_to_serve}': {e_general}")

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

# --- Authentication Endpoints ---
@app.route('/api/auth/global-login', methods=['POST'])
def global_login():
    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify(msg="Password is required"), 400

    provided_password = data['password']
    stored_hash = get_site_setting('global_password_hash')

    if not stored_hash:
        # This case should ideally not happen if the DB is initialized correctly.
        app.logger.error("Global password hash not found in site_settings.")
        return jsonify(msg="Global access system not configured."), 500

    if bcrypt.check_password_hash(stored_hash, provided_password):
        # For now, just a success message. Frontend will manage its state.
        # Consider creating a short-lived global access token/session if needed later.
        log_audit_action(action_type='GLOBAL_LOGIN_SUCCESS') # Generic log
        return jsonify(message="Global access granted"), 200
    else:
        log_audit_action(action_type='GLOBAL_LOGIN_FAILED', details={'reason': 'Invalid global password'})
        return jsonify(msg="Invalid global password"), 401

# --- Security Questions Endpoint ---
@app.route('/api/security-questions', methods=['GET'])
def get_security_questions():
    try:
        db = get_db()
        questions_cursor = db.execute("SELECT id, question_text FROM security_questions ORDER BY id")
        questions = [dict(row) for row in questions_cursor.fetchall()]
        return jsonify(questions), 200
    except Exception as e:
        app.logger.error(f"Error fetching security questions: {e}")
        return jsonify(msg="Failed to retrieve security questions."), 500

# --- Authentication Endpoints ---

@app.route('/api/auth/request-password-reset-info', methods=['POST'])
def request_password_reset_info():
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    username_or_email = data.get('username_or_email')
    if not username_or_email:
        return jsonify(msg="Username or email is required"), 400

    db = get_db()
    user = None
    # Try finding user by username first, then by email if it contains '@'
    if '@' in username_or_email:
        user = find_user_by_email(username_or_email)
    if not user: # If not found by email or input was not an email
        user = find_user_by_username(username_or_email)

    if not user:
        return jsonify(msg="User not found."), 404

    # Fetch user's security questions
    try:
        questions_cursor = db.execute("""
            SELECT sq.id as question_id, sq.question_text
            FROM user_security_answers usa
            JOIN security_questions sq ON usa.question_id = sq.id
            WHERE usa.user_id = ?
            ORDER BY sq.id 
        """, (user['id'],)) # Ensure user['id'] is correct
        questions = [dict(row) for row in questions_cursor.fetchall()]

        if len(questions) != 3: # Should ideally always be 3 if registration enforces it
            app.logger.error(f"User {user['username']} (ID: {user['id']}) has {len(questions)} security questions, expected 3.")
            return jsonify(msg="Security question configuration error for this user."), 500

        log_audit_action(
            action_type='PASSWORD_RESET_REQUEST_INFO_SENT',
            target_table='users',
            target_id=user['id'],
            username=user['username'],
            details={'retrieved_for_user': user['username']}
        )
        return jsonify({
            "user_id": user['id'],
            "username": user['username'],
            "questions": questions
        }), 200

    except Exception as e:
        app.logger.error(f"Error fetching security questions for user {user['username']}: {e}")
        return jsonify(msg="Failed to retrieve security question information."), 500

@app.route('/api/auth/verify-security-answers', methods=['POST'])
def verify_security_answers():
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    user_id = data.get('user_id')
    provided_answers = data.get('answers')

    if not isinstance(user_id, int):
        return jsonify(msg="user_id (integer) is required."), 400
    if not isinstance(provided_answers, list) or len(provided_answers) != 3:
        return jsonify(msg="Exactly three answers are required in a list format."), 400

    # Validate structure of provided_answers
    for ans_obj in provided_answers:
        if not isinstance(ans_obj, dict) or 'question_id' not in ans_obj or 'answer' not in ans_obj:
            return jsonify(msg="Each answer must be an object with 'question_id' and 'answer'."), 400
        if not isinstance(ans_obj['question_id'], int):
            return jsonify(msg="Each 'question_id' must be an integer."), 400
        if not isinstance(ans_obj['answer'], str) or not ans_obj['answer'].strip():
            return jsonify(msg="Each 'answer' must be a non-empty string."), 400

    db = get_db()
    user = find_user_by_id(user_id) # Fetch user to log username later
    if not user:
        return jsonify(msg="User not found."), 404 # Should not happen if user_id came from previous step

    try:
        # Fetch stored answer hashes for the user
        stored_answers_cursor = db.execute(
            "SELECT question_id, answer_hash FROM user_security_answers WHERE user_id = ?", (user_id,)
        )
        stored_hashes_dict = {row['question_id']: row['answer_hash'] for row in stored_answers_cursor.fetchall()}

        if len(stored_hashes_dict) != 3:
            app.logger.error(f"User {user_id} does not have exactly 3 stored security answers.")
            return jsonify(msg="Security answer configuration error for user."), 500

        answers_correct = 0
        for pa in provided_answers:
            q_id = pa['question_id']
            ans_text = pa['answer']
            if q_id in stored_hashes_dict:
                if bcrypt.check_password_hash(stored_hashes_dict[q_id], ans_text):
                    answers_correct += 1
        
        if answers_correct == 3:
            # All answers are correct, generate and store token
            token = secrets.token_urlsafe(32)
            # Ensure datetime objects are timezone-aware if comparing with timezone-aware datetimes
            # For UTC, datetime.now(timezone.utc) is preferred over datetime.utcnow() in new code.
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            
            db.execute(
                "INSERT INTO password_reset_requests (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token, user_id, expires_at)
            )
            db.commit()

            log_audit_action(
                action_type='PASSWORD_RESET_ANSWERS_VERIFIED',
                target_table='users', target_id=user_id, username=user['username'],
                details={'token_issued': True}
            )
            return jsonify({"reset_token": token, "expires_at": expires_at.isoformat()}), 200
        else:
            log_audit_action(
                action_type='PASSWORD_RESET_ANSWERS_FAILED',
                target_table='users', target_id=user_id, username=user['username'],
                details={'reason': 'One or more answers incorrect'}
            )
            return jsonify(msg="One or more answers were incorrect."), 401

    except Exception as e:
        app.logger.error(f"Error verifying security answers for user_id {user_id}: {e}")
        # db.rollback() # Not strictly needed if the only commit is after successful token insertion
        return jsonify(msg="Failed to verify security answers due to a server error."), 500

@app.route('/api/auth/reset-password-with-token', methods=['POST'])
def reset_password_with_token():
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    token = data.get('token')
    new_password = data.get('new_password')

    if not token or not isinstance(token, str):
        return jsonify(msg="Valid token is required."), 400
    if not new_password or not isinstance(new_password, str):
        return jsonify(msg="New password is required."), 400

    db = get_db()
    try:
        # Fetch the token details
        token_data_cursor = db.execute(
            "SELECT user_id, expires_at FROM password_reset_requests WHERE token = ?", (token,)
        )
        token_data = token_data_cursor.fetchone()

        if not token_data:
            log_audit_action(action_type='PASSWORD_RESET_TOKEN_FAILED', details={'reason': 'Token not found', 'provided_token': token})
            return jsonify(msg="Invalid or expired reset token."), 400 # Or 404

        # Check expiry - ensure comparison is between timezone-aware datetimes if stored as such
        # If expires_at is stored as UTC string, parse it and compare with current UTC time.
        # Assuming expires_at was stored using datetime.now(timezone.utc).isoformat() or similar
        expires_at_dt = datetime.fromisoformat(token_data['expires_at'])
        if expires_at_dt < datetime.now(timezone.utc):
            # Clean up expired token
            db.execute("DELETE FROM password_reset_requests WHERE token = ?", (token,))
            db.commit()
            log_audit_action(action_type='PASSWORD_RESET_TOKEN_FAILED', target_id=token_data['user_id'], details={'reason': 'Token expired'})
            return jsonify(msg="Invalid or expired reset token."), 400

        # Validate new password strength
        is_strong, strength_msg = is_password_strong(new_password)
        if not is_strong:
            # Do not delete token on password strength failure, allow user to retry with same token
            return jsonify(msg=strength_msg), 400

        # Hash the new password
        hashed_new_password = bcrypt.generate_password_hash(new_password).decode('utf-8')

        # Update user's password
        db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hashed_new_password, token_data['user_id'])
        )
        
        # Delete the token to prevent reuse
        db.execute("DELETE FROM password_reset_requests WHERE token = ?", (token,))
        db.commit()

        user_for_log = find_user_by_id(token_data['user_id']) # For username in log
        log_audit_action(
            action_type='PASSWORD_RESET_TOKEN_SUCCESS',
            target_table='users',
            target_id=token_data['user_id'],
            username=user_for_log['username'] if user_for_log else None
        )
        return jsonify(msg="Password has been reset successfully."), 200

    except Exception as e:
        app.logger.error(f"Error during password reset with token: {e}")
        db.rollback() # Rollback any partial changes from this transaction
        return jsonify(msg="Failed to reset password due to a server error."), 500


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
        old_role = target_user['role'] # Get old role before update
        db.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        log_audit_action(
            action_type='CHANGE_USER_ROLE',
            target_table='users',
            target_id=user_id,
            details={'old_role': old_role, 'new_role': new_role}
        )
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
        deactivated_username = target_user['username'] # Get username before deactivation
        db.execute("UPDATE users SET is_active = FALSE WHERE id = ?", (user_id,))
        log_audit_action(
            action_type='DEACTIVATE_USER',
            target_table='users',
            target_id=user_id,
            details={'deactivated_username': deactivated_username}
        )
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
        activated_username = target_user['username'] # Get username before activation
        db.execute("UPDATE users SET is_active = TRUE WHERE id = ?", (user_id,)) # Use TRUE for boolean
        log_audit_action(
            action_type='ACTIVATE_USER',
            target_table='users',
            target_id=user_id,
            details={'activated_username': activated_username}
        )
        db.commit()
        updated_user = find_user_by_id(user_id)
        app.logger.info(f"Super admin {get_jwt_identity()} activated user {user_id}.") # Existing log, can be kept or removed if audit is sufficient
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
        deleted_username = target_user['username'] # Get username before deletion
        # Attempt direct deletion.
        # Note: Foreign key constraints might prevent this if the user is referenced elsewhere.
        # The schema uses ON DELETE for some FKs, but created_by_user_id typically won't have ON DELETE CASCADE.
        # This will raise sqlite3.IntegrityError if FK constraints are violated.
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        log_audit_action(
            action_type='DELETE_USER',
            target_table='users',
            target_id=user_id,
            details={'deleted_username': deleted_username}
        )
        db.commit()
        app.logger.info(f"Super admin {current_super_admin_id} deleted user {user_id}.") # Existing log
        return jsonify(msg="User deleted successfully."), 200
    except sqlite3.IntegrityError as e:
        db.rollback()
        app.logger.error(f"Error deleting user {user_id} due to foreign key constraint: {e}")
        return jsonify(msg=f"Cannot delete user: This user is referenced by other records in the database. (Error: {e})"), 409 # 409 Conflict
    except Exception as e:
        db.rollback()
        app.logger.error(f"Error deleting user {user_id}: {e}")
        return jsonify(msg="Failed to delete user due to a server error."), 500

@app.route('/api/superadmin/users/<int:user_id>/force-password-reset', methods=['PUT'])
@jwt_required()
@super_admin_required
def force_password_reset(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)

    if not target_user:
        return jsonify(msg="Target user not found."), 404

    # Prevent a super admin from forcing password reset on another super admin
    if target_user['role'] == 'super_admin':
        return jsonify(msg="Super admin passwords cannot be force-reset this way."), 403
    
    # Prevent a super admin from forcing password reset on themselves via this route
    # (though the above check would also catch this if they are the target_user)
    current_super_admin_id_str = get_jwt_identity()
    current_super_admin_id = int(current_super_admin_id_str)
    if user_id == current_super_admin_id:
        return jsonify(msg="Super admins cannot force-reset their own password via this route."), 403


    try:
        db.execute("UPDATE users SET password_reset_required = TRUE WHERE id = ?", (user_id,))
        db.commit()

        log_audit_action(
            action_type='USER_FORCE_PASSWORD_RESET_INITIATED',
            target_table='users',
            target_id=user_id,
            details={'forced_by_super_admin_id': current_super_admin_id, 'target_username': target_user['username']}
            # user_id and username in log_audit_action will be the super_admin performing the action
        )
        return jsonify(msg="User will be required to reset their password on next login."), 200
    except Exception as e:
        db.rollback()
        app.logger.error(f"Error forcing password reset for user {user_id}: {e}")
        return jsonify(msg="Failed to force password reset due to a server error."), 500

# --- Authentication Endpoints ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400
    username, password, email = data.get('username'), data.get('password'), data.get('email')
    security_answers = data.get('security_answers')

    if not username or not password: return jsonify(msg="Missing username or password"), 400

    # --- Security Answers Validation ---
    if not security_answers or not isinstance(security_answers, list) or len(security_answers) != 3:
        return jsonify(msg="Exactly three security answers are required."), 400

    question_ids = []
    for ans in security_answers:
        if not isinstance(ans, dict) or 'question_id' not in ans or 'answer' not in ans:
            return jsonify(msg="Each security answer must be an object with 'question_id' and 'answer' fields."), 400
        if not isinstance(ans['question_id'], int):
            return jsonify(msg="Each 'question_id' must be an integer."), 400
        if not isinstance(ans['answer'], str) or not ans['answer'].strip():
            return jsonify(msg="Each security 'answer' must be a non-empty string."), 400
        question_ids.append(ans['question_id'])

    if len(set(question_ids)) != 3:
        return jsonify(msg="All three 'question_id's must be unique."), 400
    
    # Optional: Validate question_ids exist in DB
    db = get_db() # Ensure db is available for this check
    placeholders = ','.join(['?'] * len(question_ids))
    query = f"SELECT COUNT(*) FROM security_questions WHERE id IN ({placeholders})"
    cursor = db.execute(query, question_ids)
    count_row = cursor.fetchone()
    if count_row is None or count_row[0] != 3:
        return jsonify(msg="One or more provided security question IDs are invalid."), 400
    # --- End Security Answers Validation ---

    # Password strength check
    is_strong, strength_msg = is_password_strong(password)
    if not is_strong:
        return jsonify(msg=strength_msg), 400

    if find_user_by_username(username): return jsonify(msg="Username already exists"), 409
    if email and find_user_by_email(email): return jsonify(msg="Email address already registered"), 409

    # Need to get actual_email from create_user_in_db or pass it to log_audit_action
    # For simplicity, let's prepare actual_email as it would be in create_user_in_db
    actual_email_for_log = email.strip() if email and email.strip() else None

    # Determine role based on existing user count
    # db = get_db() # db is already fetched for question ID validation
    user_count_cursor = db.execute("SELECT COUNT(*) as count FROM users")
    user_count = user_count_cursor.fetchone()['count']
    role_to_assign = 'super_admin' if user_count == 0 else 'user'

    user_id, assigned_role = create_user_in_db(username, password, email, role_to_assign) # This commits the user creation
    
    if user_id:
        try:
            # Hash and store security answers
            for ans in security_answers:
                hashed_answer = bcrypt.generate_password_hash(ans['answer']).decode('utf-8')
                db.execute(
                    "INSERT INTO user_security_answers (user_id, question_id, answer_hash) VALUES (?, ?, ?)",
                    (user_id, ans['question_id'], hashed_answer)
                )
            db.commit() # Commit security answers
            
            log_audit_action(
                action_type='CREATE_USER',
                target_table='users',
                target_id=user_id,
                details={'username': username, 'email': actual_email_for_log, 'role': assigned_role, 'security_questions_set': True},
                user_id=user_id, 
                username=username
            )
            return jsonify(msg="User created successfully", user_id=user_id, role=assigned_role), 201
        except sqlite3.IntegrityError as e:
            # This might happen if somehow (user_id, question_id) is duplicated despite prior validation,
            # or if a question_id is invalid and not caught by optional check.
            # Since user is already created, this is a partial failure state.
            # For now, log and return error. A more robust solution might rollback user creation.
            db.rollback() # Rollback security answer insertions
            app.logger.error(f"DB IntegrityError storing security answers for user '{username}': {e}")
            # Consider deleting the created user if security questions are mandatory for all users
            # db.execute("DELETE FROM users WHERE id = ?", (user_id,))
            # db.commit()
            # app.logger.info(f"Rolled back user creation for {username} due to security answer storage failure.")
            return jsonify(msg="User created, but failed to store security answers due to a database conflict."), 500
        except Exception as e:
            db.rollback() # Rollback security answer insertions
            app.logger.error(f"General Exception storing security answers for user '{username}': {e}")
            # Similarly, consider user rollback.
            return jsonify(msg="User created, but failed to store security answers due to a server error."), 500
    else: # user_id was None from create_user_in_db
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
            # Log failed login attempt due to inactive account, then return
            log_audit_action(
                action_type='USER_LOGIN_FAILED_INACTIVE',
                target_table='users',
                target_id=user['id'],
                user_id=user['id'], # Use the ID of the user attempting to log in
                username=user['username'], # Use the username of the user attempting to log in
                details={'reason': 'Account deactivated'}
            )
            return jsonify(msg="Account deactivated."), 403
        
        access_token = create_access_token(identity=str(user['id'])) # Ensure identity is string
        log_audit_action(
            action_type='USER_LOGIN',
            target_table='users',
            target_id=user['id'],
            user_id=user['id'], # Explicitly pass logged-in user's ID
            username=user['username'] # Explicitly pass logged-in user's username
        )
        # Include password_reset_required flag in the response
        return jsonify(
            access_token=access_token, 
            username=user['username'], 
            role=user['role'],
            password_reset_required=user['password_reset_required'] # Added this line
        ), 200
    
    # Log failed login attempt (bad username or password)
    # Need to determine if user exists to get target_id, or log without it if user not found
    target_id_for_failed_login = user['id'] if user else None
    username_for_failed_login = username # Log the username that was attempted

    log_audit_action(
        action_type='USER_LOGIN_FAILED',
        target_table='users',
        target_id=target_id_for_failed_login, # Will be None if username doesn't exist
        username=username_for_failed_login, # Log the attempted username as the "actor" in this context
                                            # or could be None if we don't want to identify non-existent users
        details={'reason': 'Bad username or password', 'provided_username': username}
    )
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

    # Password strength check for the new password
    is_strong, strength_msg = is_password_strong(new_password)
    if not is_strong:
        return jsonify(msg=strength_msg), 400

    hashed_new_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    
    try:
        db = get_db()
        audit_details = {} # Initialize empty dict for audit details

        # Check if password reset was required
        if user['password_reset_required']:
            db.execute("UPDATE users SET password_hash = ?, password_reset_required = FALSE WHERE id = ?", (hashed_new_password, current_user_id))
            audit_details['forced_reset_cleared'] = True
        else:
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed_new_password, current_user_id))
            audit_details['forced_reset_cleared'] = False # Or simply omit if not relevant

        log_audit_action(
            action_type='CHANGE_PASSWORD',
            target_table='users',
            target_id=current_user_id,
            details=audit_details # Add custom details
        )
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
        old_email = user['email'] # Fetched before update
        db = get_db()
        db.execute("UPDATE users SET email = ? WHERE id = ?", (new_email, current_user_id))
        log_audit_action(
            action_type='UPDATE_EMAIL',
            target_table='users',
            target_id=current_user_id,
            details={'old_email': old_email, 'new_email': new_email}
        )
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

    # Get new filter parameters
    doc_type_filter = request.args.get('doc_type', type=str)
    created_from_filter = request.args.get('created_from', type=str)
    created_to_filter = request.args.get('created_to', type=str)
    updated_from_filter = request.args.get('updated_from', type=str)
    updated_to_filter = request.args.get('updated_to', type=str)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'd.id',
        'doc_name': 'd.doc_name',
        'software_name': 's.name', 
        'doc_type': 'd.doc_type',
        'uploaded_by_username': 'u.username', # Added for sorting
        'created_at': 'd.created_at',
        'updated_at': 'd.updated_at'
        # patch_by_developer is not applicable to documents
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'd.doc_name') 

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select_fields = "d.id, d.software_id, d.doc_name, d.description, d.doc_type, d.is_external_link, d.download_link, d.stored_filename, d.original_filename_ref, d.file_size, d.file_type, d.created_by_user_id, u.username as uploaded_by_username, d.created_at, d.updated_by_user_id, upd_u.username as updated_by_username, d.updated_at, s.name as software_name"
    base_query_from = "FROM documents d JOIN software s ON d.software_id = s.id LEFT JOIN users u ON d.created_by_user_id = u.id LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id"
    
    params = [] # Parameters for the WHERE clause
    user_id_param_for_join = [] # Parameter for the JOIN clause (user_id for favorites)

    # Attempt to get user_id for favorites
    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_documents_api: {e}")

    if user_id:
        base_query_select = f"SELECT {base_query_select_fields}, uf.id AS favorite_id"
        base_query_from += " LEFT JOIN user_favorites uf ON d.id = uf.item_id AND uf.item_type = 'document' AND uf.user_id = ?"
        user_id_param_for_join.append(user_id)
    else:
        base_query_select = f"SELECT {base_query_select_fields}, NULL AS favorite_id" # Ensure favorite_id column exists even if null

    filter_conditions = []

    if software_id_filter:
        filter_conditions.append("d.software_id = ?")
        params.append(software_id_filter)

    if doc_type_filter:
        filter_conditions.append("LOWER(d.doc_type) LIKE ?")
        params.append(f"%{doc_type_filter.lower()}%")
    
    # Date range filters
    # Note: No explicit date validation here as per instructions, relying on DB behavior.
    # Consider adding a helper function for date validation (YYYY-MM-DD) for robustness.
    if created_from_filter:
        filter_conditions.append("date(d.created_at) >= date(?)")
        params.append(created_from_filter)
    if created_to_filter:
        filter_conditions.append("date(d.created_at) <= date(?)")
        params.append(created_to_filter)
    if updated_from_filter:
        filter_conditions.append("date(d.updated_at) >= date(?)")
        params.append(updated_from_filter)
    if updated_to_filter:
        filter_conditions.append("date(d.updated_at) <= date(?)")
        params.append(updated_to_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    # For count_query, we don't need the favorite_id or the join to user_favorites, nor user_id_param_for_join
    count_query_from_without_fav_join = "FROM documents d JOIN software s ON d.software_id = s.id LEFT JOIN users u ON d.created_by_user_id = u.id LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id"
    count_query = f"SELECT COUNT(d.id) as count {count_query_from_without_fav_join}{where_clause}"
    try:
        total_documents_cursor = db.execute(count_query, tuple(params)) 
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
    # Combine params for WHERE clause and the user_id for JOIN clause
    final_params = tuple(params + user_id_param_for_join + [per_page, offset])
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        documents_cursor = db.execute(final_query, final_params)
        documents_list = [dict(row) for row in documents_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated documents: {e} with query {final_query} and params {final_params}")
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

    # Get new filter parameters
    release_from_filter = request.args.get('release_from', type=str)
    release_to_filter = request.args.get('release_to', type=str)
    patched_by_developer_filter = request.args.get('patched_by_developer', type=str)

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
        'patch_by_developer': 'p.patch_by_developer', # Retained
        'uploaded_by_username': 'u.username', # Retained (creator)
        'created_at': 'p.created_at',
        'updated_at': 'p.updated_at'
        # updated_by_username can be added if sorting by editor is needed
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'p.patch_name') 

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select_fields = "p.id, p.version_id, p.patch_name, p.description, p.release_date, p.is_external_link, p.download_link, p.stored_filename, p.original_filename_ref, p.file_size, p.file_type, p.patch_by_developer, p.created_by_user_id, u.username as uploaded_by_username, p.created_at, p.updated_by_user_id, upd_u.username as updated_by_username, p.updated_at, s.name as software_name, s.id as software_id, v.version_number"
    base_query_from = "FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id LEFT JOIN users u ON p.created_by_user_id = u.id LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id"
    
    params = [] 
    user_id_param_for_join = []

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_patches_api: {e}")

    if user_id:
        base_query_select = f"SELECT {base_query_select_fields}, uf.id AS favorite_id"
        base_query_from += " LEFT JOIN user_favorites uf ON p.id = uf.item_id AND uf.item_type = 'patch' AND uf.user_id = ?"
        user_id_param_for_join.append(user_id)
    else:
        base_query_select = f"SELECT {base_query_select_fields}, NULL AS favorite_id"

    filter_conditions = []

    if software_id_filter:
        filter_conditions.append("s.id = ?") # Filter by software_id from the software table
        params.append(software_id_filter)

    if release_from_filter:
        filter_conditions.append("date(p.release_date) >= date(?)")
        params.append(release_from_filter)
    if release_to_filter:
        filter_conditions.append("date(p.release_date) <= date(?)")
        params.append(release_to_filter)
    if patched_by_developer_filter:
        filter_conditions.append("LOWER(p.patch_by_developer) LIKE ?")
        params.append(f"%{patched_by_developer_filter.lower()}%")
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query_from_without_fav_join = "FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id LEFT JOIN users u ON p.created_by_user_id = u.id LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id"
    count_query = f"SELECT COUNT(p.id) as count {count_query_from_without_fav_join}{where_clause}"
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
    
    final_params = tuple(params + user_id_param_for_join + [per_page, offset])
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        patches_cursor = db.execute(final_query, final_params)
        patches_list = [dict(row) for row in patches_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated patches: {e} with query {final_query} and params {final_params}")
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

    # Get new filter parameters
    link_type_filter = request.args.get('link_type', type=str)
    created_from_filter = request.args.get('created_from', type=str)
    created_to_filter = request.args.get('created_to', type=str)

    if page <= 0:
        page = 1
    if per_page <= 0:
        per_page = 10
    
    # Mapping for sort_by parameter to actual DB columns including table alias
    allowed_sort_by_map = {
        'id': 'l.id',
        'title': 'l.title',
        'software_name': 's.name',
        'version_name': 'v.version_number', 
        'uploaded_by_username': 'u.username', # Added for sorting by creator
        'created_at': 'l.created_at',
        'updated_at': 'l.updated_at'
        # patch_by_developer is not applicable to links
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'l.title') 

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select_fields = "l.id, l.title, l.description, l.software_id, l.version_id, l.is_external_link, l.url, l.stored_filename, l.original_filename_ref, l.file_size, l.file_type, l.created_by_user_id, u.username as uploaded_by_username, l.created_at, l.updated_by_user_id, upd_u.username as updated_by_username, l.updated_at, s.name as software_name, v.version_number as version_name"
    base_query_from = "FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id LEFT JOIN users u ON l.created_by_user_id = u.id LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id"
    
    params = []
    user_id_param_for_join = []

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_links_api: {e}")

    if user_id:
        base_query_select = f"SELECT {base_query_select_fields}, uf.id AS favorite_id"
        base_query_from += " LEFT JOIN user_favorites uf ON l.id = uf.item_id AND uf.item_type = 'link' AND uf.user_id = ?"
        user_id_param_for_join.append(user_id)
    else:
        base_query_select = f"SELECT {base_query_select_fields}, NULL AS favorite_id"
        
    filter_conditions = []

    if software_id_filter:
        filter_conditions.append("l.software_id = ?")
        params.append(software_id_filter)
    if version_id_filter:
        filter_conditions.append("l.version_id = ?")
        params.append(version_id_filter)

    if link_type_filter:
        if link_type_filter.lower() == 'external':
            filter_conditions.append("l.is_external_link = TRUE")
        elif link_type_filter.lower() == 'uploaded':
            filter_conditions.append("l.is_external_link = FALSE")
            # For 'uploaded', no parameter is added to params for this specific condition
    
    if created_from_filter:
        filter_conditions.append("date(l.created_at) >= date(?)")
        params.append(created_from_filter)
    if created_to_filter:
        filter_conditions.append("date(l.created_at) <= date(?)")
        params.append(created_to_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query_from_without_fav_join = "FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id LEFT JOIN users u ON l.created_by_user_id = u.id LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id"
    count_query = f"SELECT COUNT(l.id) as count {count_query_from_without_fav_join}{where_clause}"
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
    
    final_params = tuple(params + user_id_param_for_join + [per_page, offset])
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        links_cursor = db.execute(final_query, final_params)
        links_list = [dict(row) for row in links_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated links: {e} with query {final_query} and params {final_params}")
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
        'category_name': 'mc.name', 
        'uploaded_by_username': 'u.username', # Added for sorting by creator
        'created_at': 'mf.created_at',
        'file_size': 'mf.file_size',
        'updated_at': 'mf.updated_at'
        # patch_by_developer is not applicable
    }
    
    sort_by_column = allowed_sort_by_map.get(sort_by_param, 'mf.user_provided_title')

    if sort_order not in ['asc', 'desc']:
        sort_order = 'asc'

    # Construct Base Query and Parameters for Filtering
    base_query_select_fields = "mf.id, mf.misc_category_id, mf.user_id, mf.user_provided_title, mf.user_provided_description, mf.original_filename, mf.stored_filename, mf.file_path, mf.file_type, mf.file_size, mf.created_by_user_id, u.username as uploaded_by_username, mf.created_at, mf.updated_by_user_id, upd_u.username as updated_by_username, mf.updated_at, mc.name as category_name"
    base_query_from = "FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id LEFT JOIN users u ON mf.created_by_user_id = u.id LEFT JOIN users upd_u ON mf.updated_by_user_id = upd_u.id"
    
    params = []
    user_id_param_for_join = []

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_misc_files_api: {e}")

    if user_id:
        base_query_select = f"SELECT {base_query_select_fields}, uf.id AS favorite_id"
        base_query_from += " LEFT JOIN user_favorites uf ON mf.id = uf.item_id AND uf.item_type = 'misc_file' AND uf.user_id = ?"
        user_id_param_for_join.append(user_id)
    else:
        base_query_select = f"SELECT {base_query_select_fields}, NULL AS favorite_id"

    filter_conditions = []

    if category_id_filter:
        filter_conditions.append("mf.misc_category_id = ?")
        params.append(category_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Database Query for Total Count
    count_query_from_without_fav_join = "FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id LEFT JOIN users u ON mf.created_by_user_id = u.id LEFT JOIN users upd_u ON mf.updated_by_user_id = upd_u.id"
    count_query = f"SELECT COUNT(mf.id) as count {count_query_from_without_fav_join}{where_clause}"
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
    
    final_params = tuple(params + user_id_param_for_join + [per_page, offset])
    final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        misc_files_cursor = db.execute(final_query, final_params)
        misc_files_list = [dict(row) for row in misc_files_cursor.fetchall()]
    except Exception as e:
        app.logger.error(f"Error fetching paginated misc_files: {e} with query {final_query} and params {final_params}")
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
    current_user_id = int(get_jwt_identity()) # Ensure this is correctly used for created_by_user_id
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
    for field in metadata_fields: # metadata_fields will be adjusted for 'patches' if needed
        form_data[field] = request.form.get(field)
    
    # Special handling for patch_by_developer for 'patches' table
    if table_name == 'patches':
        form_data['patch_by_developer'] = request.form.get('patch_by_developer')

    for fk_name, fk_value in resolved_fks.items():
        form_data[fk_name] = fk_value

    for req_field in required_form_fields: # required_form_fields will be adjusted for 'patches'
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
            new_id = cursor.lastrowid # Get new_id before commit for logging
            app.logger.info(f"_admin_helper: Successfully prepared insert for {table_name}, new ID: {new_id}")

            # Conditional Audit Logging for Misc Files creation
            if table_name == 'misc_files':
                log_audit_action(
                    action_type='CREATE_MISC_FILE',
                    target_table='misc_files',
                    target_id=new_id,
                    details={
                        'title': form_data.get('user_provided_title'), 
                        'filename': original_filename, # original_filename from earlier in the helper
                        'category_id': form_data.get('misc_category_id')
                    }
                    # Actor (admin user) is derived from JWT by default in log_audit_action
                )
            
            db.commit() # Commit after logging if it's specific to this helper's scope

            # --- CORRECTED FETCH-BACK SECTION ---
            fetch_back_query = ""
            if table_name == 'patches':
                 fetch_back_query = """
                    SELECT p.*, s.name as software_name, v.version_number, u.username as uploaded_by_username, p.patch_by_developer
                    FROM patches p
                    JOIN versions v ON p.version_id = v.id
                    JOIN software s ON v.software_id = s.id
                    JOIN users u ON p.created_by_user_id = u.id
                    WHERE p.id = ?"""
            elif table_name == 'links':
                 fetch_back_query = """
                    SELECT l.*, s.name as software_name, v.version_number as version_name, u.username as uploaded_by_username
                    FROM links l
                    JOIN software s ON l.software_id = s.id
                    LEFT JOIN versions v ON l.version_id = v.id
                    JOIN users u ON l.created_by_user_id = u.id
                    WHERE l.id = ?"""
            elif table_name == 'misc_files':
                 fetch_back_query = """
                    SELECT mf.*, mc.name as category_name, u.username as uploaded_by_username
                    FROM misc_files mf
                    JOIN misc_categories mc ON mf.misc_category_id = mc.id
                    JOIN users u ON mf.created_by_user_id = u.id
                    WHERE mf.id = ?"""
            elif table_name == 'documents':
                 fetch_back_query = """
                    SELECT d.*, s.name as software_name, u.username as uploaded_by_username
                    FROM documents d
                    JOIN software s ON d.software_id = s.id
                    JOIN users u ON d.created_by_user_id = u.id
                    WHERE d.id = ?"""
            else:
                # This default is a fallback, but ideally all tables handled by this helper
                # should have specific fetch-back queries if they need joins.
                app.logger.warning(f"_admin_helper: Using default fetch-back query for table {table_name} (no uploaded_by_username). No joins performed.")
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

    # Prepare form_data by extracting relevant fields from the JSON payload (data)
    # This is crucial because sql_params_tuple refers to keys in form_data.
    form_data = {} 
    # Populate form_data with expected fields from data, including patch_by_developer if table is 'patches'
    # This step ensures that 'patch_by_developer' (and other fields) are available if they are in sql_params_tuple.
    for key in data: # Iterate over keys in the input JSON data
        form_data[key] = data[key]

    # Ensure 'patch_by_developer' is in form_data if table_name is 'patches' and it's expected by sql_params_tuple
    if table_name == 'patches' and 'patch_by_developer' not in form_data:
        form_data['patch_by_developer'] = data.get('patch_by_developer') # defaults to None if not in data

    all_present = True
    missing_fields_list = []

    for req_field in required_fields:
        # Check against 'data' (original JSON payload) for required fields, not form_data
        if data.get(req_field) is None or (isinstance(data.get(req_field), str) and str(data.get(req_field)).strip() == ""):
            # Allow 0 for IDs if that's valid
            if not (isinstance(data.get(req_field), int) and data.get(req_field) == 0):
                all_present = False
                missing_fields_list.append(req_field)
    
    if not all_present:
        error_msg = f"Missing one or more required fields: {', '.join(missing_fields_list)}"
        app.logger.warning(f"ADMIN_HELPER_LINK: {error_msg} for table {table_name}. Data: {data}")
        return jsonify(msg=error_msg), 400

    # Convert IDs (example, adapt if more ID fields are used by different tables)
    # Use 'data.get' for these conversions as form_data might not have them if they are not in sql_params_tuple
    # software_id is usually a required_field, so it should be in 'data'
    if 'software_id' in data and data.get('software_id') is not None:
        try: 
            # This conversion is for validation; the actual value used in SQL params comes from form_data
            # which should already have the correct type if it came from JSON.
            # However, if form_data['software_id'] is used later, ensure it's int.
            form_data['software_id'] = int(data['software_id']) 
        except (ValueError, TypeError): return jsonify(msg="Invalid software_id format"), 400
    
    if 'version_id' in data and data.get('version_id') is not None:
        try: 
            form_data['version_id'] = int(data['version_id'])
        except (ValueError, TypeError): return jsonify(msg="Invalid version_id format"), 400


    final_sql_params = []
    for param_name_in_tuple in sql_params_tuple:
        if param_name_in_tuple == 'is_external_link':
            final_sql_params.append(True)
        elif param_name_in_tuple == 'created_by_user_id':
            final_sql_params.append(current_user_id)
        elif param_name_in_tuple == 'updated_by_user_id': # Also set updated_by on creation
            final_sql_params.append(current_user_id)
        elif param_name_in_tuple in form_data: # Check form_data which now contains relevant items from data
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

        # --- MODIFIED FETCH-BACK SECTION for _admin_add_item_with_external_link ---
        fetch_back_query = ""
        # Base select needs to be table-specific to use correct alias for created_by_user_id
        if table_name == 'documents':
            fetch_back_query = "SELECT d.*, u.username as uploaded_by_username FROM documents d JOIN users u ON d.created_by_user_id = u.id WHERE d.id = ?"
        elif table_name == 'patches':
            fetch_back_query = "SELECT p.*, u.username as uploaded_by_username, p.patch_by_developer FROM patches p JOIN users u ON p.created_by_user_id = u.id WHERE p.id = ?"
        elif table_name == 'links':
            fetch_back_query = "SELECT l.*, u.username as uploaded_by_username FROM links l JOIN users u ON l.created_by_user_id = u.id WHERE l.id = ?"
        # misc_files are not typically added via external link, but if a case arises:
        elif table_name == 'misc_files': 
            fetch_back_query = "SELECT mf.*, u.username as uploaded_by_username FROM misc_files mf JOIN users u ON mf.created_by_user_id = u.id WHERE mf.id = ?"
        else: # Fallback, though ideally all relevant tables are covered
            app.logger.warning(f"ADMIN_HELPER_LINK: Using default fetch-back for {table_name} (no uploaded_by_username).")
            fetch_back_query = f"SELECT * FROM {table_name} WHERE id = ?"

        new_item_row = db.execute(fetch_back_query, (new_id,)).fetchone()
        
        if new_item_row:
            new_item = dict(new_item_row)
            # If the table is 'patches', ensure 'patch_by_developer' is in the response if it was selected.
            # The fetch_back_query for 'patches' now includes it.
            app.logger.info(f"ADMIN_HELPER_LINK: Successfully fetched back new item from {table_name}: {new_item}")
            return jsonify(new_item), 201
        else:
            app.logger.error(f"ADMIN_HELPER_LINK: CRITICAL - Failed to fetch newly added item from {table_name} with ID: {new_id} immediately after commit using query: {fetch_back_query}")
            return jsonify(msg=f"Item added to {table_name} (ID: {new_id}) but could not be immediately retrieved with full details. Please refresh the list."), 207

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
    data = request.get_json()
    response = _admin_add_item_with_external_link(
        table_name='documents', data=data,
        required_fields=['software_id', 'doc_name', 'download_link'],
        sql_insert_query="""INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""", 
        # sql_params_tuple should align with the VALUES placeholders, excluding is_external_link (hardcoded TRUE)
        # created_by_user_id and updated_by_user_id are handled by the helper.
        sql_params_tuple=('software_id', 'doc_name', 'download_link', 'description', 'doc_type', 
                           'created_by_user_id', 'updated_by_user_id') 
    )
    if response[1] == 201: # Check if creation was successful
        new_doc_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_DOCUMENT_URL',
            target_table='documents',
            target_id=new_doc_data.get('id'),
            details={
                'doc_name': new_doc_data.get('doc_name'), 
                'url': new_doc_data.get('download_link'), 
                'software_id': new_doc_data.get('software_id')
            }
        )
    return response

@app.route('/api/admin/documents/upload_file', methods=['POST'])
@jwt_required() 
@admin_required
def admin_upload_document_file():
    # Original form data needs to be accessed here for logging before passing to helper
    software_id_val = request.form.get('software_id')
    doc_name_val = request.form.get('doc_name')

    response = _admin_handle_file_upload_and_db_insert(
        table_name='documents',
        upload_folder_config_key='DOC_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/docs',
        metadata_fields=['software_id', 'doc_name', 'description', 'doc_type'],
        required_form_fields=['software_id', 'doc_name'],
        sql_insert_query="""INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                               created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""", # 12 placeholders
        sql_params_tuple=(
            'software_id', 'doc_name', 'download_link_or_url', 'description', 'doc_type', # 5
            # is_external_link is hardcoded FALSE
            'stored_filename', 'original_filename_ref', 'file_size', 'file_type', # 4
            'created_by_user_id', 'updated_by_user_id' # 2 -> Total 11 from tuple, matches placeholders if we exclude is_external_link
        ) # Corrected: download_link_or_url is one param, is_external_link is hardcoded.
          # created_by_user_id and updated_by_user_id are handled by the helper.
    )
    if response[1] == 201: # Check if creation was successful
        new_doc_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_DOCUMENT_FILE',
            target_table='documents',
            target_id=new_doc_data.get('id'),
            details={
                'doc_name': doc_name_val, # Use original form value
                'filename': new_doc_data.get('original_filename_ref'), 
                'software_id': software_id_val # Use original form value
            }
        )
    return response

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
    # Ensure patch_by_developer is explicitly added to data from the JSON payload
    # Ensure patch_by_developer is explicitly added to data from the JSON payload before calling helper
    # The helper's logic for form_data population will pick this up if 'patch_by_developer' is in sql_params_tuple
    data['patch_by_developer'] = data.get('patch_by_developer') # data is request.get_json()
    data.pop('software_id', None) # Clean up, helper doesn't need these if version_id is set
    data.pop('typed_version_string', None)

    response = _admin_add_item_with_external_link(
        table_name='patches',
        data=data, # This data has already been modified to include final_version_id and patch_by_developer
        required_fields=['version_id', 'patch_name', 'download_link'], # patch_by_developer is optional
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date, patch_by_developer,
                                               is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?)""", # 9 placeholders
        sql_params_tuple=(
            'version_id', 'patch_name', 'download_link', 'description', 'release_date', 
            'patch_by_developer', # This is now included
            # is_external_link is hardcoded TRUE
            'created_by_user_id', 'updated_by_user_id' # Handled by helper
        ) # Tuple has 8 elements, matching the non-hardcoded placeholders.
    )
    if response[1] == 201: # Check if creation was successful
        new_patch_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_PATCH_URL',
            target_table='patches',
            target_id=new_patch_data.get('id'),
            details={
                'patch_name': new_patch_data.get('patch_name'), 
                'url': new_patch_data.get('download_link'), 
                'version_id': new_patch_data.get('version_id'),
                'release_date': new_patch_data.get('release_date'),
                'patch_by_developer': new_patch_data.get('patch_by_developer') 
            }
        )
    return response
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
    
    # Original form data for logging
    patch_name_val = request.form.get('patch_name')
    release_date_val = request.form.get('release_date')
    patch_by_developer_val = request.form.get('patch_by_developer') 

    # metadata_fields for _admin_handle_file_upload_and_db_insert should include 'patch_by_developer'
    # The helper will then populate form_data['patch_by_developer'] from request.form
    current_metadata_fields = ['patch_name', 'description', 'release_date', 'patch_by_developer']

    response = _admin_handle_file_upload_and_db_insert(
        table_name='patches',
        upload_folder_config_key='PATCH_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/patches',
        metadata_fields=current_metadata_fields, # Includes 'patch_by_developer'
        required_form_fields=['patch_name'], # patch_by_developer is optional here for form validation
        sql_insert_query="""INSERT INTO patches (version_id, patch_name, download_link, description, release_date, patch_by_developer,
                                             is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                             created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""", # 13 placeholders
        sql_params_tuple=(
            'version_id', # Resolved FK
            'patch_name', 'download_link_or_url', 'description', 'release_date', 
            'patch_by_developer', # Now correctly expected from form_data by the helper
            # is_external_link is hardcoded FALSE
            'stored_filename', 'original_filename_ref', 'file_size', 'file_type', # File details
            'created_by_user_id', 'updated_by_user_id' # User details
        ), # Tuple has 12 elements, matching non-hardcoded placeholders
        resolved_fks={'version_id': final_version_id}
    )
    if response[1] == 201: # Check if creation was successful
        new_patch_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_PATCH_FILE',
            target_table='patches',
            target_id=new_patch_data.get('id'),
            details={
                'patch_name': patch_name_val,
                'filename': new_patch_data.get('original_filename_ref'), 
                'version_id': final_version_id, # Resolved version_id
                'release_date': release_date_val,
                'patch_by_developer': patch_by_developer_val # Added
            }
        )
    return response


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
        # Log details before update
        log_details = {
            'updated_fields': ['doc_name', 'description', 'doc_type', 'download_link', 'software_id', 'is_external_link'],
            'doc_name': doc_name,
            'url': download_link,
            'software_id': software_id,
            'is_external_link': True # Explicitly setting to URL
        }
        # Potentially log old values if desired by fetching 'doc' again or comparing field by field
        # For brevity, logging new values and indicating it's now a URL link.

        db.execute("""
            UPDATE documents
            SET software_id = ?, doc_name = ?, description = ?, doc_type = ?,
                download_link = ?, is_external_link = TRUE, stored_filename = NULL,
                original_filename_ref = NULL, file_size = NULL, file_type = NULL,
                updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (software_id, doc_name, description, doc_type, download_link,
              current_user_id, document_id))
        log_audit_action(
            action_type='UPDATE_DOCUMENT_URL',
            target_table='documents',
            target_id=document_id,
            details=log_details
        )
        db.commit()
        
        updated_doc_row = db.execute("""
            SELECT d.*, s.name as software_name, 
                   cr_u.username as uploaded_by_username, upd_u.username as updated_by_username
            FROM documents d 
            JOIN software s ON d.software_id = s.id
            LEFT JOIN users cr_u ON d.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id
            WHERE d.id = ?
        """, (document_id,)).fetchone()
        if updated_doc_row:
            return jsonify(dict(updated_doc_row)), 200
        else:
            app.logger.error(f"Failed to fetch document with ID {document_id} after edit_url.")
            return jsonify(msg="Document updated but failed to retrieve full details."), 500
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
        action_type = 'UPDATE_DOCUMENT_METADATA'
        log_details = {
            'updated_fields': ['doc_name', 'description', 'doc_type', 'software_id'],
            'doc_name': doc_name,
            'software_id': software_id
        }
        if new_file and new_file.filename != '': # A new file was uploaded
            action_type = 'UPDATE_DOCUMENT_FILE'
            log_details['new_filename'] = new_original_filename
            log_details['updated_fields'].extend(['download_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type', 'is_external_link'])
            log_details['is_external_link'] = False

        db.execute("""
            UPDATE documents
            SET software_id = ?, doc_name = ?, description = ?, doc_type = ?,
                download_link = ?, is_external_link = FALSE, stored_filename = ?,
                original_filename_ref = ?, file_size = ?, file_type = ?,
                updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (software_id, doc_name, description, doc_type,
              new_download_link, new_stored_filename, new_original_filename,
              new_file_size, new_file_type, current_user_id, document_id))
        log_audit_action(
            action_type=action_type,
            target_table='documents',
            target_id=document_id,
            details=log_details
        )
        db.commit()
        
        updated_doc_row = db.execute("""
            SELECT d.*, s.name as software_name, 
                   cr_u.username as uploaded_by_username, upd_u.username as updated_by_username
            FROM documents d 
            JOIN software s ON d.software_id = s.id
            LEFT JOIN users cr_u ON d.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id
            WHERE d.id = ?
        """, (document_id,)).fetchone()
        if updated_doc_row:
            return jsonify(dict(updated_doc_row)), 200
        else:
            app.logger.error(f"Failed to fetch document with ID {document_id} after edit_file.")
            return jsonify(msg="Document updated but failed to retrieve full details."), 500
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
    
    doc = db.execute("SELECT id, doc_name, stored_filename, is_external_link FROM documents WHERE id = ?", (document_id,)).fetchone()
    if not doc:
        return jsonify(msg="Document not found"), 404

    # If it's not an external link and has a stored filename, delete the file
    if not doc['is_external_link'] and doc['stored_filename']:
        file_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], doc['stored_filename'])
        _delete_file_if_exists(file_path) # Helper handles existence check

    try:
        # Log before actual deletion
        log_audit_action(
            action_type='DELETE_DOCUMENT',
            target_table='documents',
            target_id=document_id,
            details={'deleted_doc_name': doc['doc_name'], 'stored_filename': doc['stored_filename'], 'is_external_link': doc['is_external_link']}
        )
        db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted document ID {document_id}") # Existing log
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
            
    # Original form data for logging
    title_val = request.form.get('title')

    response = _admin_handle_file_upload_and_db_insert(
        table_name='links',
        upload_folder_config_key='LINK_UPLOAD_FOLDER',
        server_path_prefix='/official_uploads/links',
        metadata_fields=['software_id', 'title', 'description'], 
        required_form_fields=['software_id', 'version_id', 'title'], 
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                           created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)""", # 12 placeholders
        sql_params_tuple=( 
            'software_id', 'version_id', # Resolved FKs
            'title', 'download_link_or_url', 'description', # Basic info + URL placeholder
            # is_external_link is hardcoded FALSE
            'stored_filename', 'original_filename_ref', 'file_size', 'file_type', # File details
            'created_by_user_id', 'updated_by_user_id' # User details
        ), # Tuple has 11 elements, matching non-hardcoded placeholders
        resolved_fks={'version_id': final_version_id_for_db, 'software_id': software_id} # Pass software_id as resolved FK
    )
    if response[1] == 201: # Check if creation was successful
        new_link_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_LINK_FILE',
            target_table='links',
            target_id=new_link_data.get('id'),
            details={
                'title': title_val, 
                'filename': new_link_data.get('original_filename_ref'), 
                'software_id': software_id, # software_id resolved earlier
                'version_id': final_version_id_for_db
            }
        )
    return response

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
    patch_by_developer = data.get('patch_by_developer', patch['patch_by_developer']) 

    # Basic validation for required fields during edit
    if not patch_name or not download_link: # software_id/version handled above
        return jsonify(msg="Patch name and download link are required for edit."), 400

    if not patch['is_external_link'] and patch['stored_filename']:
        _delete_file_if_exists(os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename']))

    try:
        log_details = {
            'updated_fields': [], # Will be populated based on actual changes
            'version_id': final_version_id,
            'patch_name': patch_name,
            'url': download_link,
            'release_date': release_date,
            'patch_by_developer': patch_by_developer, # Ensure it's in the log
            'is_external_link': True
        }
        # Populate updated_fields in log_details
        if final_version_id != patch['version_id']: log_details['updated_fields'].append('version_id')
        if patch_name != patch['patch_name']: log_details['updated_fields'].append('patch_name')
        if description != patch['description']: log_details['updated_fields'].append('description') # Not explicitly in details, but good to track field changes
        if release_date != patch['release_date']: log_details['updated_fields'].append('release_date')
        if download_link != patch['download_link']: log_details['updated_fields'].append('download_link')
        if patch_by_developer != patch['patch_by_developer']: log_details['updated_fields'].append('patch_by_developer')
        if not patch['is_external_link']: log_details['updated_fields'].append('is_external_link') # Becoming external

        db.execute("""
            UPDATE patches SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
            download_link = ?, patch_by_developer = ?, is_external_link = TRUE, stored_filename = NULL,
            original_filename_ref = NULL, file_size = NULL, file_type = NULL,
            updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (final_version_id, patch_name, description, release_date, download_link, patch_by_developer,
             current_user_id, patch_id_from_url))
        log_audit_action(
            action_type='UPDATE_PATCH_URL',
            target_table='patches',
            target_id=patch_id_from_url,
            details=log_details
        )
        db.commit()
        # Fetch back with JOINs for consistent response, including created_by and updated_by usernames
        updated_item_row = db.execute("""
            SELECT p.*, s.name as software_name, v.version_number, 
                   cr_u.username as uploaded_by_username, upd_u.username as updated_by_username
            FROM patches p
            JOIN versions v ON p.version_id = v.id
            JOIN software s ON v.software_id = s.id
            LEFT JOIN users cr_u ON p.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id
            WHERE p.id = ?""", (patch_id_from_url,)).fetchone()
        
        if updated_item_row:
            return jsonify(dict(updated_item_row)), 200
        else:
            # This case should ideally not be reached if the update was successful.
            app.logger.error(f"Failed to fetch patch with ID {patch_id_from_url} after edit_url.")
            return jsonify(msg="Patch updated but failed to retrieve full details."), 500
            
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
    # Retrieve patch_by_developer from form, defaulting to existing if not provided in form
    patch_by_developer = request.form.get('patch_by_developer', patch['patch_by_developer'])


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
        action_type_log = 'UPDATE_PATCH_METADATA'
        log_details = {
            'updated_fields': ['version_id', 'patch_name', 'description', 'release_date', 'patch_by_developer'],
            'version_id': final_version_id,
            'patch_name': patch_name,
            'release_date': release_date,
            'patch_by_developer': patch_by_developer
        }
        if new_physical_file and new_physical_file.filename != '':
            action_type_log = 'UPDATE_PATCH_FILE'
            log_details['new_filename'] = new_original_filename
            log_details['updated_fields'].extend(['download_link', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type', 'is_external_link'])
            log_details['is_external_link'] = False


        db.execute("""
            UPDATE patches SET version_id = ?, patch_name = ?, description = ?, release_date = ?,
            download_link = ?, patch_by_developer = ?, is_external_link = FALSE, stored_filename = ?,
            original_filename_ref = ?, file_size = ?, file_type = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (final_version_id, patch_name, description, release_date, new_download_link,
             patch_by_developer, new_stored_filename, new_original_filename, new_file_size, new_file_type,
             current_user_id, patch_id))
        log_audit_action(
            action_type=action_type_log,
            target_table='patches',
            target_id=patch_id,
            details=log_details
        )
        db.commit()
        # Fetch back with JOINs for consistent response, including created_by and updated_by usernames
        updated_item_row = db.execute(
            """SELECT p.*, s.name as software_name, v.version_number, 
                      cr_u.username as uploaded_by_username, upd_u.username as updated_by_username
               FROM patches p 
               JOIN versions v ON p.version_id = v.id 
               JOIN software s ON v.software_id = s.id
               LEFT JOIN users cr_u ON p.created_by_user_id = cr_u.id
               LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id
               WHERE p.id = ?""", 
            (patch_id,)
        ).fetchone()

        if updated_item_row:
            return jsonify(dict(updated_item_row)), 200
        else:
            # This case should ideally not be reached if the update was successful.
            app.logger.error(f"Failed to fetch patch with ID {patch_id} after edit_file.")
            return jsonify(msg="Patch updated but failed to retrieve full details."), 500
            
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
    patch = db.execute("SELECT id, patch_name, stored_filename, is_external_link FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch:
        return jsonify(msg="Patch not found"), 404

    if not patch['is_external_link'] and patch['stored_filename']:
        file_path = os.path.join(app.config['PATCH_UPLOAD_FOLDER'], patch['stored_filename'])
        _delete_file_if_exists(file_path)

    try:
        log_audit_action(
            action_type='DELETE_PATCH',
            target_table='patches',
            target_id=patch_id,
            details={'deleted_patch_name': patch['patch_name'], 'stored_filename': patch['stored_filename'], 'is_external_link': patch['is_external_link']}
        )
        db.execute("DELETE FROM patches WHERE id = ?", (patch_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted patch ID {patch_id}") # Existing log
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
        new_category_id = cursor.lastrowid
        log_audit_action(
            action_type='CREATE_MISC_CATEGORY',
            target_table='misc_categories',
            target_id=new_category_id,
            details={'name': name, 'description': description}
        )
        db.commit()
        new_cat_cursor = db.execute("SELECT * FROM misc_categories WHERE id = ?", (new_category_id,))
        return jsonify(dict(new_cat_cursor.fetchone())), 201
    except sqlite3.IntegrityError: 
        db.rollback() 
        return jsonify(msg=f"Misc category '{name}' likely already exists."), 409
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
        log_details = {
            'updated_fields': ['software_id', 'version_id', 'title', 'description', 'url', 'is_external_link'],
            'title': title,
            'url': url,
            'software_id': software_id_for_link,
            'version_id': final_version_id_for_db,
            'is_external_link': True
        }
        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = TRUE, stored_filename = NULL, original_filename_ref = NULL,
            file_size = NULL, file_type = NULL, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, url,
             current_user_id, link_id_from_url))
        log_audit_action(
            action_type='UPDATE_LINK_URL',
            target_table='links',
            target_id=link_id_from_url,
            details=log_details
        )
        db.commit()
        # Fetch back with JOINs for consistent response
        updated_item_dict = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number
            FROM links l
            JOIN software s ON l.software_id = s.id
            JOIN versions v ON l.version_id = v.id
            LEFT JOIN users cr_u ON l.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id
            WHERE l.id = ?""", (link_id_from_url,)).fetchone()
        
        if updated_item_dict:
            response_data = dict(updated_item_dict)
            # Ensure uploaded_by_username (creator) and updated_by_username (editor) are distinct if needed
            # The query aliases cr_u.username to uploaded_by_username and upd_u.username to updated_by_username
            return jsonify(response_data), 200
        else:
            app.logger.error(f"Failed to fetch link with ID {link_id_from_url} after edit_url.")
            return jsonify(msg="Link updated but failed to retrieve full details."), 500
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
        action_type_log = 'UPDATE_LINK_METADATA'
        log_details = {
            'updated_fields': ['software_id', 'version_id', 'title', 'description'],
            'title': title,
            'software_id': software_id_for_link,
            'version_id': final_version_id_for_db
        }
        if new_physical_file and new_physical_file.filename != '':
            action_type_log = 'UPDATE_LINK_FILE'
            log_details['new_filename'] = new_original_filename
            log_details['updated_fields'].extend(['url', 'stored_filename', 'original_filename_ref', 'file_size', 'file_type', 'is_external_link'])
            log_details['is_external_link'] = False

        db.execute("""
            UPDATE links SET software_id = ?, version_id = ?, title = ?, description = ?, url = ?,
            is_external_link = FALSE, stored_filename = ?, original_filename_ref = ?,
            file_size = ?, file_type = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (software_id_for_link, final_version_id_for_db, title, description, new_url, new_stored_filename,
             new_original_filename, new_file_size, new_file_type, current_user_id, link_id_from_url))
        log_audit_action(
            action_type=action_type_log,
            target_table='links',
            target_id=link_id_from_url,
            details=log_details
        )
        db.commit()
        updated_item_dict = db.execute("""
            SELECT l.*, s.name as software_name, v.version_number 
            FROM links l
            JOIN software s ON l.software_id = s.id
            JOIN versions v ON l.version_id = v.id
            LEFT JOIN users cr_u ON l.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id
            WHERE l.id = ?""", (link_id_from_url,)).fetchone()

        if updated_item_dict:
            return jsonify(dict(updated_item_dict)), 200
        else:
            app.logger.error(f"Failed to fetch link with ID {link_id_from_url} after edit_file.")
            return jsonify(msg="Link updated but failed to retrieve full details."), 500
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
    link_item = db.execute("SELECT id, title, stored_filename, is_external_link FROM links WHERE id = ?", (link_id,)).fetchone()
    if not link_item:
        return jsonify(msg="Link not found"), 404

    if not link_item['is_external_link'] and link_item['stored_filename']:
        file_path = os.path.join(app.config['LINK_UPLOAD_FOLDER'], link_item['stored_filename'])
        _delete_file_if_exists(file_path)

    try:
        log_audit_action(
            action_type='DELETE_LINK',
            target_table='links',
            target_id=link_id,
            details={'deleted_title': link_item['title'], 'stored_filename': link_item['stored_filename'], 'is_external_link': link_item['is_external_link']}
        )
        db.execute("DELETE FROM links WHERE id = ?", (link_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted link ID {link_id}") # Existing log
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
        old_name = category['name']
        old_description = category['description']
        
        db.execute("""
            UPDATE misc_categories
            SET name = ?, description = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (name, description, current_user_id, category_id))
        log_audit_action(
            action_type='UPDATE_MISC_CATEGORY',
            target_table='misc_categories',
            target_id=category_id,
            details={
                'old_name': old_name, 
                'new_name': name, 
                'old_description': old_description, 
                'new_description': description,
                'updated_fields': ['name', 'description'] # Assuming both can always be updated
            }
        )
        db.commit()
        updated_category_row = db.execute("""
            SELECT mc.*, cr_u.username as created_by_username, upd_u.username as updated_by_username
            FROM misc_categories mc
            LEFT JOIN users cr_u ON mc.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON mc.updated_by_user_id = upd_u.id
            WHERE mc.id = ?
        """, (category_id,)).fetchone()
        if updated_category_row:
            return jsonify(dict(updated_category_row)), 200
        else:
            app.logger.error(f"Failed to fetch misc_category with ID {category_id} after edit.")
            return jsonify(msg="Misc category updated but failed to retrieve full details."), 500
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
    category = db.execute("SELECT * FROM misc_categories WHERE id = ?", (category_id,)).fetchone()
    if not category:
        return jsonify(msg="Misc category not found"), 404

    # Check if there are any misc_files associated with this category
    files_in_category = db.execute("SELECT COUNT(*) as count FROM misc_files WHERE misc_category_id = ?", (category_id,)).fetchone()
    if files_in_category and files_in_category['count'] > 0:
        return jsonify(msg=f"Cannot delete category: {files_in_category['count']} file(s) still exist in it. Please delete or move them first."), 409 # 409 Conflict

    try:
        # Ensure category details are fetched before deletion for logging
        deleted_category_name = category['name']

        db.execute("DELETE FROM misc_categories WHERE id = ?", (category_id,))
        log_audit_action(
            action_type='DELETE_MISC_CATEGORY',
            target_table='misc_categories',
            target_id=category_id,
            details={'deleted_category_name': deleted_category_name}
        )
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted misc category ID {category_id}") # Existing log
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
        changed_fields = []
        log_details = {'changed_fields': changed_fields} 

        if misc_category_id != misc_file_item['misc_category_id']:
            changed_fields.append('misc_category_id')
            log_details['old_category_id'] = misc_file_item['misc_category_id']
            log_details['new_category_id'] = misc_category_id
        if user_provided_title != misc_file_item['user_provided_title']:
            changed_fields.append('user_provided_title')
            log_details['old_title'] = misc_file_item['user_provided_title']
            log_details['new_title'] = user_provided_title
        if user_provided_description != misc_file_item['user_provided_description']:
            changed_fields.append('user_provided_description')
            log_details['description_changed'] = True 
        
        action_type_log = 'UPDATE_MISC_FILE_METADATA'
        if new_physical_file and new_physical_file.filename != '': 
            action_type_log = 'UPDATE_MISC_FILE_UPLOAD' 
            changed_fields.append('file_content') 
            log_details['old_original_filename'] = misc_file_item['original_filename']
            log_details['new_original_filename'] = new_original_filename
        
        # Log original filename change even if it's a metadata update but original_filename field changed
        # This can happen if user_provided_title was empty and new_original_filename became the title
        if not (new_physical_file and new_physical_file.filename != '') and \
           new_original_filename != misc_file_item['original_filename']:
            changed_fields.append('original_filename')
            log_details['old_original_filename'] = misc_file_item['original_filename']
            log_details['new_original_filename'] = new_original_filename


        db.execute("""
            UPDATE misc_files
            SET misc_category_id = ?, user_provided_title = ?, user_provided_description = ?,
                original_filename = ?, stored_filename = ?, file_path = ?,
                file_type = ?, file_size = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (misc_category_id, user_provided_title, user_provided_description,
              new_original_filename, new_stored_filename, new_file_path,
              new_file_type, new_file_size, current_user_id, file_id))
        
        if changed_fields: 
            log_audit_action(
                action_type=action_type_log,
                target_table='misc_files',
                target_id=file_id,
                details=log_details
            )
        db.commit()

        # Fetch back with JOINs for consistent response, including created_by (uploaded_by_username)
        updated_file_row = db.execute("""
            SELECT mf.*, mc.name as category_name, 
                   cr_u.username as uploaded_by_username, upd_u.username as updated_by_username
            FROM misc_files mf
            JOIN misc_categories mc ON mf.misc_category_id = mc.id
            LEFT JOIN users cr_u ON mf.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON mf.updated_by_user_id = upd_u.id
            WHERE mf.id = ?
        """, (file_id,)).fetchone()
        
        if updated_file_row:
            return jsonify(dict(updated_file_row)), 200
        else:
            app.logger.error(f"Failed to fetch misc_file with ID {file_id} after edit.")
            return jsonify(msg="Misc file updated but failed to retrieve full details."),500

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
    misc_file_item = db.execute("SELECT * FROM misc_files WHERE id = ?", (file_id,)).fetchone() # Fetch all needed fields
    if not misc_file_item:
        return jsonify(msg="Misc file not found"), 404

    # Delete the physical file from MISC_UPLOAD_FOLDER
    physical_file_path = os.path.join(app.config['MISC_UPLOAD_FOLDER'], misc_file_item['stored_filename'])
    _delete_file_if_exists(physical_file_path)

    try:
        # Log before actual deletion
        log_audit_action(
            action_type='DELETE_MISC_FILE',
            target_table='misc_files',
            target_id=file_id,
            details={
                'deleted_title': misc_file_item['user_provided_title'], 
                'stored_filename': misc_file_item['stored_filename'], 
                'category_id': misc_file_item['misc_category_id']
            }
        )
        db.execute("DELETE FROM misc_files WHERE id = ?", (file_id,))
        db.commit()
        app.logger.info(f"Admin user {current_user_id} deleted misc file ID {file_id} (physical file: {misc_file_item['stored_filename']})") # Existing Log
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
    # This route now directly calls _admin_handle_file_upload_and_db_insert
    # The audit logging for 'CREATE_MISC_FILE' is handled within _admin_handle_file_upload_and_db_insert
    sql_query = """INSERT INTO misc_files (misc_category_id, user_id, user_provided_title, user_provided_description,
                                        original_filename, stored_filename, file_path, file_type, file_size,
                                        created_by_user_id, updated_by_user_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
    sql_params_order = ('misc_category_id', 'user_id', 'user_provided_title', 'user_provided_description',
                        'original_filename', 'stored_filename', 'download_link_or_url', 'file_type', 'file_size',
                        'created_by_user_id', 'updated_by_user_id')

    return _admin_handle_file_upload_and_db_insert(
        table_name='misc_files', upload_folder_config_key='MISC_UPLOAD_FOLDER', server_path_prefix='/misc_uploads',
        metadata_fields=['misc_category_id', 'user_provided_title', 'user_provided_description'],
        required_form_fields=['misc_category_id', 'file'],
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

    response = _admin_add_item_with_external_link(
        table_name='links',
        data=data, # This data has already been modified to include final_version_id_for_db
        required_fields=['software_id', 'version_id', 'title', 'url'],
        sql_insert_query="""INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)""", # 8 placeholders
        sql_params_tuple=(
            'software_id', 'version_id', 'title', 'url', 'description',
            # is_external_link is hardcoded TRUE
            'created_by_user_id', 'updated_by_user_id' # Handled by helper
        ) # Tuple has 7 elements, matching non-hardcoded placeholders
    )
    if response[1] == 201: # Check if creation was successful
        new_link_data = response[0].get_json()
        log_audit_action(
            action_type='CREATE_LINK_URL',
            target_table='links',
            target_id=new_link_data.get('id'),
            details={
                'title': new_link_data.get('title'), 
                'url': new_link_data.get('url'), 
                'software_id': new_link_data.get('software_id'),
                'version_id': new_link_data.get('version_id')
            }
        )
    return response

# --- Software Version Management Endpoints (Admin) ---
@app.route('/api/admin/versions', methods=['POST'])
@jwt_required()
@admin_required
def admin_create_version():
    current_user_id = int(get_jwt_identity())
    db = get_db()
    data = request.get_json()

    if not data:
        return jsonify(msg="Missing JSON data"), 400

    software_id = data.get('software_id')
    version_number = data.get('version_number')

    if not software_id or not isinstance(software_id, int):
        return jsonify(msg="software_id (integer) is required."), 400
    if not version_number or not isinstance(version_number, str) or not version_number.strip():
        return jsonify(msg="version_number (string) is required."), 400
    
    version_number = version_number.strip()

    # Optional fields
    release_date = data.get('release_date') # Should be 'YYYY-MM-DD' or None
    main_download_link = data.get('main_download_link')
    changelog = data.get('changelog')
    known_bugs = data.get('known_bugs')

    # Validate release_date format if provided (basic check)
    if release_date:
        try:
            datetime.strptime(release_date, '%Y-%m-%d')
        except ValueError:
            return jsonify(msg="Invalid release_date format. Expected YYYY-MM-DD."), 400

    try:
        cursor = db.execute("""
            INSERT INTO versions (software_id, version_number, release_date, main_download_link, changelog, known_bugs, created_by_user_id, updated_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (software_id, version_number, release_date, main_download_link, changelog, known_bugs, current_user_id, current_user_id))
        new_version_id = cursor.lastrowid
        log_audit_action(
            action_type='CREATE_VERSION',
            target_table='versions',
            target_id=new_version_id,
            details={
                'software_id': software_id,
                'version_number': version_number,
                'release_date': release_date
            }
        )
        db.commit()
        

        # Fetch the newly created version with software_name
        new_version_row = db.execute("""
            SELECT v.*, s.name as software_name
            FROM versions v
            JOIN software s ON v.software_id = s.id
            WHERE v.id = ?
        """, (new_version_id,)).fetchone()

        if not new_version_row:
            # This should ideally not happen if insert was successful
            app.logger.error(f"Failed to fetch newly created version ID {new_version_id}")
            return jsonify(msg="Version created but failed to retrieve."), 500

        return jsonify(dict(new_version_row)), 201

    except sqlite3.IntegrityError as e:
        db.rollback()
        if "FOREIGN KEY constraint failed" in str(e):
            # Check if software_id exists
            software_exists = db.execute("SELECT 1 FROM software WHERE id = ?", (software_id,)).fetchone()
            if not software_exists:
                return jsonify(msg=f"Error: Software with ID {software_id} does not exist."), 400
        elif "UNIQUE constraint failed: versions.software_id, versions.version_number" in str(e): # Assuming this constraint exists
            return jsonify(msg=f"Error: Version '{version_number}' already exists for software ID {software_id}."), 409
        app.logger.error(f"Admin create version DB IntegrityError: {e} for software_id={software_id}, version='{version_number}'")
        return jsonify(msg=f"Database integrity error: {e}"), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Admin create version Exception: {e}")
        return jsonify(msg="Server error creating version."), 500

@app.route('/api/admin/versions', methods=['GET'])
@jwt_required()
@admin_required
def admin_list_versions():
    try: # Outer try block starts here
        db = get_db()

        # Get and validate query parameters
        # CORRECTED INDENTATION for all lines below
        page = request.args.get('page', default=1, type=int)
        per_page = request.args.get('per_page', default=10, type=int)
        sort_by_param = request.args.get('sort_by', default='version_number', type=str)
        sort_order = request.args.get('sort_order', default='asc', type=str).lower()
        software_id_filter = request.args.get('software_id', type=int)

        if page <= 0: page = 1
        if per_page <= 0: per_page = 10
        if per_page > 100: per_page = 100 # Max per page limit

        allowed_sort_by_map = {
            'id': 'v.id',
            'software_name': 's.name',
            'version_number': 'v.version_number',
            'release_date': 'v.release_date',
        'patch_by_developer': 'p.patch_by_developer',
        'uploaded_by_username': 'u.username',
            'created_at': 'v.created_at',
            'updated_at': 'v.updated_at'
        }
        sort_by_column = allowed_sort_by_map.get(sort_by_param, 'v.version_number')

        if sort_order not in ['asc', 'desc']:
            sort_order = 'asc'

        # Construct Base Query and Parameters for Filtering
        base_query_select = "SELECT v.id, v.software_id, v.version_number, v.release_date, v.main_download_link, v.changelog, v.known_bugs, v.created_by_user_id, v.created_at, v.updated_by_user_id, v.updated_at, s.name as software_name"
        base_query_from = "FROM versions v JOIN software s ON v.software_id = s.id"

        filter_conditions = []
        params = []

        if software_id_filter is not None: # Check for None explicitly for integers
            filter_conditions.append("v.software_id = ?")
            params.append(software_id_filter)

        where_clause = ""
        if filter_conditions:
            where_clause = " WHERE " + " AND ".join(filter_conditions)

        # Database Query for Total Count
        count_query = f"SELECT COUNT(v.id) as count {base_query_from}{where_clause}"
        try:
            total_versions_cursor = db.execute(count_query, tuple(params))
            total_versions_result = total_versions_cursor.fetchone()
            if total_versions_result is None:
                app.logger.error("Failed to fetch total version count: query returned None.")
                return jsonify(msg="Error fetching version count: No result from count query."), 500
            total_versions = total_versions_result['count']
        except sqlite3.Error as e: # Be specific with database errors if possible
            app.logger.error(f"Database error fetching total version count: {e}")
            return jsonify(msg=f"Database error fetching version count: {e}"), 500
        except KeyError:
            app.logger.error("Failed to fetch total version count: 'count' key missing.")
            return jsonify(msg="Error fetching version count: Malformed count query result."), 500


        total_pages = math.ceil(total_versions / per_page) if total_versions > 0 else 1
        offset = (page - 1) * per_page

        if page > total_pages and total_versions > 0:
            page = total_pages
            offset = (page - 1) * per_page

        final_query = f"{base_query_select} {base_query_from}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"

        paginated_params = list(params) # Create a new list for these params
        paginated_params.extend([per_page, offset])

        try:
            versions_cursor = db.execute(final_query, tuple(paginated_params))
            versions_list = [dict(row) for row in versions_cursor.fetchall()]
        except sqlite3.Error as e: # Be specific with database errors if possible
            app.logger.error(f"Database error fetching paginated versions: {e}")
            return jsonify(msg=f"Database error fetching versions: {e}"), 500

        return jsonify({
            "versions": versions_list,
            "page": page,
            "per_page": per_page,
            "total_versions": total_versions,
            "total_pages": total_pages
        }), 200

    # This except block now correctly corresponds to the outer try
    except Exception as e:
        app.logger.error(f"Unexpected error in admin_list_versions: {e}", exc_info=True)
        return jsonify(error="Failed to retrieve software versions", details=str(e)), 500
    
@app.route('/api/admin/versions/<int:version_id>', methods=['GET'])
@jwt_required()
@admin_required
def admin_get_version_by_id(version_id):
    db = get_db()
    version_row = db.execute("""
        SELECT v.*, s.name as software_name
        FROM versions v
        JOIN software s ON v.software_id = s.id
        WHERE v.id = ?
    """, (version_id,)).fetchone()

    if not version_row:
        return jsonify(msg=f"Version with ID {version_id} not found."), 404
    
    return jsonify(dict(version_row)), 200

@app.route('/api/admin/versions/<int:version_id>', methods=['PUT'])
@jwt_required()
@admin_required
def admin_update_version(version_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()

    # Fetch existing version
    existing_version = db.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()
    if not existing_version:
        return jsonify(msg=f"Version with ID {version_id} not found."), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data for update"), 400

    # Prepare fields for update, defaulting to existing values if not provided
    software_id = data.get('software_id', existing_version['software_id'])
    version_number = data.get('version_number', existing_version['version_number'])
    release_date = data.get('release_date', existing_version['release_date'])
    main_download_link = data.get('main_download_link', existing_version['main_download_link'])
    changelog = data.get('changelog', existing_version['changelog'])
    known_bugs = data.get('known_bugs', existing_version['known_bugs'])

    if not isinstance(software_id, int):
        return jsonify(msg="software_id must be an integer."), 400
    if not isinstance(version_number, str) or not version_number.strip():
        return jsonify(msg="version_number must be a non-empty string."), 400
    version_number = version_number.strip()
    
    if release_date and not isinstance(release_date, str): # Allow None
         return jsonify(msg="release_date must be a string in YYYY-MM-DD format or null."), 400
    if release_date:
        try:
            datetime.strptime(release_date, '%Y-%m-%d')
        except ValueError:
            return jsonify(msg="Invalid release_date format. Expected YYYY-MM-DD."), 400
    
    # Nullable fields can be explicitly set to null or empty string by client
    # If client sends empty string for a nullable text field, store it as such or convert to NULL based on preference.
    # Here, we store as provided (empty string or null from JSON).
    
    updated_fields_details = {}
    if software_id != existing_version['software_id']: updated_fields_details['software_id'] = {'old': existing_version['software_id'], 'new': software_id}
    if version_number != existing_version['version_number']: updated_fields_details['version_number'] = {'old': existing_version['version_number'], 'new': version_number}
    if release_date != existing_version['release_date']: updated_fields_details['release_date'] = {'old': existing_version['release_date'], 'new': release_date}
    if main_download_link != existing_version['main_download_link']: updated_fields_details['main_download_link'] = {'old': existing_version['main_download_link'], 'new': main_download_link}
    if changelog != existing_version['changelog']: updated_fields_details['changelog_changed'] = True # Avoid logging long strings
    if known_bugs != existing_version['known_bugs']: updated_fields_details['known_bugs_changed'] = True # Avoid logging long strings


    try:
        db.execute("""
            UPDATE versions
            SET software_id = ?, version_number = ?, release_date = ?, 
                main_download_link = ?, changelog = ?, known_bugs = ?,
                updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (software_id, version_number, release_date, main_download_link, changelog, known_bugs,
              current_user_id, version_id))
        
        if updated_fields_details: # Only log if something actually changed
            log_audit_action(
                action_type='UPDATE_VERSION',
                target_table='versions',
                target_id=version_id,
                details=updated_fields_details
            )
        db.commit()

        # Fetch the updated version with software_name, created_by_username, and updated_by_username
        updated_version_row = db.execute("""
            SELECT v.*, s.name as software_name, 
                   cr_u.username as created_by_username, upd_u.username as updated_by_username
            FROM versions v
            JOIN software s ON v.software_id = s.id
            LEFT JOIN users cr_u ON v.created_by_user_id = cr_u.id
            LEFT JOIN users upd_u ON v.updated_by_user_id = upd_u.id
            WHERE v.id = ?
        """, (version_id,)).fetchone()

        if not updated_version_row: # Should not happen if update was successful on existing ID
            app.logger.error(f"Failed to fetch updated version ID {version_id} after PUT.")
            return jsonify(msg="Version updated but failed to retrieve."), 500
            
        return jsonify(dict(updated_version_row)), 200

    except sqlite3.IntegrityError as e:
        db.rollback()
        if "FOREIGN KEY constraint failed" in str(e):
            software_exists = db.execute("SELECT 1 FROM software WHERE id = ?", (software_id,)).fetchone()
            if not software_exists:
                return jsonify(msg=f"Error: Software with ID {software_id} does not exist."), 400
        elif "UNIQUE constraint failed: versions.software_id, versions.version_number" in str(e):
             return jsonify(msg=f"Error: Version '{version_number}' already exists for software ID {software_id}."), 409
        app.logger.error(f"Admin update version DB IntegrityError: {e}")
        return jsonify(msg=f"Database integrity error: {e}"), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Admin update version Exception: {e}")
        return jsonify(msg="Server error updating version."), 500

@app.route('/api/admin/versions/<int:version_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def admin_delete_version(version_id):
    db = get_db()

    # Fetch version details before deletion for logging
    version_to_delete = db.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()
    if not version_to_delete:
        return jsonify(msg=f"Version with ID {version_id} not found."), 404

    # Check for references in patches table
    patches_ref = db.execute("SELECT COUNT(*) as count FROM patches WHERE version_id = ?", (version_id,)).fetchone()
    if patches_ref and patches_ref['count'] > 0:
        return jsonify(msg=f"Cannot delete version: It is referenced by {patches_ref['count']} existing patch(es)."), 409

    # Check for references in links table
    links_ref = db.execute("SELECT COUNT(*) as count FROM links WHERE version_id = ?", (version_id,)).fetchone()
    if links_ref and links_ref['count'] > 0:
        return jsonify(msg=f"Cannot delete version: It is referenced by {links_ref['count']} existing link(s)."), 409
    
    try:
        log_audit_action(
            action_type='DELETE_VERSION',
            target_table='versions',
            target_id=version_id,
            details={
                'deleted_version_number': version_to_delete['version_number'], 
                'software_id': version_to_delete['software_id']
            }
        )
        db.execute("DELETE FROM versions WHERE id = ?", (version_id,))
        db.commit()
        app.logger.info(f"Admin user {get_jwt_identity()} deleted version ID {version_id}")
        return jsonify(msg="Version deleted successfully."), 200
    except sqlite3.Error as e: # Catch any SQLite error during delete, though FKs are checked above
        db.rollback()
        app.logger.error(f"Error deleting version ID {version_id}: {e}")
        return jsonify(msg=f"Database error while deleting version: {e}"), 500

# --- File Serving Endpoints ---
@app.route('/official_uploads/docs/<path:filename>')
def serve_official_doc_file(filename):
    try:
        db_conn = get_db() # Get DB connection
        _log_download_activity(filename, 'document', db_conn)
    except Exception as e:
        # Log any error from get_db() or the call itself, but do not prevent file serving
        app.logger.error(f"Error during pre-download logging for doc '{filename}': {e}")
    
    return send_from_directory(app.config['DOC_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/official_uploads/patches/<path:filename>')
def serve_official_patch_file(filename):
    try:
        db_conn = get_db()
        _log_download_activity(filename, 'patch', db_conn)
    except Exception as e:
        app.logger.error(f"Error during pre-download logging for patch '{filename}': {e}")
    return send_from_directory(app.config['PATCH_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/official_uploads/links/<path:filename>') # For files uploaded as "Links"
def serve_official_link_file(filename):
    try:
        db_conn = get_db()
        _log_download_activity(filename, 'link_file', db_conn) # 'link_file' as per previous definition
    except Exception as e:
        app.logger.error(f"Error during pre-download logging for link file '{filename}': {e}")
    return send_from_directory(app.config['LINK_UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/misc_uploads/<path:filename>')
def serve_misc_file(filename):
    try:
        db_conn = get_db()
        _log_download_activity(filename, 'misc_file', db_conn)
    except Exception as e:
        app.logger.error(f"Error during pre-download logging for misc file '{filename}': {e}")
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

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in search: {e}")

    # Documents
    sql_documents_select = "SELECT d.id, d.doc_name AS name, d.description, 'document' AS type"
    sql_documents_from = "FROM documents d"
    doc_params = [like_query_term, like_query_term]
    if user_id:
        sql_documents_select += ", uf.id AS favorite_id"
        sql_documents_from += " LEFT JOIN user_favorites uf ON d.id = uf.item_id AND uf.item_type = 'document' AND uf.user_id = ?"
        doc_params.append(user_id)
    sql_documents = f"{sql_documents_select} {sql_documents_from} WHERE (LOWER(d.doc_name) LIKE ? OR LOWER(d.description) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_documents, tuple(doc_params)).fetchall()])

    # Patches
    sql_patches_select = "SELECT p.id, p.patch_name AS name, p.description, 'patch' AS type"
    sql_patches_from = "FROM patches p"
    patch_params = [like_query_term, like_query_term]
    if user_id:
        sql_patches_select += ", uf.id AS favorite_id"
        sql_patches_from += " LEFT JOIN user_favorites uf ON p.id = uf.item_id AND uf.item_type = 'patch' AND uf.user_id = ?"
        patch_params.append(user_id)
    sql_patches = f"{sql_patches_select} {sql_patches_from} WHERE (LOWER(p.patch_name) LIKE ? OR LOWER(p.description) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_patches, tuple(patch_params)).fetchall()])

    # Links
    sql_links_select = "SELECT l.id, l.title AS name, l.description, l.url, l.is_external_link, l.stored_filename, 'link' AS type" # Added is_external_link and stored_filename
    sql_links_from = "FROM links l"
    link_params = [like_query_term, like_query_term, like_query_term]
    if user_id:
        sql_links_select += ", uf.id AS favorite_id"
        sql_links_from += " LEFT JOIN user_favorites uf ON l.id = uf.item_id AND uf.item_type = 'link' AND uf.user_id = ?"
        link_params.append(user_id)
    sql_links = f"{sql_links_select} {sql_links_from} WHERE (LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ? OR LOWER(l.url) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_links, tuple(link_params)).fetchall()])

    # Misc Files
    sql_misc_files_select = "SELECT mf.id, mf.user_provided_title AS name, mf.original_filename, mf.user_provided_description AS description, mf.stored_filename, 'misc_file' AS type" # Added stored_filename
    sql_misc_files_from = "FROM misc_files mf"
    misc_params = [like_query_term, like_query_term, like_query_term]
    if user_id:
        sql_misc_files_select += ", uf.id AS favorite_id"
        sql_misc_files_from += " LEFT JOIN user_favorites uf ON mf.id = uf.item_id AND uf.item_type = 'misc_file' AND uf.user_id = ?"
        misc_params.append(user_id)
    sql_misc_files = f"{sql_misc_files_select} {sql_misc_files_from} WHERE (LOWER(mf.user_provided_title) LIKE ? OR LOWER(mf.user_provided_description) LIKE ? OR LOWER(mf.original_filename) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_misc_files, tuple(misc_params)).fetchall()])

    # Software
    sql_software_select = "SELECT s.id, s.name, s.description, 'software' AS type"
    sql_software_from = "FROM software s"
    software_params = [like_query_term, like_query_term]
    if user_id:
        sql_software_select += ", uf.id AS favorite_id"
        sql_software_from += " LEFT JOIN user_favorites uf ON s.id = uf.item_id AND uf.item_type = 'software' AND uf.user_id = ?"
        software_params.append(user_id)
    sql_software_query = f"{sql_software_select} {sql_software_from} WHERE (LOWER(s.name) LIKE ? OR LOWER(s.description) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_software_query, tuple(software_params)).fetchall()])

    # Versions
    sql_versions_select = "SELECT v.id, v.version_number AS name, v.changelog, v.known_bugs, v.software_id, s.name AS software_name, 'version' AS type"
    sql_versions_from = "FROM versions v JOIN software s ON v.software_id = s.id"
    version_params = [like_query_term, like_query_term, like_query_term]
    if user_id:
        sql_versions_select += ", uf.id AS favorite_id"
        sql_versions_from += " LEFT JOIN user_favorites uf ON v.id = uf.item_id AND uf.item_type = 'version' AND uf.user_id = ?"
        version_params.append(user_id)
    sql_versions_query = f"{sql_versions_select} {sql_versions_from} WHERE (LOWER(v.version_number) LIKE ? OR LOWER(v.changelog) LIKE ? OR LOWER(v.known_bugs) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_versions_query, tuple(version_params)).fetchall()])

    return jsonify(results)

# --- CLI Command ---
@app.cli.command('init-db')
def init_db_command():
    database.init_db(app.config['DATABASE']) # Pass DB path to init_db
    print('Initialized the database.')

    # Initialize global password setting
    try:
        db = get_db() # Use app's get_db to ensure context
        cursor = db.execute("SELECT setting_value FROM site_settings WHERE setting_key = 'global_password_hash'")
        existing_setting = cursor.fetchone()

        if not existing_setting:
            print("Initializing default global password...")
            default_password = "Admin@123"
            hashed_password = bcrypt.generate_password_hash(default_password).decode('utf-8')
            db.execute("INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)",
                       ('global_password_hash', hashed_password))
            db.commit()
            print("Default global password initialized.")
        else:
            print("Global password already set.")
    except Exception as e:
        print(f"Error during global password initialization: {e}")
        # Potentially rollback if db connection was part of a larger transaction context,
        # but init_db_command is usually standalone.
    # close_db is handled by teardown_appcontext

# --- Endpoint for Super Admin to change Global Password ---
@app.route('/api/superadmin/settings/global-password', methods=['PUT'])
@jwt_required()
@super_admin_required # Ensures only super admins can access
def change_global_password():
    data = request.get_json()
    if not data or 'new_password' not in data:
        return jsonify(msg="New password is required"), 400

    new_password = data['new_password']

    # Basic password validation (e.g., minimum length)
    # Using the existing is_password_strong function for consistency,
    # though the subtask didn't explicitly ask for strength for this one.
    # If a simpler validation (e.g. just length) is preferred, this can be adjusted.
    is_strong, strength_msg = is_password_strong(new_password)
    if not is_strong:
        return jsonify(msg=strength_msg), 400

    try:
        new_hashed_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
        update_site_setting('global_password_hash', new_hashed_password)

        log_audit_action(
            action_type='GLOBAL_PASSWORD_CHANGED',
            # target_table='site_settings', # Optional, as it's a specific setting
            # target_id=None, # No specific ID for this setting key
            details={'setting_key': 'global_password_hash'}
            # user_id and username are automatically picked up by log_audit_action
        )
        return jsonify(msg="Global password updated successfully"), 200
    except Exception as e:
        app.logger.error(f"Error changing global password: {e}")
        # Potentially rollback if update_site_setting doesn't commit immediately
        # or if it's part of a larger transaction (not the case here).
        return jsonify(msg="Failed to update global password due to a server error."), 500

# --- Database Backup Endpoint (Super Admin) ---
@app.route('/api/superadmin/database/backup', methods=['GET'])
@jwt_required()
@super_admin_required
def backup_database():
    try:
        # Ensure shutil and os are imported (should be at the top of the file)
        # Ensure datetime from datetime is imported (should be at the top of the file)

        # Define backup directory path
        backup_dir = os.path.join(app.config['INSTANCE_FOLDER_PATH'], 'backups')

        # Create backup directory if it doesn't exist
        os.makedirs(backup_dir, exist_ok=True)

        # Database file path
        source_db_path = app.config['DATABASE']

        # Create timestamped backup filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"software_dashboard_{timestamp}.db"
        backup_file_path = os.path.join(backup_dir, backup_filename)

        # Copy the database file
        shutil.copy2(source_db_path, backup_file_path)

        # Log audit action
        log_audit_action(
            action_type='DATABASE_BACKUP_SUCCESS',
            details={'backup_path': backup_file_path}
            # User performing action is automatically logged by log_audit_action
        )

        return jsonify(message="Database backup successful.", backup_path=backup_file_path), 200

    except Exception as e:
        app.logger.error(f"Database backup failed: {e}", exc_info=True) # Log with traceback
        return jsonify(msg="Database backup failed.", error=str(e)), 500

# --- Database Restore Endpoint (Super Admin) ---
@app.route('/api/superadmin/database/restore', methods=['POST'])
@jwt_required()
@super_admin_required
def restore_database():
    # Ensure necessary imports are at the top of app.py:
    # import os
    # import shutil
    # from werkzeug.utils import secure_filename

    temp_uploaded_db_path = None # Initialize to None for error handling
    failsafe_db_backup_path = None # Initialize for error handling

    try:
        # 2. Check if 'backup_file' is in request.files
        if 'backup_file' not in request.files:
            return jsonify(msg="No backup file part in request"), 400

        # 3. Get the uploaded file object
        uploaded_file = request.files['backup_file']

        # 4. If uploaded_file.filename == ''
        if uploaded_file.filename == '':
            return jsonify(msg="No backup file selected"), 400

        # 5. Secure the filename
        original_filename = secure_filename(uploaded_file.filename)

        # 6. Validate if original_filename.endswith('.db')
        if not original_filename.endswith('.db'):
            return jsonify(msg="Invalid file type. Please upload a .db file."), 400

        # 7. Define the current database path
        current_db_path = app.config['DATABASE']
        
        # Define a failsafe backup path for the current live DB
        failsafe_db_backup_path = current_db_path + ".restore_failsafe"


        # 8. Define a temporary path for the uploaded file
        # Save in instance folder to avoid potential permission issues in app root
        temp_uploaded_db_path = os.path.join(app.config['INSTANCE_FOLDER_PATH'], original_filename + ".tmp_restore")

        # 9. Save the uploaded file to temp_uploaded_db_path
        uploaded_file.save(temp_uploaded_db_path)

        # 10. Replace the current database file
        # Create a failsafe backup of the current live DB
        try:
            if os.path.exists(current_db_path): # Only backup if current DB exists
                 shutil.copy2(current_db_path, failsafe_db_backup_path)
                 app.logger.info(f"Created failsafe backup of current DB at {failsafe_db_backup_path}")
        except Exception as e_backup:
            app.logger.error(f"Failed to create failsafe backup of current DB: {e_backup}")
            # Decide if to proceed or not. For now, we'll proceed but this is a risk.
            # Consider returning an error here if failsafe is critical.

        # Move the uploaded file to replace the current database
        # This operation should be atomic on most systems if source and destination are on the same filesystem.
        shutil.move(temp_uploaded_db_path, current_db_path)
        app.logger.info(f"Successfully moved uploaded DB {temp_uploaded_db_path} to {current_db_path}")


        # 11. Log an audit action
        log_audit_action(
            action_type='DATABASE_RESTORE_SUCCESS',
            details={'restored_from_file': original_filename}
        )
        
        # Clean up the failsafe backup if restore was successful
        if failsafe_db_backup_path and os.path.exists(failsafe_db_backup_path):
            try:
                os.remove(failsafe_db_backup_path)
                app.logger.info(f"Cleaned up failsafe DB backup: {failsafe_db_backup_path}")
            except Exception as e_cleanup_failsafe:
                app.logger.error(f"Error cleaning up failsafe DB backup {failsafe_db_backup_path}: {e_cleanup_failsafe}")


        # 12. Return success response
        return jsonify(message="Database restore successful. Application restart might be required if issues occur."), 200

    except Exception as e:
        # 13. In case of any Exception
        app.logger.error(f"Database restore failed: {str(e)}", exc_info=True)

        # Attempt to remove the temporary uploaded file if it exists
        if temp_uploaded_db_path and os.path.exists(temp_uploaded_db_path):
            try:
                os.remove(temp_uploaded_db_path)
                app.logger.info(f"Cleaned up temporary uploaded DB file: {temp_uploaded_db_path}")
            except Exception as e_remove_tmp:
                app.logger.error(f"Error removing temporary uploaded DB file {temp_uploaded_db_path}: {e_remove_tmp}")
        
        # Log if the failsafe backup exists, user might need to restore it manually.
        if failsafe_db_backup_path and os.path.exists(failsafe_db_backup_path):
            app.logger.warning(f"Database restore process failed. A failsafe backup of the original database might exist at: {failsafe_db_backup_path}. Manual intervention may be required.")
            # For now, we do not automatically restore the failsafe backup.
            # This decision depends on how robust the recovery strategy should be.
            # If shutil.move failed after deleting current_db_path (though unlikely with shutil.move for files),
            # or if it failed mid-operation, the state of current_db_path might be uncertain.

        return jsonify(msg="Database restore failed.", error=str(e)), 500

# --- Main Execution ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

# --- User Favorites Endpoints ---
ALLOWED_FAVORITE_ITEM_TYPES = ['document', 'patch', 'link', 'misc_file', 'software', 'version']

@app.route('/api/favorites', methods=['POST'])
@jwt_required()
def add_user_favorite():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    item_id = data.get('item_id')
    item_type = data.get('item_type')

    if not isinstance(item_id, int) or item_id <= 0:
        return jsonify(msg="item_id (positive integer) is required."), 400
    if not item_type or item_type not in ALLOWED_FAVORITE_ITEM_TYPES:
        return jsonify(msg=f"item_type is required and must be one of: {', '.join(ALLOWED_FAVORITE_ITEM_TYPES)}."), 400

    db = get_db()
    
    # Check if already favorited to prevent duplicate processing by add_favorite if it doesn't handle it.
    # The current database.add_favorite returns None on IntegrityError (already exists).
    existing_favorite = database.get_favorite_status(db, user_id, item_id, item_type)
    if existing_favorite:
        return jsonify(dict(existing_favorite)), 200 # Already exists, return current favorite info

    favorite_id = database.add_favorite(db, user_id, item_id, item_type)

    if favorite_id:
        log_audit_action(
            action_type='ADD_FAVORITE',
            target_table='user_favorites',
            target_id=favorite_id, # This is the ID of the entry in user_favorites table
            details={'item_id': item_id, 'item_type': item_type}
            # user_id and username are automatically picked up by log_audit_action from JWT
        )
        # Fetch the newly created favorite record to return it
        new_favorite_record = database.get_favorite_status(db, user_id, item_id, item_type)
        if new_favorite_record:
            return jsonify(dict(new_favorite_record)), 201
        else:
            # This case should ideally not happen if add_favorite returned a valid ID
            app.logger.error(f"Failed to fetch favorite record for user {user_id}, item {item_id}, type {item_type} after creation.")
            return jsonify(msg="Favorite added but could not be retrieved."), 500
    else:
        # This could be due to an IntegrityError (already favorited and not handled above) or other DB error
        # The database.add_favorite function prints specific errors.
        return jsonify(msg="Failed to add favorite. It might already exist or a database error occurred."), 409 # 409 Conflict or 500

@app.route('/api/favorites/<item_type>/<int:item_id>', methods=['DELETE'])
@jwt_required()
def remove_user_favorite(item_type, item_id):
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    if item_type not in ALLOWED_FAVORITE_ITEM_TYPES:
        return jsonify(msg=f"Invalid item_type. Must be one of: {', '.join(ALLOWED_FAVORITE_ITEM_TYPES)}."), 400
    if item_id <= 0:
         return jsonify(msg="item_id must be a positive integer."), 400


    db = get_db()
    # Optional: Check if the favorite exists before trying to delete, to provide more specific feedback.
    # favorite_to_delete = database.get_favorite_status(db, user_id, item_id, item_type)
    # if not favorite_to_delete:
    #     return jsonify(msg="Favorite not found."), 404
        
    if database.remove_favorite(db, user_id, item_id, item_type):
        log_audit_action(
            action_type='REMOVE_FAVORITE',
            target_table='user_favorites', # The table from which the record was removed
            # target_id could be the ID of the user_favorites record if known, or just log item_id/item_type
            details={'item_id': item_id, 'item_type': item_type}
        )
        return jsonify(msg="Favorite removed successfully."), 200 # Or 204 No Content
    else:
        return jsonify(msg="Failed to remove favorite. It might not exist or a database error occurred."), 404 # Or 500

@app.route('/api/favorites', methods=['GET'])
@jwt_required()
def get_user_favorites_api():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    item_type_filter = request.args.get('item_type', default=None, type=str)

    if page <= 0: page = 1
    if per_page <= 0: per_page = 10
    if per_page > 100: per_page = 100 # Max limit

    if item_type_filter and item_type_filter not in ALLOWED_FAVORITE_ITEM_TYPES:
        return jsonify(msg=f"Invalid item_type filter. Must be one of: {', '.join(ALLOWED_FAVORITE_ITEM_TYPES)}."), 400

    db = get_db()
    try:
        items, total_count = database.get_user_favorites(db, user_id, page, per_page, item_type_filter)
        
        total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1
        
        # Convert Row objects to dicts for JSON serialization
        items_as_dicts = [dict(item) for item in items]

        return jsonify({
            "favorites": items_as_dicts,
            "page": page,
            "per_page": per_page,
            "total_favorites": total_count,
            "total_pages": total_pages
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching user favorites for user {user_id}: {e}", exc_info=True)
        return jsonify(msg="An error occurred while fetching favorites."), 500


@app.route('/api/favorites/status/<item_type>/<int:item_id>', methods=['GET'])
@jwt_required()
def get_user_favorite_status_api(item_type, item_id):
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    if item_type not in ALLOWED_FAVORITE_ITEM_TYPES:
        return jsonify(msg=f"Invalid item_type. Must be one of: {', '.join(ALLOWED_FAVORITE_ITEM_TYPES)}."), 400
    if item_id <= 0:
         return jsonify(msg="item_id must be a positive integer."), 400

    db = get_db()
    favorite_record = database.get_favorite_status(db, user_id, item_id, item_type)

    if favorite_record:
        return jsonify({
            "is_favorite": True,
            "favorite_id": favorite_record['id'], # ID of the user_favorites record
            "favorited_at": favorite_record['created_at']
        }), 200
    else:
        return jsonify({"is_favorite": False, "favorite_id": None}), 200

# --- Audit Log Viewer Endpoint (Admin) ---
@app.route('/api/admin/audit-logs', methods=['GET'])
@jwt_required()
@admin_required
def get_audit_logs():
    try:
        db = get_db()

        # Pagination parameters
        page = request.args.get('page', default=1, type=int)
        per_page = request.args.get('per_page', default=10, type=int) # CORRECTED INDENTATION

        # Sorting parameters
        sort_by = request.args.get('sort_by', default='timestamp', type=str)
        sort_order = request.args.get('sort_order', default='desc', type=str).lower()

        # Filtering parameters
        filter_user_id = request.args.get('user_id', type=int)
        filter_username = request.args.get('username', type=str)
        filter_action_type = request.args.get('action_type', type=str)
        filter_target_table = request.args.get('target_table', type=str)
        filter_date_from = request.args.get('date_from', type=str) # Expected format: YYYY-MM-DD
        filter_date_to = request.args.get('date_to', type=str)     # Expected format: YYYY-MM-DD

        # Validate parameters
        if page <= 0: page = 1
        if per_page <= 0: per_page = 10
        if per_page > 100: per_page = 100 # Max per page

        allowed_sort_by = ['id', 'user_id', 'username', 'action_type', 'target_table', 'target_id', 'timestamp']
        if sort_by not in allowed_sort_by:
            sort_by = 'timestamp'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'

        # Build query
        query_params = []
        where_clauses = []

        base_query = "SELECT id, user_id, username, action_type, target_table, target_id, details, timestamp FROM audit_logs"
        count_query = "SELECT COUNT(*) as count FROM audit_logs"

        if filter_user_id is not None:
            where_clauses.append("user_id = ?")
            query_params.append(filter_user_id)
        if filter_username:
            where_clauses.append("LOWER(username) LIKE ?")
            query_params.append(f"%{filter_username.lower()}%")
        if filter_action_type:
            where_clauses.append("action_type = ?")
            query_params.append(filter_action_type)
        if filter_target_table:
            where_clauses.append("target_table = ?")
            query_params.append(filter_target_table)
        if filter_date_from:
            try:
                datetime.strptime(filter_date_from, '%Y-%m-%d')
                where_clauses.append("date(timestamp) >= date(?)")
                query_params.append(filter_date_from)
            except ValueError:
                return jsonify(msg="Invalid date_from format. Expected YYYY-MM-DD."), 400
        if filter_date_to:
            try:
                datetime.strptime(filter_date_to, '%Y-%m-%d')
                where_clauses.append("date(timestamp) <= date(?)")
                query_params.append(filter_date_to)
            except ValueError:
                return jsonify(msg="Invalid date_to format. Expected YYYY-MM-DD."), 400

        if where_clauses:
            conditions = " AND ".join(where_clauses)
            base_query += f" WHERE {conditions}"
            count_query += f" WHERE {conditions}"

        # Get total count
        try:
            total_logs_cursor = db.execute(count_query, tuple(query_params))
            total_logs_result = total_logs_cursor.fetchone()
            if total_logs_result is None: # Defensive check
                app.logger.error("Failed to fetch audit log count: query returned None.")
                return jsonify(msg="Error fetching audit log count: No result from count query."), 500
            total_logs = total_logs_result['count']
        except sqlite3.Error as e:
            app.logger.error(f"Database error fetching audit log count: {e}")
            return jsonify(msg=f"Database error fetching audit log count: {e}"), 500
        except KeyError: # If 'count' key is missing from the result
            app.logger.error("Failed to fetch audit log count: 'count' key missing from result.")
            return jsonify(msg="Error fetching audit log count: Malformed count query result."), 500


        total_pages = math.ceil(total_logs / per_page) if total_logs > 0 else 1
        offset = (page - 1) * per_page

        if page > total_pages and total_logs > 0:
            page = total_pages
            offset = (page - 1) * per_page
        
        base_query += f" ORDER BY {sort_by} {sort_order.upper()} LIMIT ? OFFSET ?"
        query_params.extend([per_page, offset])

        try:
            logs_cursor = db.execute(base_query, tuple(query_params))
            logs_list = [dict(row) for row in logs_cursor.fetchall()]
        except sqlite3.Error as e:
            app.logger.error(f"Database error fetching audit logs: {e}")
            return jsonify(msg=f"Database error fetching audit logs: {e}"), 500

        return jsonify({
            "logs": logs_list,
            "page": page,
            "per_page": per_page,
            "total_logs": total_logs,
            "total_pages": total_pages
        }), 200

    # This is the except block for the outer try
    except Exception as e:
        app.logger.error(f"Failed to retrieve audit logs: {e}", exc_info=True)
        return jsonify(error="Failed to retrieve audit logs", details=str(e)), 500

# --- Admin System Health Endpoint ---
@app.route('/api/admin/system-health', methods=['GET'])
@jwt_required()
@admin_required
def get_system_health():
    db_status = "OK"
    try:
        # Attempt to get a database connection.
        db = get_db()
        # Perform a simple query to be absolutely sure the connection is usable.
        db.execute("SELECT 1").fetchone()
    except sqlite3.Error as e: # Catch SQLite specific errors
        app.logger.error(f"System health DB check failed with sqlite3.Error: {e}")
        db_status = f"Error: Could not connect to database. Details: {e}"
    except Exception as e: # Catch any other unexpected errors during DB check
        app.logger.error(f"System health DB check failed with unexpected error: {e}")
        db_status = f"Error: Could not connect to database. Unexpected error: {e}"

    return jsonify({
        "api_status": "OK",
        "db_connection": db_status
    }), 200

# --- Admin Dashboard Statistics Endpoint ---

def get_daily_counts(db, action_types, days=7):
    if not action_types:
        return []
    
    placeholders = ','.join(['?'] * len(action_types))
    query = f"""
        WITH RECURSIVE dates(date) AS (
          SELECT date('now', '-{days-1} days') -- Corrected to ensure 'days' includes today
          UNION ALL
          SELECT date(date, '+1 day')
          FROM dates
          WHERE date < date('now')
        )
        SELECT
          d.date,
          COALESCE(COUNT(al.id), 0) as count
        FROM dates d
        LEFT JOIN audit_logs al
          ON date(al.timestamp) = d.date AND al.action_type IN ({placeholders})
        GROUP BY d.date
        ORDER BY d.date ASC;
    """
    params = list(action_types)
    results = db.execute(query, params).fetchall()
    return [dict(row) for row in results]

def get_weekly_counts(db, action_types, weeks=4):
    if not action_types:
        return []

    placeholders = ','.join(['?'] * len(action_types))
    # Calculate the start date for the recursive CTE:
    # (weeks-1)*7 days ago from today, then find the Sunday of that week.
    # Example: for 4 weeks, this is 21 days ago.
    start_date_offset = (weeks - 1) * 7
    query = f"""
        WITH RECURSIVE week_starts(week_start_date) AS (
          SELECT date('now', 'weekday 0', '-{start_date_offset + 6} days') 
          UNION ALL
          SELECT date(week_start_date, '+7 days')
          FROM week_starts
          WHERE date(week_start_date, '+7 days') <= date('now', 'weekday 0', '+1 day') 
        )
        SELECT
          w.week_start_date,
          COALESCE(COUNT(al.id), 0) as count
        FROM week_starts w
        LEFT JOIN audit_logs al
          ON date(al.timestamp, 'weekday 0', '-6 days') = w.week_start_date AND al.action_type IN ({placeholders})
        GROUP BY w.week_start_date
        ORDER BY w.week_start_date ASC;
    """
    # The recursive CTE for weeks needs to generate Sundays.
    # If today is Sunday, 'weekday 0' gives today.
    # If today is Monday, 'weekday 0' gives yesterday (Sunday).
    # So, date('now', 'weekday 0', '-{X} days') is the correct way to get a past Sunday.
    # For `weeks=4`: we want this week's Sunday, and 3 previous Sundays.
    # `date('now', 'weekday 0')` is this week's Sunday.
    # `date('now', 'weekday 0', '-7 days')` is last week's Sunday.
    # `date('now', 'weekday 0', '-14 days')` is two weeks ago Sunday.
    # `date('now', 'weekday 0', '-21 days')` is three weeks ago Sunday.
    # So the initial SELECT for weeks should be `date('now', 'weekday 0', '-{(weeks-1)*7} days')`
    # The condition `WHERE date(week_start_date, '+7 days') <= date('now', 'weekday 0', '+1 day')` seems a bit off.
    # It should be `WHERE week_start_date < date('now', 'weekday 0')` if the initial date is correct.
    # Or, more simply, limit the recursion count or ensure the last date is not beyond current week's Sunday.
    # Let's adjust the initial select and the recursive condition.
    # If weeks = 4, initial select: date('now', 'weekday 0', '-21 days')
    # Loop while date(week_start_date, '+7 days') <= date('now', 'weekday 0')

    # Corrected weekly query logic:
    # Initial date: Sunday of the week (weeks-1) weeks ago.
    # End date: Sunday of the current week.
    initial_sunday_offset = (weeks - 1) * 7
    query_corrected_weekly = f"""
        WITH RECURSIVE week_dates(week_start_date) AS (
          SELECT date('now', 'weekday 0', '-{initial_sunday_offset} days')
          UNION ALL
          SELECT date(week_start_date, '+7 days')
          FROM week_dates
          WHERE date(week_start_date, '+7 days') <= date('now', 'weekday 0')
        )
        SELECT
          wd.week_start_date,
          COALESCE(COUNT(al.id), 0) as count
        FROM week_dates wd
        LEFT JOIN audit_logs al
          ON date(al.timestamp, 'weekday 0', '-6 days') = wd.week_start_date AND al.action_type IN ({placeholders})
        GROUP BY wd.week_start_date
        ORDER BY wd.week_start_date ASC;
    """
    # Check if the number of weeks generated is correct.
    # If weeks = 1, initial_sunday_offset = 0. Dates: current Sunday. Correct.
    # If weeks = 4, initial_sunday_offset = 21. Dates: Sun(-3w), Sun(-2w), Sun(-1w), Sun(current). Correct.

    params = list(action_types)
    results = db.execute(query_corrected_weekly, params).fetchall()
    return [dict(row) for row in results]

def get_daily_download_counts(db, days=7):
    query = f"""
        WITH RECURSIVE dates(date) AS (
          SELECT date('now', '-{days-1} days')
          UNION ALL
          SELECT date(date, '+1 day')
          FROM dates
          WHERE date < date('now')
        )
        SELECT
          d.date,
          COALESCE(COUNT(dl.id), 0) as count
        FROM dates d
        LEFT JOIN download_log dl
          ON date(dl.download_timestamp) = d.date
        GROUP BY d.date
        ORDER BY d.date ASC;
    """
    results = db.execute(query).fetchall()
    return [dict(row) for row in results]

def get_weekly_download_counts(db, weeks=4):
    initial_sunday_offset = (weeks - 1) * 7
    query = f"""
        WITH RECURSIVE week_dates(week_start_date) AS (
          SELECT date('now', 'weekday 0', '-{initial_sunday_offset} days')
          UNION ALL
          SELECT date(week_start_date, '+7 days')
          FROM week_dates
          WHERE date(week_start_date, '+7 days') <= date('now', 'weekday 0')
        )
        SELECT
          wd.week_start_date,
          COALESCE(COUNT(dl.id), 0) as count
        FROM week_dates wd
        LEFT JOIN download_log dl
          ON date(dl.download_timestamp, 'weekday 0', '-6 days') = wd.week_start_date
        GROUP BY wd.week_start_date
        ORDER BY wd.week_start_date ASC;
    """
    results = db.execute(query).fetchall()
    return [dict(row) for row in results]

@app.route('/api/admin/dashboard-stats', methods=['GET'])
@jwt_required()
@admin_required
def get_dashboard_stats():
    db = get_db()
    try:
        # --- Basic Counts ---
        total_users = db.execute("SELECT COUNT(*) as count FROM users").fetchone()['count']
        total_software_titles = db.execute("SELECT COUNT(*) as count FROM software").fetchone()['count']

        # --- Recent Activities (Audit Logs) ---
        recent_activities = [
            dict(row) for row in db.execute(
                "SELECT action_type, username, timestamp, details FROM audit_logs ORDER BY timestamp DESC LIMIT 5"
            ).fetchall()
        ]

        # --- Recent Additions (last 5 across all types) ---
        recent_additions = []
        recent_additions += [
            dict(row) for row in db.execute(
                "SELECT id, doc_name as name, created_at, 'Document' as type FROM documents ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions += [
            dict(row) for row in db.execute(
                "SELECT id, patch_name as name, created_at, 'Patch' as type FROM patches ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions += [
            dict(row) for row in db.execute(
                "SELECT id, title as name, created_at, 'Link File' as type FROM links WHERE is_external_link = FALSE ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions += [
            dict(row) for row in db.execute(
                "SELECT id, COALESCE(user_provided_title, original_filename) as name, created_at, 'Misc File' as type FROM misc_files ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions.sort(key=lambda x: x['created_at'], reverse=True)
        top_recent_additions = recent_additions[:5]

        # --- Popular Downloads ---
        popular_downloads = []
        for item in db.execute("""
            SELECT file_id, file_type, COUNT(*) as download_count
            FROM download_log
            GROUP BY file_id, file_type
            ORDER BY download_count DESC
            LIMIT 5
        """).fetchall():
            name = "Unknown/Deleted Item"
            if item['file_type'] == 'document':
                res = db.execute("SELECT doc_name FROM documents WHERE id = ?", (item['file_id'],)).fetchone()
                if res: name = res['doc_name']
            elif item['file_type'] == 'patch':
                res = db.execute("SELECT patch_name FROM patches WHERE id = ?", (item['file_id'],)).fetchone()
                if res: name = res['patch_name']
            elif item['file_type'] == 'link_file':
                res = db.execute("SELECT title FROM links WHERE id = ?", (item['file_id'],)).fetchone()
                if res: name = res['title']
            elif item['file_type'] == 'misc_file':
                res = db.execute("SELECT COALESCE(user_provided_title, original_filename) as name FROM misc_files WHERE id = ?", (item['file_id'],)).fetchone()
                if res: name = res['name']
            popular_downloads.append({
                "name": name,
                "type": item['file_type'],
                "download_count": item['download_count']
            })

        # --- Documents per Software ---
        documents_per_software = [
            dict(row) for row in db.execute("""
                SELECT s.name as software_name, COUNT(d.id) as document_count
                FROM software s
                LEFT JOIN documents d ON s.id = d.software_id
                GROUP BY s.id, s.name
                ORDER BY s.name
            """).fetchall()
        ]

        # --- User Activity Trends ---
        daily_logins = get_daily_counts(db, ['USER_LOGIN'], days=7)
        weekly_logins = get_weekly_counts(db, ['USER_LOGIN'], weeks=4)
        upload_action_types = [
            'CREATE_DOCUMENT_FILE', 'CREATE_PATCH_FILE', 'CREATE_LINK_FILE', 'CREATE_MISC_FILE',
            'UPDATE_DOCUMENT_FILE', 'UPDATE_PATCH_FILE', 'UPDATE_LINK_FILE', 'UPDATE_MISC_FILE_UPLOAD'
        ]
        daily_uploads = get_daily_counts(db, upload_action_types, days=7)
        weekly_uploads = get_weekly_counts(db, upload_action_types, weeks=4)
        user_activity_trends = {
            "logins": {"daily": daily_logins, "weekly": weekly_logins},
            "uploads": {"daily": daily_uploads, "weekly": weekly_uploads}
        }

        # --- Download Trends ---
        daily_downloads = get_daily_download_counts(db, days=7)
        weekly_downloads = get_weekly_download_counts(db, weeks=4)
        download_trends = {
            "daily": daily_downloads,
            "weekly": weekly_downloads
        }

        # --- Storage Utilization ---
        docs_size = db.execute("SELECT SUM(file_size) as total FROM documents WHERE is_external_link = FALSE AND stored_filename IS NOT NULL").fetchone()['total'] or 0
        patches_size = db.execute("SELECT SUM(file_size) as total FROM patches WHERE is_external_link = FALSE AND stored_filename IS NOT NULL").fetchone()['total'] or 0
        links_size = db.execute("SELECT SUM(file_size) as total FROM links WHERE is_external_link = FALSE AND stored_filename IS NOT NULL").fetchone()['total'] or 0
        misc_files_size = db.execute("SELECT SUM(file_size) as total FROM misc_files WHERE stored_filename IS NOT NULL").fetchone()['total'] or 0
        total_storage_utilized_bytes = docs_size + patches_size + links_size + misc_files_size

        # --- Content Health Indicators ---
        stale_threshold_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        content_health = {"missing_descriptions": {}, "stale_content": {}}

        # Missing Descriptions
        content_health['missing_descriptions']['documents'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM documents WHERE description IS NULL OR description = ''").fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM documents").fetchone()['count'] or 0
        }
        content_health['missing_descriptions']['patches'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM patches WHERE description IS NULL OR description = ''").fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM patches").fetchone()['count'] or 0
        }
        content_health['missing_descriptions']['links'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM links WHERE description IS NULL OR description = ''").fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM links").fetchone()['count'] or 0
        }
        content_health['missing_descriptions']['misc_categories'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM misc_categories WHERE description IS NULL OR description = ''").fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM misc_categories").fetchone()['count'] or 0
        }
        content_health['missing_descriptions']['software'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM software WHERE description IS NULL OR description = ''").fetchone()['count'] or 0,
            'total': total_software_titles
        }
        content_health['missing_descriptions']['misc_files'] = {
            'missing': db.execute("SELECT COUNT(*) as count FROM misc_files WHERE user_provided_description IS NULL OR user_provided_description = ''").fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM misc_files").fetchone()['count'] or 0
        }

        # Stale Content
        content_health['stale_content']['documents'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM documents WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': content_health['missing_descriptions']['documents']['total']
        }
        content_health['stale_content']['patches'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM patches WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': content_health['missing_descriptions']['patches']['total']
        }
        content_health['stale_content']['links'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM links WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': content_health['missing_descriptions']['links']['total']
        }
        content_health['stale_content']['misc_files'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM misc_files WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': content_health['missing_descriptions']['misc_files']['total']
        }
        content_health['stale_content']['versions'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM versions WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': db.execute("SELECT COUNT(*) as count FROM versions").fetchone()['count'] or 0
        }
        content_health['stale_content']['misc_categories'] = {
            'stale': db.execute("SELECT COUNT(*) as count FROM misc_categories WHERE date(updated_at) < date(?)", (stale_threshold_date,)).fetchone()['count'] or 0,
            'total': content_health['missing_descriptions']['misc_categories']['total']
        }

        # --- Response ---
        return jsonify(
            total_users=total_users,
            total_software_titles=total_software_titles,
            recent_activities=recent_activities,
            recent_additions=top_recent_additions,
            popular_downloads=popular_downloads,
            documents_per_software=documents_per_software,
            user_activity_trends=user_activity_trends,
            download_trends=download_trends,
            total_storage_utilized_bytes=total_storage_utilized_bytes,
            content_health=content_health
        ), 200

    except sqlite3.Error as e:
        app.logger.error(f"Database error in get_dashboard_stats: {e}")
        return jsonify(error="Database error", details=str(e)), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in get_dashboard_stats: {e}", exc_info=True)
        return jsonify(error="An unexpected error occurred", details=str(e)), 500
