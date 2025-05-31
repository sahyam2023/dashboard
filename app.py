# app.py

# --- Comprehensive Configuration Notes for Deployment ---
# This application, especially with the large file upload functionality,
# requires careful configuration at multiple levels: Flask app, WSGI server (e.g., Gunicorn),
# and any reverse proxy (e.g., Nginx).
#
# 1. Flask Application Configuration (`app.config`):
#    - `MAX_CONTENT_LENGTH`:
#      - For standard Flask routes that might receive file uploads directly (not chunked),
#        this setting limits the total request size. Example: `app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024` (16MB).
#      - For the chunked upload endpoint (`/api/admin/upload_large_file`), the overall file size
#        can be much larger than `MAX_CONTENT_LENGTH` because the file is processed in smaller pieces.
#      - However, each individual chunk POST request (containing the chunk data + metadata)
#        must still have a body size that the Flask app (and any preceding servers) can handle.
#        Therefore, `MAX_CONTENT_LENGTH` should be set to a value sufficient for the
#        largest expected *chunk* size plus any associated metadata in the multipart form.
#        For example, if chunks are 5MB and metadata is small, a limit of 10MB might be reasonable.
#        `app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024`
#
# 2. Web Server / WSGI Server Configuration:
#    - These settings are crucial as they often impose their own limits before a request
#      even reaches the Flask application.
#
#    - Gunicorn (Common WSGI Server for Flask):
#      - `--timeout <seconds>`: Worker timeout. Default is 30 seconds. This might be too short
#        for operations like processing a large file chunk or the finalization step of a large upload
#        (moving file, DB insert). Increase as needed, e.g., `--timeout 120` (2 minutes) or higher.
#      - `--limit-request-line <bytes>`: Max size of HTTP request line. Default 4094. Usually not an issue.
#      - `--limit-request-field-size <bytes>`: Max size of an HTTP request header field. Default 8190.
#        Usually not an issue unless sending extremely large headers/metadata.
#      - `--limit-request-fields <integer>`: Max number of request header fields. Default 100.
#
#    - Nginx (Common Reverse Proxy):
#      - `client_max_body_size <size>`: This is a very important directive. It defines the maximum
#        allowed size of the client request body.
#        - For the chunked upload endpoint, this should be set to accommodate the largest
#          *chunk* size plus metadata overhead (e.g., `10M` if chunks are 5MB).
#        - If you have other non-chunked routes that accept large files, this would need to be
#          set to the absolute largest file size you want to support for those routes.
#        - Example: `client_max_body_size 10M;`
#      - `proxy_request_buffering off;`:
#        - When set to `off`, Nginx starts sending the request body to the backend server (Gunicorn)
#          immediately as it arrives, rather than buffering the entire request first.
#        - This can be beneficial for large uploads to reduce disk I/O on the Nginx server and
#          improve perceived performance, especially if Gunicorn/Flask can stream the request.
#        - For the chunked approach, where chunks are relatively small, its impact might be less
#          critical than for non-chunked monolithic uploads, but can still be good practice.
#      - `proxy_buffering off;`: Similar to `proxy_request_buffering`, but for responses from
#        the backend. Generally useful for streaming responses.
#      - `proxy_read_timeout <seconds>`: Timeout for reading a response from the proxied server (Gunicorn).
#        Increase if Gunicorn might take a long time to process a chunk or finalize a file.
#        Example: `proxy_read_timeout 120s;`
#      - `proxy_send_timeout <seconds>`: Timeout for sending a request to the proxied server.
#        Example: `proxy_send_timeout 120s;`
#      - `proxy_connect_timeout <seconds>`: Timeout for establishing a connection with the proxied server.
#        Example: `proxy_connect_timeout 75s;`
#
#    - General Notes:
#      - The specific directives and optimal values depend heavily on your deployment stack
#        (Nginx, Apache, Caddy, etc.) and server resources.
#      - Always consult the documentation for your specific web server and WSGI server.
#
# 3. Filesystem and Server Resources:
#    - Disk Space:
#      - `app.config['TMP_LARGE_UPLOADS_FOLDER']` (e.g., `instance/tmp_large_uploads`):
#        Must have sufficient disk space to hold multiple concurrent large file uploads
#        as they are being assembled. Consider the maximum number of concurrent uploads
#        and the maximum size of files.
#      - Final storage locations (e.g., `DOC_UPLOAD_FOLDER`, `PATCH_UPLOAD_FOLDER`):
#        Must have adequate space for all permanently stored files.
#    - Permissions:
#      - The user account under which the Flask application (and WSGI server) runs needs
#        read, write, and execute (for directories) permissions for all upload-related
#        directories: `TMP_LARGE_UPLOADS_FOLDER`, `DOC_UPLOAD_FOLDER`, etc.
#    - Memory:
#      - While chunking significantly reduces the memory footprint compared to loading entire
#        files into memory, each chunk is still processed. Monitor server memory usage,
#        especially during peak upload times or if many small chunks are processed rapidly.
#
# 4. Chunking Implementation Notes (Current Application):
#    - The current implementation appends chunks sequentially to a temporary file
#      (e.g., `{upload_id}-{original_filename}.part`).
#    - It relies on the client to send chunks in the correct order.
#    - Error handling for individual chunk failures is present, but the overall upload
#      process might leave partial files in `TMP_LARGE_UPLOADS_FOLDER` if an error occurs
#      mid-upload or if the client abandons the upload. A cleanup mechanism (e.g., a periodic script)
#      for stale `.part` files might be necessary for long-term maintenance.
#    - For more advanced scenarios (e.g., very unreliable networks), consider:
#      - Resumable uploads: Protocols like TUS (tus.io) provide robust resumable upload capabilities.
#        This would require significant changes on both client and server.
#      - Storing individual chunks and reassembling: Instead of appending, save each chunk
#        as a separate file (e.g., `{upload_id}.{chunk_number}.chunk`) and then combine them
#        once all are received. This can offer better error recovery for specific chunks.
#
# --- End Comprehensive Configuration Notes ---

import os
import uuid
import sqlite3
import json # Added for audit logging
from flask import send_file, after_this_request
import re
from database import init_db
from datetime import datetime, timedelta, timezone
import math # Added for math.ceil
import secrets # Added for secure token generation
import shutil
import click # For CLI arguments
from functools import wraps
# import cProfile # Removed
# import pstats # Removed
# import io # Removed
import random
import zipfile
import tempfile
import pytz # Added for IST
from datetime import datetime, timedelta, timezone # Ensured all are here
from flask import Flask, request, g, jsonify, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    create_access_token, jwt_required, JWTManager,
    get_jwt_identity, verify_jwt_in_request
)
from werkzeug.utils import secure_filename
from tempfile import NamedTemporaryFile
import database # Your database.py helper
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

# --- Configuration ---
# Best practice: Use app.instance_path for user-generated content if possible
# This ensures files are not in your main app directory.
INSTANCE_FOLDER_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
if not os.path.exists(INSTANCE_FOLDER_PATH):
    os.makedirs(INSTANCE_FOLDER_PATH, exist_ok=True)

BACKUP_DIR = os.path.join(INSTANCE_FOLDER_PATH, 'backups')
MAX_BACKUP_AGE_DAYS = 30

# Define separate upload folders for clarity and potential different serving rules
DOC_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'documents')
PATCH_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'patches')
LINK_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads', 'links')
MISC_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'misc_uploads')
PROFILE_PICTURES_UPLOAD_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'profile_pictures') # Added
DEFAULT_PROFILE_PICTURES_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'default_profile_pictures') # New
STATIC_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')


# Ensure all upload folders exist
TMP_LARGE_UPLOADS_FOLDER = os.path.join(INSTANCE_FOLDER_PATH, 'tmp_large_uploads') # For large file chunks
for folder in [DOC_UPLOAD_FOLDER, PATCH_UPLOAD_FOLDER, LINK_UPLOAD_FOLDER, MISC_UPLOAD_FOLDER, PROFILE_PICTURES_UPLOAD_FOLDER, DEFAULT_PROFILE_PICTURES_FOLDER, TMP_LARGE_UPLOADS_FOLDER]: # Added PROFILE_PICTURES_UPLOAD_FOLDER and DEFAULT_PROFILE_PICTURES_FOLDER
    if not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True) # exist_ok=True is helpful

ALLOWED_EXTENSIONS = {
    'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif',
    'mp4', 'mov', 'avi', 'wmv', 'mkv', 'ts', # Video
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

# Define extensions that are prone to be opened inline by browsers
INLINE_PRONE_EXTENSIONS = {
    'pdf', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'html', 'css', 'xml', 'json',
    'svg', 'webp', 'bmp', 'ico', 'tif', 'tiff', # More image types
    'js', # JavaScript files can sometimes be displayed
    'md' # Markdown files
}

# app = Flask(__name__, instance_relative_config=True) # instance_relative_config=True is good practice

app = Flask(__name__, 
            instance_relative_config=True,
            static_folder=STATIC_FOLDER)

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:5173",
            "http://localhost:7000",
            "http://127.0.0.1:7000"
        ]
    }
},
supports_credentials=True,
allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma"],
methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# App Configuration
app.config['DATABASE'] = os.path.join(INSTANCE_FOLDER_PATH, 'software_dashboard.db') # DB in instance folder
app.config['SECRET_KEY'] = '161549f75b4148cd529620b59c4fd706b40ae5805912a513811e575c7cd23439fa63a8300b6f93295f353520c026bc25b1d07c4e1c369d3839cf74deca7e52210f3ac8967052cc51be1ceb45d81f57b8bd16ab5019d063a2de13ee802e1507d9e4dca8f6114ff1ed81300768acb5a95f48c100ad457ec1f8331f6fe9320bb816' 
app.config['JWT_SECRET_KEY'] = '991ca90ca06a362033f84c9a295a7c0f880caac7a74aefcf23df09f3b783c8e5a9bb0d8c1fcacf614d78cc3b580540419f55e08a29802eb9ea5e83a16eac641c0c028c814267dc94b261aa6a209462ea052773739f1429b7333185bf2b8bf8ba7ac19bccf691f4eece8d47174b6b3e191766d6a1a5c9a3ad21fd672f864e8a357d3c4b3fb838312a047156965a5756d73504db10b3920a3e6bfba5288443be112953e6b46132f6022280b192087384d6f8e91094bb5bbf21deac4bff2aaeda3f607db786b4847096f6112bad168e5223638c47146c74a9da65a54a86060c5298238169e1f2646f670c5f8014fe4997f9a2d8964e52938b627e31f58a70ece4d7'
app.config['BCRYPT_LOG_ROUNDS'] = 12
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=4)

# Store upload folder paths in app config for easy access in routes
app.config['DOC_UPLOAD_FOLDER'] = DOC_UPLOAD_FOLDER
app.config['PATCH_UPLOAD_FOLDER'] = PATCH_UPLOAD_FOLDER

# --- MIME Type to Extension Mapping ---
COMMON_MIME_TO_EXT = {
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'video/x-matroska': 'mkv',
    'video/mp2t': 'ts',
    'application/x-iso9660-image': 'iso',
    'application/octet-stream': 'bin', # Generic fallback for unknown binary data
}
# --- End MIME Type to Extension Mapping ---
app.config['LINK_UPLOAD_FOLDER'] = LINK_UPLOAD_FOLDER
app.config['MISC_UPLOAD_FOLDER'] = MISC_UPLOAD_FOLDER
app.config['PROFILE_PICTURES_UPLOAD_FOLDER'] = PROFILE_PICTURES_UPLOAD_FOLDER # Added
app.config['DEFAULT_PROFILE_PICTURES_FOLDER'] = DEFAULT_PROFILE_PICTURES_FOLDER # New
app.config['INSTANCE_FOLDER_PATH'] = INSTANCE_FOLDER_PATH # Added for DB backup
app.config['TMP_LARGE_UPLOADS_FOLDER'] = TMP_LARGE_UPLOADS_FOLDER # For large file chunks

bcrypt = Bcrypt(app)
jwt = JWTManager(app)
IST = pytz.timezone('Asia/Kolkata') # Added IST timezone
UTC = pytz.utc # Added UTC for clarity in conversion if needed

def delete_old_backups():
    """Deletes backups older than MAX_BACKUP_AGE_DAYS."""
    if not os.path.exists(BACKUP_DIR):
        app.logger.info("Backup directory does not exist. No old backups to delete.")
        return

    app.logger.info(f"Checking for old backups in {BACKUP_DIR} older than {MAX_BACKUP_AGE_DAYS} days.")
    now = datetime.now(IST) # Changed to IST
    deleted_count = 0
    retained_count = 0

    for filename in os.listdir(BACKUP_DIR):
        if filename.startswith("software_dashboard_") and filename.endswith(".db"):
            try:
                # Extract timestamp string: software_dashboard_YYYYMMDD_HHMMSS.db
                timestamp_str = filename.replace("software_dashboard_", "").replace(".db", "")
                backup_datetime = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                # backup_datetime is naive, localize to IST
                backup_datetime = IST.localize(backup_datetime)

                if now - backup_datetime > timedelta(days=MAX_BACKUP_AGE_DAYS):
                    file_path = os.path.join(BACKUP_DIR, filename)
                    os.remove(file_path)
                    app.logger.info(f"Deleted old backup: {filename}")
                    deleted_count += 1
                else:
                    retained_count += 1
            except ValueError:
                app.logger.warning(f"Could not parse timestamp from backup filename: {filename}. Skipping.")
            except Exception as e:
                app.logger.error(f"Error processing backup file {filename}: {e}")
    
    app.logger.info(f"Old backup cleanup complete. Deleted: {deleted_count}, Retained: {retained_count}.")

def perform_daily_backup_job():
    """Job function for the scheduler to perform daily backups."""
    app.logger.info("Starting daily backup job...")
    try:
        success, path_or_error = _perform_database_backup() # Assumes _perform_database_backup is defined
        if success:
            app.logger.info(f"Daily backup successful. Backup saved to: {path_or_error}")
            log_audit_action(action_type='AUTO_BACKUP_SUCCESS', details={'backup_path': path_or_error})
            delete_old_backups() # Delete old backups after a successful new backup
        else:
            app.logger.error(f"Daily backup failed: {path_or_error}")
            log_audit_action(action_type='AUTO_BACKUP_FAILED', details={'error': path_or_error})
    except Exception as e:
        app.logger.error(f"Exception during daily backup job: {e}", exc_info=True)
        log_audit_action(action_type='AUTO_BACKUP_EXCEPTION', details={'error': str(e)})
    app.logger.info("Daily backup job finished.")

def get_latest_backup_time():
    """Gets the datetime of the latest backup file."""
    if not os.path.exists(BACKUP_DIR):
        return None
    
    latest_backup_dt = None
    for filename in os.listdir(BACKUP_DIR):
        if filename.startswith("software_dashboard_") and filename.endswith(".db"):
            try:
                timestamp_str = filename.replace("software_dashboard_", "").replace(".db", "")
                backup_datetime = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                # backup_datetime is naive, localize to IST
                backup_datetime = IST.localize(backup_datetime)
                if latest_backup_dt is None or backup_datetime > latest_backup_dt:
                    latest_backup_dt = backup_datetime
            except ValueError:
                continue # Skip files with invalid timestamp format
    return latest_backup_dt

def check_and_perform_missed_backup():
    """Checks if a backup was missed and performs one if necessary."""
    app.logger.info("Checking for missed backups...")
    latest_backup_time = get_latest_backup_time()

    if latest_backup_time is None:
        app.logger.info("No previous backups found. Performing initial backup.")
        perform_daily_backup_job()
    else:
        # Check if the latest backup is older than 23 hours (to be safe for a 12 PM schedule)
        if datetime.now(IST) - latest_backup_time > timedelta(hours=23): # Changed to IST
            app.logger.info(f"Latest backup was at {latest_backup_time}. Performing missed backup.")
            perform_daily_backup_job()
        else:
            app.logger.info(f"Latest backup at {latest_backup_time} is recent enough. No missed backup to perform.")

# --- Initialize Scheduler and Backups ---
def initialize_scheduler_and_backups(current_app):
    current_app.logger.info("Initializing scheduler and performing startup backup checks...")
    # Ensure BACKUP_DIR exists (it should be defined globally or passed)
    # BACKUP_DIR is already defined globally using INSTANCE_FOLDER_PATH
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        current_app.logger.info(f"Created backup directory at {BACKUP_DIR}")

    check_and_perform_missed_backup() # This function uses app.logger internally

    scheduler = BackgroundScheduler(timezone='Asia/Kolkata') # Changed to Asia/Kolkata
    scheduler.add_job(perform_daily_backup_job, 'cron', hour=12, minute=0)
    try:
        scheduler.start()
        current_app.logger.info("Background scheduler started. Daily backup job scheduled for 12:00 PM UTC.")
        # Register scheduler shutdown
        atexit.register(lambda: scheduler.shutdown())
        current_app.logger.info("Scheduler shutdown registered with atexit.")
    except Exception as e:
        current_app.logger.error(f"Error starting background scheduler: {e}", exc_info=True)

# Initialize scheduler and perform startup backup checks
initialize_scheduler_and_backups(app)



# Helper function to convert specific timestamp fields in a dictionary to IST ISO format
def convert_timestamps_to_ist_iso(row_dict, timestamp_keys):
    if not row_dict:
        return row_dict
    for key in timestamp_keys:
        original_value_str = row_dict.get(key)
        if isinstance(original_value_str, str) and original_value_str:
            try:
                # Try parsing with microseconds first, then without
                try:
                    naive_dt = datetime.strptime(original_value_str, '%Y-%m-%d %H:%M:%S.%f')
                except ValueError:
                    naive_dt = datetime.strptime(original_value_str, '%Y-%m-%d %H:%M:%S')

                # Localize the naive datetime (assumed to be stored as IST representation) to IST
                ist_aware_dt = IST.localize(naive_dt)
                row_dict[key] = ist_aware_dt.isoformat()
            except ValueError as e:
                app.logger.warning(f"Timestamp conversion: Could not parse timestamp string '{original_value_str}' for key '{key}'. Error: {e}. Leaving original.")
            except Exception as e_global: # Catch any other unexpected error during conversion
                app.logger.error(f"Timestamp conversion: Unexpected error for key '{key}', value '{original_value_str}': {e_global}")
        # If it's already a datetime object (e.g. from datetime.now(IST) directly)
        elif isinstance(original_value_str, datetime):
            if original_value_str.tzinfo is None: # If it's a naive datetime object
                # Assume it's intended to be IST, localize it
                try:
                    ist_aware_dt = IST.localize(original_value_str)
                    row_dict[key] = ist_aware_dt.isoformat()
                except Exception as e_localize:
                    app.logger.error(f"Timestamp conversion: Error localizing naive datetime for key '{key}': {e_localize}")
            else: # It's already timezone-aware, just ensure it's in ISO format
                row_dict[key] = original_value_str.isoformat()

    return row_dict

# --- Configuration Notes for Large File Uploads ---
# Flask's MAX_CONTENT_LENGTH:
# Set in Flask app config, e.g., app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024 # 1 GB
# This affects the maximum size of the entire request, including all parts of multipart/form-data.
# For chunked uploads, individual chunks must be smaller than this limit.

# Web Server (Gunicorn/Nginx) Timeouts and Body Size Limits:
# Gunicorn: --timeout <seconds> (e.g., 300 for 5 minutes)
# Nginx: client_max_body_size <size>; (e.g., 1G)
#        proxy_read_timeout <seconds>;
#        proxy_send_timeout <seconds>;
# These need to be configured to allow large requests and sufficient time for uploads.
# For chunked uploads, the timeout applies to each chunk's request.
# The client_max_body_size should be larger than the MAX_CONTENT_LENGTH in Flask for individual chunks.
# If not using chunking and sending whole large files, these limits must accommodate the entire file size.

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

# --- Maintenance Mode Helper ---
def is_maintenance_mode_active():
    """Checks if maintenance mode is active. Defaults to False on error or if setting not found."""
    try:
        db = get_db()
        # Ensure the system_settings table and the specific setting exist.
        # The schema.sql should initialize 'maintenance_mode' to FALSE (0).
        setting = db.execute("SELECT is_enabled FROM system_settings WHERE setting_name = 'maintenance_mode'").fetchone()
        if setting:
            return bool(setting['is_enabled'])
        else:
            # This case means the setting row is missing, which shouldn't happen with proper DB schema init.
            app.logger.warning("Maintenance mode setting 'maintenance_mode' not found in system_settings. Defaulting to False.")
            return False
    except sqlite3.Error as e:
        app.logger.error(f"Database error checking maintenance mode: {e}. Defaulting to False.")
        return False
    except Exception as e: # Catch any other unexpected errors
        app.logger.error(f"Unexpected error checking maintenance mode: {e}. Defaulting to False.")
        return False

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def find_user_by_id(user_id):
    return get_db().execute("SELECT id, username, password_hash, email, role, is_active, created_at, password_reset_required, profile_picture_filename FROM users WHERE id = ?", (user_id,)).fetchone()

def find_user_by_username(username):
    return get_db().execute("SELECT id, username, password_hash, email, role, is_active, created_at, password_reset_required, profile_picture_filename FROM users WHERE username = ?", (username,)).fetchone()

def find_user_by_email(email):
    if not email or not email.strip(): return None
    return get_db().execute("SELECT * FROM users WHERE email = ?", (email.strip(),)).fetchone()

def create_user_in_db(username, password, email=None, role='user', profile_picture_filename=None):
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    actual_email = email.strip() if email and email.strip() else None
    try:
        cursor = get_db().execute(
            "INSERT INTO users (username, password_hash, email, role, profile_picture_filename) VALUES (?, ?, ?, ?, ?)",
            (username, hashed_password, actual_email, role, profile_picture_filename)
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
            if not user:
                return jsonify(msg="User not found or invalid token."), 401 # Or 403

            if is_maintenance_mode_active():
                if user['role'] != 'super_admin':
                    # During maintenance, only super_admins can access admin_required routes
                    log_audit_action(
                        action_type='ADMIN_ACCESS_DENIED_MAINTENANCE',
                        user_id=user['id'], username=user['username'],
                        details={'route_attempted': request.path}
                    )
                    return jsonify(msg="System is currently undergoing maintenance. Only super administrators have access.", maintenance_mode_active=True), 503
            else: # Not in maintenance mode, original logic applies
                if user['role'] not in ['admin', 'super_admin']:
                    return jsonify(msg="Administration rights required."), 403
            
        except ValueError:
             return jsonify(msg="Invalid user identity in token."), 400
        except Exception as e:
            app.logger.error(f"Error in admin_required decorator: {e}")
            return jsonify(msg="An internal error occurred during authorization."), 500
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
            expires_at = datetime.now(IST) + timedelta(hours=1) # Changed to IST
            
            db.execute(
                "INSERT INTO password_reset_requests (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token, user_id, expires_at.strftime('%Y-%m-%d %H:%M:%S')) # Format to string for DB
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
        # expires_at from DB is 'YYYY-MM-DD HH:MM:SS' string representing IST (naive)
        expires_at_naive = datetime.fromisoformat(token_data['expires_at'])
        expires_at_dt = IST.localize(expires_at_naive) # Make it IST aware

        if expires_at_dt < datetime.now(IST): # Compare with current IST time
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
        users_list_raw = [dict(row) for row in users_cursor.fetchall()]
        timestamp_keys = ['created_at']
        users_list = [convert_timestamps_to_ist_iso(user, timestamp_keys) for user in users_list_raw]
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


@app.route('/api/superadmin/users/create', methods=['POST'])
@jwt_required()
@super_admin_required
def superadmin_create_user():
    db = get_db()
    data = request.get_json()

    if not data:
        return jsonify(msg="Missing JSON data"), 400

    username = data.get('username')
    password = data.get('password')
    email = data.get('email')  # Optional
    role = data.get('role')
    security_answers = data.get('security_answers')

    # --- Initial Presence Validation ---
    if not username or not isinstance(username, str) or not username.strip():
        return jsonify(msg="Username (string) is required."), 400
    if not password or not isinstance(password, str): # Further strength validation later
        return jsonify(msg="Password (string) is required."), 400
    if not role or not isinstance(role, str):
        return jsonify(msg="Role (string) is required."), 400
    if not security_answers or not isinstance(security_answers, list):
        return jsonify(msg="Security answers (array of objects) are required."), 400

    username = username.strip()
    if email and isinstance(email, str):
        email = email.strip()
    else:
        email = None # Ensure email is None if not provided or not a string

    # --- Password Strength Validation ---
    is_strong, strength_msg = is_password_strong(password)
    if not is_strong:
        return jsonify(msg=strength_msg), 400

    # --- Username and Email Uniqueness Validation ---
    if find_user_by_username(username):
        return jsonify(msg="Username already exists."), 409
    if email and find_user_by_email(email):
        return jsonify(msg="Email address already registered."), 409

    # --- Role Validation ---
    valid_roles = ['user', 'admin', 'super_admin']
    if role not in valid_roles:
        return jsonify(msg=f"Invalid role. Must be one of: {', '.join(valid_roles)}."), 400

    # --- Security Answers Validation ---
    if len(security_answers) != 3:
        return jsonify(msg="Exactly three security answers are required."), 400

    question_ids = []
    for ans_obj in security_answers:
        if not isinstance(ans_obj, dict) or 'question_id' not in ans_obj or 'answer' not in ans_obj:
            return jsonify(msg="Each security answer must be an object with 'question_id' and 'answer'."), 400
        if not isinstance(ans_obj['question_id'], int):
            return jsonify(msg="Each 'question_id' must be an integer."), 400
        if not isinstance(ans_obj['answer'], str) or not ans_obj['answer'].strip():
            return jsonify(msg="Each security 'answer' must be a non-empty string."), 400
        question_ids.append(ans_obj['question_id'])

    if len(set(question_ids)) != 3:
        return jsonify(msg="All three 'question_id's must be unique."), 400

    # Check if question_ids are valid by querying the database
    placeholders = ','.join(['?'] * len(question_ids))
    query = f"SELECT COUNT(id) FROM security_questions WHERE id IN ({placeholders})"
    cursor = db.execute(query, question_ids)
    count_row = cursor.fetchone()
    if count_row is None or count_row[0] != 3:
        return jsonify(msg="One or more provided security question IDs are invalid."), 400

    # --- User Creation Logic ---
    try:
        # Random profile picture assignment (similar to /api/auth/register)
        profile_picture_filename_to_assign = None
        default_pics_dir = app.config['DEFAULT_PROFILE_PICTURES_FOLDER']
        user_pics_dir = app.config['PROFILE_PICTURES_UPLOAD_FOLDER']
        available_default_pics = []
        try:
            available_default_pics = [f for f in os.listdir(default_pics_dir) if os.path.isfile(os.path.join(default_pics_dir, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))]
        except FileNotFoundError:
            app.logger.warning(f"Default profile pictures directory not found: {default_pics_dir}. Cannot assign random picture.")

        if available_default_pics:
            chosen_default_pic_name = random.choice(available_default_pics)
            original_default_pic_path = os.path.join(default_pics_dir, chosen_default_pic_name)
            ext = chosen_default_pic_name.rsplit('.', 1)[1].lower() if '.' in chosen_default_pic_name else 'jpg'
            new_user_specific_filename = f"{uuid.uuid4().hex}.{ext}"
            new_user_specific_path = os.path.join(user_pics_dir, new_user_specific_filename)
            try:
                shutil.copy2(original_default_pic_path, new_user_specific_path)
                profile_picture_filename_to_assign = new_user_specific_filename
            except Exception as e_copy:
                app.logger.error(f"Error copying default profile picture for superadmin user creation: {e_copy}")
                # User will have no profile picture in this error case, which is acceptable.
        else:
            app.logger.warning(f"No suitable default profile pictures found in {default_pics_dir} for superadmin user creation. User will have no profile picture.")

        # Create user in DB
        # create_user_in_db hashes the password internally
        user_id, assigned_role = create_user_in_db(
            username,
            password,
            email,
            role, # Use the role specified by the superadmin
            profile_picture_filename_to_assign
        )

        if not user_id:
            # Attempt to clean up copied profile picture if user creation failed
            if profile_picture_filename_to_assign and os.path.exists(os.path.join(user_pics_dir, profile_picture_filename_to_assign)):
                try:
                    os.remove(os.path.join(user_pics_dir, profile_picture_filename_to_assign))
                except Exception as e_clean:
                    app.logger.error(f"Error cleaning up profile picture after failed user creation by superadmin: {e_clean}")
            return jsonify(msg="Failed to create user due to a database issue."), 500

        # Store hashed security answers
        for ans in security_answers:
            hashed_answer = bcrypt.generate_password_hash(ans['answer']).decode('utf-8')
            db.execute(
                "INSERT INTO user_security_answers (user_id, question_id, answer_hash) VALUES (?, ?, ?)",
                (user_id, ans['question_id'], hashed_answer)
            )

        db.commit()

        # Log audit action
        log_audit_action(
            action_type='SUPERADMIN_CREATE_USER',
            target_table='users',
            target_id=user_id,
            details={
                'created_username': username,
                'created_email': email,
                'assigned_role': assigned_role,
                'profile_picture_assigned': profile_picture_filename_to_assign or 'None',
                'security_questions_set': True
            }
            # The acting superadmin's ID/username will be logged automatically by log_audit_action
        )

        # Fetch the created user's details to return (excluding password)
        new_user_details_raw = find_user_by_id(user_id)
        if not new_user_details_raw: # Should not happen
             app.logger.error(f"Superadmin_create_user: Could not fetch newly created user ID {user_id}")
             return jsonify(msg="User created, but failed to retrieve details."), 500

        new_user_details = convert_timestamps_to_ist_iso(dict(new_user_details_raw), ['created_at'])

        return jsonify({
            "id": new_user_details['id'],
            "username": new_user_details['username'],
            "email": new_user_details['email'],
            "role": new_user_details['role'],
            "is_active": new_user_details['is_active'],
            "created_at": new_user_details['created_at'], # Already ISO formatted by helper
            "profile_picture_filename": new_user_details['profile_picture_filename'],
            "profile_picture_url": f"/profile_pictures/{new_user_details['profile_picture_filename']}" if new_user_details['profile_picture_filename'] else None,
            "password_reset_required": new_user_details['password_reset_required']

        }), 201

    except sqlite3.IntegrityError as e:
        db.rollback()
        app.logger.error(f"Superadmin_create_user DB IntegrityError: {e}")
        # Attempt to clean up copied profile picture on integrity error (e.g., security answers)
        if profile_picture_filename_to_assign and os.path.exists(os.path.join(user_pics_dir, profile_picture_filename_to_assign)):
            # This cleanup might be redundant if user creation failed and cleaned up already,
            # but good for robustness if create_user_in_db succeeded but security answers failed.
            try:
                os.remove(os.path.join(user_pics_dir, profile_picture_filename_to_assign))
            except Exception as e_clean_integrity:
                app.logger.error(f"Error cleaning profile picture on integrity error for superadmin user creation: {e_clean_integrity}")
        return jsonify(msg=f"Database integrity error during user creation: {e}"), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Superadmin_create_user General Exception: {e}", exc_info=True)
        # Attempt to clean up copied profile picture on general error
        if profile_picture_filename_to_assign and os.path.exists(os.path.join(user_pics_dir, profile_picture_filename_to_assign)):
            try:
                os.remove(os.path.join(user_pics_dir, profile_picture_filename_to_assign))
            except Exception as e_clean_general:
                app.logger.error(f"Error cleaning profile picture on general error for superadmin user creation: {e_clean_general}")
        return jsonify(msg=f"An unexpected server error occurred: {e}"), 500

# --- Super Admin File Permission Management Endpoints ---
@app.route('/api/superadmin/users/<int:user_id>/permissions', methods=['GET'])
@jwt_required()
@super_admin_required
def get_user_file_permissions(user_id):
    db = get_db()
    target_user = find_user_by_id(user_id)
    if not target_user:
        return jsonify(msg="User not found."), 404

    try:
        permissions_cursor = db.execute(
            "SELECT id, file_id, file_type, can_view, can_download, created_at, updated_at FROM file_permissions WHERE user_id = ?",
            (user_id,)
        )
        permissions = [dict(row) for row in permissions_cursor.fetchall()]

        log_audit_action(
            action_type='GET_USER_FILE_PERMISSIONS',
            target_table='users',
            target_id=user_id,
            details={'retrieved_for_user_id': user_id, 'permission_count': len(permissions)}
        )
        timestamp_keys_perms = ['created_at', 'updated_at']
        processed_permissions = [convert_timestamps_to_ist_iso(dict(perm), timestamp_keys_perms) for perm in permissions]
        return jsonify(processed_permissions), 200
    except Exception as e:
        app.logger.error(f"Error fetching file permissions for user {user_id}: {e}")
        return jsonify(msg="Failed to retrieve file permissions due to a server error."), 500

@app.route('/api/superadmin/users/<int:user_id>/permissions', methods=['PUT'])
@jwt_required()
@super_admin_required
def update_user_file_permissions(user_id):
    app.logger.info(f"update_user_file_permissions called for user_id: {user_id}")
    db = get_db()
    acting_super_admin_id = int(get_jwt_identity()) # For logging

    target_user = find_user_by_id(user_id)
    if not target_user:
        app.logger.warning(f"Target user {user_id} not found.")
        return jsonify(msg="Target user not found."), 404

    permissions_data = request.get_json()
    app.logger.info(f"Received permissions_data for user_id {user_id}: {json.dumps(permissions_data)}")

    if not isinstance(permissions_data, list):
        app.logger.warning(f"permissions_data is not a list for user_id {user_id}. Type: {type(permissions_data)}")
        return jsonify(msg="Request body must be a list of permission objects."), 400

    # Allowed file types for permissions, align with your application's file types
    # This should ideally come from a shared constant or configuration if available.
    VALID_FILE_TYPES_FOR_PERMISSIONS = ['document', 'patch', 'link', 'misc_file']
    
    processed_count = 0
    errors = []

    for i, perm_data in enumerate(permissions_data):
        app.logger.info(f"Processing perm_data item {i} for user_id {user_id}: {json.dumps(perm_data)}")
        if not isinstance(perm_data, dict):
            error_msg = "Each item in the list must be a permission object (dictionary)."
            app.logger.warning(f"Validation failed for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}")
            errors.append(error_msg)
            continue

        file_id = perm_data.get('file_id')
        file_type = perm_data.get('file_type')
        can_view = perm_data.get('can_view')
        can_download = perm_data.get('can_download')

        # Validation
        if not isinstance(file_id, int) or file_id <= 0:
            error_msg = f"Invalid 'file_id': {file_id}. Must be a positive integer."
            app.logger.warning(f"Validation failed for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}")
            errors.append(error_msg)
            continue
        if not isinstance(file_type, str) or file_type not in VALID_FILE_TYPES_FOR_PERMISSIONS:
            error_msg = f"Invalid 'file_type': {file_type}. Allowed types: {', '.join(VALID_FILE_TYPES_FOR_PERMISSIONS)}."
            app.logger.warning(f"Validation failed for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}")
            errors.append(error_msg)
            continue
        if not isinstance(can_view, bool):
            error_msg = f"Invalid 'can_view' value for file_id {file_id} (type: {file_type}). Must be boolean."
            app.logger.warning(f"Validation failed for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}")
            errors.append(error_msg)
            continue
        if not isinstance(can_download, bool):
            error_msg = f"Invalid 'can_download' value for file_id {file_id} (type: {file_type}). Must be boolean."
            app.logger.warning(f"Validation failed for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}")
            errors.append(error_msg)
            continue
        
        # Here you might want to add validation that file_id and file_type combination actually exists
        # e.g., SELECT 1 FROM documents WHERE id = ? (if file_type == 'document')
        # For brevity, this example omits that deep validation.

        try:
            # UPSERT logic for file_permissions
            # The file_permissions table has a UNIQUE constraint on (user_id, file_id, file_type)
            # and created_at/updated_at are handled by DEFAULT and a trigger respectively.
            cursor = db.execute("""
                INSERT INTO file_permissions (user_id, file_id, file_type, can_view, can_download, updated_at)
                VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                ON CONFLICT(user_id, file_id, file_type) DO UPDATE SET
                    can_view = excluded.can_view,
                    can_download = excluded.can_download,
                    updated_at = excluded.updated_at
            """, (user_id, file_id, file_type, can_view, can_download))
            
            if cursor.rowcount > 0: # Indicates an insert or update occurred
                processed_count += 1
            # No specific error if rowcount is 0 for an UPSERT unless an actual error occurs.
            # An UPSERT that results in no change (same values) might report 0 affected rows in some SQLite versions/contexts.
            # For this logic, we count it if the command was successful and didn't raise an exception.
            app.logger.info(f"Successfully UPSERTED permission for user_id {user_id}, file_id {file_id}, file_type {file_type}. Rowcount: {cursor.rowcount}")

        except sqlite3.IntegrityError as e_int:
            # This might catch FK violations if user_id is somehow invalid (though checked)
            # or other integrity issues not covered by ON CONFLICT.
            error_msg = f"Database integrity error for file_id {file_id} (type: {file_type}): {e_int}"
            app.logger.error(f"DB IntegrityError for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}. Exception: {e_int}", exc_info=True)
            errors.append(error_msg)
        except Exception as e_gen:
            error_msg = f"General error processing file_id {file_id} (type: {file_type}): {e_gen}"
            app.logger.error(f"General error for user_id {user_id}, item {i}: {error_msg}. Data: {perm_data}. Exception: {e_gen}", exc_info=True)
            errors.append(error_msg)

    if errors:
        app.logger.warning(f"Rolling back transaction for user_id {user_id} due to errors: {errors}")
        db.rollback() # Rollback if any error occurred during processing of items
        log_audit_action(
            action_type='UPDATE_USER_FILE_PERMISSIONS_FAILED',
            target_table='users', target_id=user_id,
            details={'reason': 'Validation or DB errors', 'errors_list': errors, 'permissions_provided_count': len(permissions_data)}
        )
        return jsonify(msg="Errors occurred while updating permissions. No changes were saved.", errors=errors), 400
    
    try:
        db.commit()
        log_audit_action(
            action_type='UPDATE_USER_FILE_PERMISSIONS_SUCCESS',
            target_table='users', target_id=user_id,
            details={
                'updated_for_user_id': user_id,
                'permissions_processed_count': processed_count,
                'permissions_provided_count': len(permissions_data)
            }
        )
        # Fetch updated permissions to return
        updated_permissions_cursor = db.execute(
            "SELECT id, file_id, file_type, can_view, can_download, created_at, updated_at FROM file_permissions WHERE user_id = ?",
            (user_id,)
        )
        updated_permissions_raw = [dict(row) for row in updated_permissions_cursor.fetchall()]
        timestamp_keys_perms_upd = ['created_at', 'updated_at']
        updated_permissions = [convert_timestamps_to_ist_iso(perm, timestamp_keys_perms_upd) for perm in updated_permissions_raw]
        return jsonify(msg=f"Successfully processed {processed_count} permission(s) for user {user_id}.", permissions=updated_permissions), 200
    except Exception as e_commit:
        db.rollback() # Rollback on commit error
        app.logger.error(f"Error committing file permissions for user {user_id}: {e_commit}")
        log_audit_action(
            action_type='UPDATE_USER_FILE_PERMISSIONS_FAILED',
            target_table='users', target_id=user_id,
            details={'reason': 'Commit error', 'error_message': str(e_commit)}
        )
        return jsonify(msg="Failed to save updated file permissions due to a server error during commit."), 500

# --- Authentication Endpoints ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    app.logger.info(f"Register request Content-Type: {request.headers.get('Content-Type')}")
    if 'profile_picture' in request.files:
        profile_picture_file_log = request.files['profile_picture']
        app.logger.info(f"Profile picture filename: {profile_picture_file_log.filename}, content_type: {profile_picture_file_log.content_type}")
    # Handle multipart/form-data for profile picture upload
    if 'profile_picture' in request.files:
        username = request.form.get('username')
        password = request.form.get('password')
        email = request.form.get('email')
        security_answers_str = request.form.get('security_answers')
        profile_picture_file = request.files.get('profile_picture')
    else: # Logic for JSON request
        data = request.get_json()
        if not data: return jsonify(msg="Missing JSON data"), 400
        username = data.get('username')
        password = data.get('password')
        email = data.get('email') # Optional
        security_answers_str = data.get('security_answers')
        # profile_picture_file is not expected in JSON, will be handled by random assignment
        # profile_picture_file = None # No longer needed for JSON path

    if not username or not password: return jsonify(msg="Missing username or password"), 400
    if not security_answers_str: return jsonify(msg="Missing security_answers"), 400

    try:
        security_answers = json.loads(security_answers_str) if isinstance(security_answers_str, str) else security_answers_str
    except json.JSONDecodeError:
        return jsonify(msg="Invalid format for security_answers. Must be a valid JSON string if not an object."), 400


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
    
    db = get_db()
    placeholders = ','.join(['?'] * len(question_ids))
    query = f"SELECT COUNT(*) FROM security_questions WHERE id IN ({placeholders})"
    cursor = db.execute(query, question_ids)
    count_row = cursor.fetchone()
    if count_row is None or count_row[0] != 3:
        return jsonify(msg="One or more provided security question IDs are invalid."), 400

    is_strong, strength_msg = is_password_strong(password)
    if not is_strong:
        return jsonify(msg=strength_msg), 400

    if find_user_by_username(username): return jsonify(msg="Username already exists"), 409
    if email and find_user_by_email(email): return jsonify(msg="Email address already registered"), 409

    actual_email_for_log = email.strip() if email and email.strip() else None
    user_count_cursor = db.execute("SELECT COUNT(*) as count FROM users")
    user_count = user_count_cursor.fetchone()['count']
    role_to_assign = 'super_admin' if user_count == 0 else 'user'

    # For FormData (profile_picture_file might exist)
    profile_picture_filename_from_upload = None
    # profile_picture_saved_from_upload = False # Not strictly needed

    if 'profile_picture' in request.files and profile_picture_file and profile_picture_file.filename != '': # This is the FormData path
        # This part handles FormData with an uploaded profile picture
        if allowed_file(profile_picture_file.filename):
            original_filename = secure_filename(profile_picture_file.filename)
            ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
            profile_picture_filename_from_upload = f"{uuid.uuid4().hex}.{ext}"
            file_save_path = os.path.join(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], profile_picture_filename_from_upload)
            try:
                profile_picture_file.save(file_save_path)
            except Exception as e:
                app.logger.error(f"Error saving profile picture during FormData upload: {e}")
                return jsonify(msg="Error saving profile picture."), 500
        else:
            return jsonify(msg="Invalid profile picture file type."), 400
        # User is created with the uploaded picture filename
        user_id, assigned_role = create_user_in_db(username, password, email, role_to_assign, profile_picture_filename_from_upload)
    else: # JSON request path (or FormData without a profile picture file)
        # User is created with NO profile picture filename initially
        user_id, assigned_role = create_user_in_db(username, password, email, role_to_assign, None)

    if user_id:
        try:
            for ans in security_answers:
                hashed_answer = bcrypt.generate_password_hash(ans['answer']).decode('utf-8')
                db.execute(
                    "INSERT INTO user_security_answers (user_id, question_id, answer_hash) VALUES (?, ?, ?)",
                    (user_id, ans['question_id'], hashed_answer)
                )
            db.commit() # Commit security answers

            # profile_picture_filename_to_assign will hold the final filename for the user
            profile_picture_filename_to_assign = profile_picture_filename_from_upload # None if JSON or no file in FormData

            if not profile_picture_filename_to_assign: # True for JSON path or if FormData had no picture
                # Implement random picture assignment logic (revised)
                default_pics_dir = app.config['DEFAULT_PROFILE_PICTURES_FOLDER']
                user_pics_dir = app.config['PROFILE_PICTURES_UPLOAD_FOLDER'] # User-specific pictures
                available_default_pics = []
                try:
                    available_default_pics = [f for f in os.listdir(default_pics_dir) if os.path.isfile(os.path.join(default_pics_dir, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))]
                except FileNotFoundError:
                    app.logger.warning(f"Default profile pictures directory not found: {default_pics_dir}. Cannot assign random picture.")
                
                if available_default_pics:
                    chosen_default_pic_name = random.choice(available_default_pics)
                    original_default_pic_path = os.path.join(default_pics_dir, chosen_default_pic_name)
                    
                    # Create a new unique filename for this user's copy of the default avatar
                    ext = chosen_default_pic_name.rsplit('.', 1)[1].lower() if '.' in chosen_default_pic_name else 'jpg' # default to jpg
                    new_user_specific_filename = f"{uuid.uuid4().hex}.{ext}"
                    new_user_specific_path = os.path.join(user_pics_dir, new_user_specific_filename)
                    
                    try:
                        shutil.copy2(original_default_pic_path, new_user_specific_path)
                        profile_picture_filename_to_assign = new_user_specific_filename
                        # Update the user record with the new user-specific filename (copy of default)
                        db.execute("UPDATE users SET profile_picture_filename = ? WHERE id = ?", 
                                   (profile_picture_filename_to_assign, user_id))
                        db.commit() 
                        app.logger.info(f"Assigned a copy of default profile picture '{chosen_default_pic_name}' as '{profile_picture_filename_to_assign}' to user_id {user_id}")
                    except Exception as e_copy:
                        app.logger.error(f"Error copying default profile picture '{chosen_default_pic_name}' to '{new_user_specific_filename}' for user_id {user_id}: {e_copy}")
                        # User will have no profile picture in this error case
                        profile_picture_filename_to_assign = None 
                else:
                    app.logger.warning(f"No suitable default profile pictures found in {default_pics_dir} to assign randomly to user_id {user_id}. User will have no profile picture.")
                    profile_picture_filename_to_assign = None # Ensure it's None if no pic assigned
            
            # Ensure actual_email_for_log is defined for audit logging
            actual_email_for_log = email.strip() if email and email.strip() else None # Defined here for clarity
            log_audit_action(
                action_type='CREATE_USER',
                target_table='users',
                target_id=user_id,
                details={
                    'username': username, 
                    'email': actual_email_for_log, 
                    'role': assigned_role, 
                    'security_questions_set': True,
                    'profile_picture_assigned': profile_picture_filename_to_assign if profile_picture_filename_to_assign else 'None'
                },
                user_id=user_id, 
                username=username
            )
            access_token = create_access_token(identity=str(user_id))
            # Update profile_picture_url construction
            profile_picture_url = f"/profile_pictures/{profile_picture_filename_to_assign}" if profile_picture_filename_to_assign else None
            
            return jsonify(
                msg="User created successfully", 
                user_id=user_id, 
                role=assigned_role,
                access_token=access_token,
                username=username,
                profile_picture_url=profile_picture_url
            ), 201
        except sqlite3.IntegrityError as e:
            db.rollback() 
            app.logger.error(f"DB IntegrityError storing security answers for user '{username}': {e}")
            # No os.remove needed here for JSON path, as no file was directly uploaded and saved *before* this try block.
            # If it was FormData with a file, the file (profile_picture_filename_from_upload) is associated with the created user.
            # If security answers fail, the user and their (uploaded) picture persist. This is acceptable.
            return jsonify(msg="User created, but failed to store security answers due to a database conflict."), 500
        except Exception as e:
            db.rollback()
            app.logger.error(f"General Exception storing security answers for user '{username}': {e}")
            # Similarly, no os.remove needed here for JSON path for reasons stated above.
            return jsonify(msg="User created, but failed to store security answers due to a server error."), 500
    else: # user_id was None from create_user_in_db (meaning user creation failed)
        # This block is for when create_user_in_db itself fails.
        # If a profile picture was uploaded via FormData and saved (profile_picture_filename_from_upload exists),
        # but then create_user_in_db failed, then that uploaded picture is orphaned and should be deleted.
        if profile_picture_filename_from_upload and os.path.exists(os.path.join(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], profile_picture_filename_from_upload)):
            try:
                os.remove(os.path.join(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], profile_picture_filename_from_upload))
                app.logger.info(f"Cleaned up orphaned profile picture {profile_picture_filename_from_upload} after failed user creation for {username}.")
            except Exception as e_clean:
                app.logger.error(f"Error cleaning up orphaned profile picture {profile_picture_filename_from_upload} after failed user creation: {e_clean}")
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
            log_audit_action(
                action_type='USER_LOGIN_FAILED_INACTIVE',
                target_table='users',
                target_id=user['id'],
                user_id=user['id'], 
                username=user['username'], 
                details={'reason': 'Account deactivated'}
            )
            return jsonify(msg="Account deactivated."), 403

        # Maintenance mode check for non-super_admin users
        if is_maintenance_mode_active():
            if user['role'] != 'super_admin':
                log_audit_action(
                    action_type='USER_LOGIN_DENIED_MAINTENANCE',
                    target_table='users',
                    target_id=user['id'],
                    user_id=user['id'],
                    username=user['username'],
                    details={'reason': 'Maintenance mode active'}
                )
                return jsonify({"msg": "System is currently undergoing maintenance. Only super administrators can log in at this time.", "maintenance_mode_active": True}), 503
        
        access_token = create_access_token(identity=str(user['id'])) 
        log_audit_action(
            action_type='USER_LOGIN',
            target_table='users',
            target_id=user['id'],
            user_id=user['id'], # Explicitly pass logged-in user's ID
            username=user['username'] # Explicitly pass logged-in user's username
        )
        # Include password_reset_required flag in the response
        raw_password_reset_flag = None
        raw_password_reset_flag_type = None
        if 'password_reset_required' in user.keys():
            raw_password_reset_flag = user['password_reset_required']
            raw_password_reset_flag_type = type(user['password_reset_required']).__name__
        app.logger.debug(f"[Login Debug] Raw user['password_reset_required']: {raw_password_reset_flag}")
        app.logger.debug(f"[Login Debug] Type of user['password_reset_required']: {raw_password_reset_flag_type}")
        password_reset_required = user['password_reset_required'] if 'password_reset_required' in user.keys() and user['password_reset_required'] is not None else False
        app.logger.debug(f"[Login Debug] Calculated password_reset_required for JSON response: {password_reset_required}")
        app.logger.debug(f"[Login Debug] Type of calculated password_reset_required for JSON response: {type(password_reset_required).__name__}")
        
        profile_picture_url = None
        if user['profile_picture_filename']:
            profile_picture_url = f"/profile_pictures/{user['profile_picture_filename']}"

        return jsonify(
            access_token=access_token, 
            username=user['username'], 
            role=user['role'],
            user_id=user['id'], 
            password_reset_required=password_reset_required,
            profile_picture_url=profile_picture_url # Added
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

@app.route('/api/user/profile/upload-picture', methods=['POST'])
@jwt_required()
def upload_profile_picture():
    current_user_id = int(get_jwt_identity())
    user = find_user_by_id(current_user_id)
    if not user:
        return jsonify(msg="User not found."), 404

    if 'profile_picture' not in request.files:
        return jsonify(msg="No profile picture file part in request."), 400
    
    file = request.files['profile_picture']
    if file.filename == '':
        return jsonify(msg="No selected file for profile picture."), 400

    if file and allowed_file(file.filename): # Add more specific image validation if needed
        original_filename = secure_filename(file.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        new_filename = f"{uuid.uuid4().hex}.{ext}"
        save_path = os.path.join(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], new_filename)

        try:
            # Delete old profile picture if it exists
            old_filename = user['profile_picture_filename']
            if old_filename:
                old_file_path = os.path.join(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], old_filename)
                if os.path.exists(old_file_path):
                    os.remove(old_file_path)
                    app.logger.info(f"Deleted old profile picture {old_filename} for user {current_user_id}")

            file.save(save_path)

            db = get_db()
            db.execute("UPDATE users SET profile_picture_filename = ? WHERE id = ?", (new_filename, current_user_id))
            db.commit()

            log_audit_action(
                action_type='PROFILE_PICTURE_UPDATED',
                target_table='users',
                target_id=current_user_id,
                details={'new_filename': new_filename, 'old_filename': old_filename}
            )
            
            profile_picture_url = f"/profile_pictures/{new_filename}"
            return jsonify(msg="Profile picture updated successfully.", profile_picture_url=profile_picture_url), 200

        except Exception as e:
            app.logger.error(f"Error uploading profile picture for user {current_user_id}: {e}")
            # Attempt to clean up newly saved file if DB update fails or other error occurs mid-process
            if os.path.exists(save_path):
                try:
                    os.remove(save_path)
                except Exception as e_clean:
                    app.logger.error(f"Error cleaning up partially saved profile picture {save_path}: {e_clean}")
            return jsonify(msg="Server error during profile picture upload."), 500
    else:
        return jsonify(msg="Invalid file type for profile picture."), 400


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

@app.route('/api/user/profile/update-username', methods=['PUT'])
@jwt_required()
def update_username():
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    user = find_user_by_id(current_user_id)
    if not user:
        return jsonify(msg="User not found."), 404

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    new_username = data.get('new_username')
    current_password = data.get('current_password')

    if not new_username or not current_password:
        return jsonify(msg="Missing new_username or current_password"), 400
    
    new_username = new_username.strip()
    if not new_username:
        return jsonify(msg="New username cannot be empty."), 400

    if not bcrypt.check_password_hash(user['password_hash'], current_password):
        log_audit_action(
            action_type='UPDATE_USERNAME_FAILED', target_table='users', target_id=current_user_id,
            details={'reason': 'Incorrect password', 'attempted_new_username': new_username}
        )
        return jsonify(msg="Incorrect password."), 401

    # Check username availability (case-insensitive)
    db = get_db()
    existing_user_with_new_username = db.execute(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
        (new_username, current_user_id)
    ).fetchone()

    if existing_user_with_new_username:
        log_audit_action(
            action_type='UPDATE_USERNAME_FAILED', target_table='users', target_id=current_user_id,
            details={'reason': 'Username already taken', 'attempted_new_username': new_username}
        )
        return jsonify(msg="Username already taken"), 409

    try:
        old_username = user['username']
        db.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, current_user_id))
        log_audit_action(
            action_type='USERNAME_UPDATED',
            target_table='users',
            target_id=current_user_id,
            details={'old_username': old_username, 'new_username': new_username}
        )
        db.commit()
        # Re-fetch user to confirm and potentially get updated details if needed by frontend immediately
        # Though for username change, the new username is already known.
        # Consider if the JWT needs to be re-issued if username is part of its payload claims (not by default with user_id as identity).
        return jsonify(msg="Username updated successfully", new_username=new_username), 200
    except sqlite3.IntegrityError as e: # Should be caught by the check above, but as a safeguard
        db.rollback()
        app.logger.error(f"DB IntegrityError updating username for user {current_user_id}: {e}")
        log_audit_action(
            action_type='UPDATE_USERNAME_FAILED', target_table='users', target_id=current_user_id,
            details={'reason': f'Database integrity error: {e}', 'attempted_new_username': new_username}
        )
        return jsonify(msg="Username already taken or database error."), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Error updating username for user {current_user_id}: {e}")
        log_audit_action(
            action_type='UPDATE_USERNAME_FAILED', target_table='users', target_id=current_user_id,
            details={'reason': f'Server error: {e}', 'attempted_new_username': new_username}
        )
        return jsonify(msg="Failed to update username due to a server error."), 500

# --- User Dashboard Layout Preferences Endpoints ---
@app.route('/api/user/dashboard-layout', methods=['GET'])
@jwt_required()
def get_dashboard_layout():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    db = get_db()
    user_prefs_row = db.execute("SELECT dashboard_layout_prefs FROM users WHERE id = ?", (user_id,)).fetchone()

    if user_prefs_row and user_prefs_row['dashboard_layout_prefs']:
        try:
            layout_prefs = json.loads(user_prefs_row['dashboard_layout_prefs'])
            return jsonify(layout_prefs), 200
        except json.JSONDecodeError:
            app.logger.error(f"Failed to parse dashboard_layout_prefs for user {user_id}. Data: {user_prefs_row['dashboard_layout_prefs']}")
            # Return a default or empty layout if parsing fails, or an error
            return jsonify(msg="Error parsing layout preferences."), 500 # Or return default: {}
    else:
        # No preferences set, return empty object (or a default layout)
        return jsonify({}), 200

@app.route('/api/user/dashboard-layout', methods=['PUT'])
@jwt_required()
def update_dashboard_layout():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 400

    new_layout_prefs = request.get_json()
    if new_layout_prefs is None: # Check if request body is valid JSON or empty
        return jsonify(msg="Invalid or missing JSON data in request body."), 400

    try:
        # Validate if it's a dictionary (JSON object) as expected for layout prefs
        if not isinstance(new_layout_prefs, dict):
            return jsonify(msg="Layout preferences must be a valid JSON object."), 400
            
        layout_prefs_json_string = json.dumps(new_layout_prefs)
    except TypeError:
        return jsonify(msg="Failed to serialize layout preferences to JSON string."), 500 # Should not happen if new_layout_prefs is from get_json() and is a dict

    db = get_db()
    try:
        # Fetch old preferences for logging if needed, or just log the fact of update
        # For brevity, we'll log that an update occurred without logging the old/new content of prefs.
        db.execute("UPDATE users SET dashboard_layout_prefs = ? WHERE id = ?", (layout_prefs_json_string, user_id))
        log_audit_action(
            action_type='UPDATE_DASHBOARD_LAYOUT',
            target_table='users', # Or a more specific target like 'user_preferences' if it were a separate table
            target_id=user_id,
            details={'message': 'User dashboard layout preferences updated.'}
            # Not logging the full layout JSON in audit details for brevity and potential size.
            # Could log a hash or summary if needed.
        )
        db.commit()
        return jsonify(msg="Dashboard layout preferences updated successfully."), 200
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error updating dashboard_layout_prefs for user {user_id}: {e}")
        return jsonify(msg="Failed to update dashboard layout preferences due to a database error."), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error updating dashboard_layout_prefs for user {user_id}: {e}")
        return jsonify(msg="An unexpected server error occurred."), 500

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
    # profiler = cProfile.Profile() # Removed
    # profiler.enable() # Removed

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
    base_query_select_fields = "d.id, d.software_id, d.doc_name, d.description, d.doc_type, d.is_external_link, d.download_link, d.stored_filename, d.original_filename_ref, d.file_size, d.file_type, d.created_by_user_id, u.username as uploaded_by_username, d.created_at, d.updated_by_user_id, upd_u.username as updated_by_username, d.updated_at, s.name as software_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = d.id AND c.item_type = 'document' AND c.parent_comment_id IS NULL) as comment_count"
    base_query_from = "FROM documents d JOIN software s ON d.software_id = s.id LEFT JOIN users u ON d.created_by_user_id = u.id LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id"
    
    params = [] # Parameters for the WHERE clause
    user_id_param_for_join = [] # Parameter for the JOIN clause (user_id for favorites)

    # Attempt to get user_id for favorites and permissions
    logged_in_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            logged_in_user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_documents_api: {e}")
    # app.logger.info(f"API Call - Logged in user ID: {logged_in_user_id}")

    # Base query components
    base_query_select_fields_with_aliases = "d.id, d.software_id, d.doc_name, d.description, d.doc_type, d.is_external_link, d.download_link, d.stored_filename, d.original_filename_ref, d.file_size, d.file_type, d.created_by_user_id, u.username as uploaded_by_username, d.created_at, d.updated_by_user_id, upd_u.username as updated_by_username, d.updated_at, s.name as software_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = d.id AND c.item_type = 'document' AND c.parent_comment_id IS NULL) as comment_count"
    
    # --- PERMISSION MODEL CHANGE ---
    # SQL conditions based on "default allow, explicit deny"
    # View: (fp.id IS NULL OR fp.can_view = 1)
    # Download: (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download = 0 THEN 0 ELSE 1 END)
    if logged_in_user_id:
        # Select favorite_id and is_downloadable based on the logged_in_user_id
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download = 0 THEN 0 ELSE 1 END) AS is_downloadable"
    else:
        # If no user is logged in, favorite_id is NULL.
        # is_downloadable logic: if fp_dl.id is NULL, it defaults to 1 (true).
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download = 0 THEN 0 ELSE 1 END) AS is_downloadable"

    from_clause = "FROM documents d JOIN software s ON d.software_id = s.id LEFT JOIN users u ON d.created_by_user_id = u.id LEFT JOIN users upd_u ON d.updated_by_user_id = upd_u.id"
    
    params = [] # Params for WHERE clause filters (like software_id_filter)
    # user_id_param_for_join is not used in this new logic structure for permissions directly.
    # Instead, logged_in_user_id is added to specific param lists for joins.
    permission_join_params = [logged_in_user_id] # Param for the LEFT JOIN fp.user_id = ?

    filter_conditions = []

    # Permission Join and Conditions
    # --- PERMISSION MODEL CHANGE ---
    # Default Allow, Explicit Deny
    # LEFT JOIN file_permissions for view permission
    from_clause += " LEFT JOIN file_permissions fp ON d.id = fp.file_id AND fp.file_type = 'document' AND fp.user_id = ?"
    # The view condition is now part of the WHERE clause.
    filter_conditions.append("(fp.id IS NULL OR fp.can_view = 1)")
    # logged_in_user_id for the view permission join is part of `permission_join_params`

    # Existing Filters
    if software_id_filter:
        filter_conditions.append("d.software_id = ?")
        params.append(software_id_filter)
    if doc_type_filter:
        filter_conditions.append("LOWER(d.doc_type) LIKE ?")
        params.append(f"%{doc_type_filter.lower()}%")
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

    # Count Query (reflects permission filtering)
    # For count_query, the logged_in_user_id for the permission join must also be included.
    count_params = permission_join_params + params # Combine params for join and filters
    count_query = f"SELECT COUNT(d.id) as count {from_clause}{where_clause}"
    
    try:
        # app.logger.info(f"Documents Count Query for user {logged_in_user_id}: {count_query}") # Removed
        # app.logger.info(f"Documents Count Params: {tuple(count_params)}") # Removed
        total_documents_cursor = db.execute(count_query, tuple(count_params))
        total_documents = total_documents_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total document count with permissions: {e} using query {count_query} and params {tuple(count_params)}")
        return jsonify(msg="Error fetching document count."), 500

    # Pagination Details
    total_pages = math.ceil(total_documents / per_page) if total_documents > 0 else 1
    offset = (page - 1) * per_page
    if page > total_pages and total_documents > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Main Data Query
    final_from_clause_for_data = from_clause 
    # final_params_for_data = list(permission_join_params) 
    # final_params_for_data.extend(params) 

    # New logic for assembling final_params_for_data
    final_params_for_data = list(permission_join_params)  # Start with permission join params

    if logged_in_user_id:
        # Add JOIN for favorite status
        final_from_clause_for_data += " LEFT JOIN user_favorites uf ON d.id = uf.item_id AND uf.item_type = 'document' AND uf.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for uf join
        
        # Add separate LEFT JOIN for download permission (fp_dl)
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON d.id = fp_dl.file_id AND fp_dl.file_type = 'document' AND fp_dl.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for fp_dl join
    else:
        # Add fp_dl join for anonymous users as well
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON d.id = fp_dl.file_id AND fp_dl.file_type = 'document' AND fp_dl.user_id = ?"
        final_params_for_data.append(None) # Param for fp_dl join (None for anonymous)

    final_params_for_data.extend(params) # Add WHERE clause filter parameters
    final_params_for_data.extend([per_page, offset]) # Add pagination params
    
    final_query = f"{select_clause} {final_from_clause_for_data}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    # app.logger.info(f"Final documents query: {final_query}")
    # app.logger.info(f"Final documents params: {tuple(final_params_for_data)}")
    try:
        # app.logger.info(f"Documents Data Query for user {logged_in_user_id}: {final_query}") # Removed
        # app.logger.info(f"Documents Data Params: {tuple(final_params_for_data)}") # Removed
        documents_cursor = db.execute(final_query, tuple(final_params_for_data))
        documents_list_raw = [dict(row) for row in documents_cursor.fetchall()]
        ts_keys = ['created_at', 'updated_at']
        documents_list = [convert_timestamps_to_ist_iso(doc, ts_keys) for doc in documents_list_raw]
    except Exception as e:
        app.logger.error(f"Error fetching paginated documents with permissions: {e} with query {final_query} and params {final_params_for_data}")
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
    base_query_select_fields = "p.id, p.version_id, p.patch_name, p.description, p.release_date, p.is_external_link, p.download_link, p.stored_filename, p.original_filename_ref, p.file_size, p.file_type, p.patch_by_developer, p.created_by_user_id, u.username as uploaded_by_username, p.created_at, p.updated_by_user_id, upd_u.username as updated_by_username, p.updated_at, s.name as software_name, s.id as software_id, v.version_number, (SELECT COUNT(*) FROM comments c WHERE c.item_id = p.id AND c.item_type = 'patch' AND c.parent_comment_id IS NULL) as comment_count"
    base_query_from = "FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id LEFT JOIN users u ON p.created_by_user_id = u.id LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id"
    
    params = [] 
    user_id_param_for_join = []

    # Attempt to get user_id for favorites and permissions
    logged_in_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            logged_in_user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_patches_api: {e}")

    # Base query components
    base_query_select_fields_with_aliases = "p.id, p.version_id, p.patch_name, p.description, p.release_date, p.is_external_link, p.download_link, p.stored_filename, p.original_filename_ref, p.file_size, p.file_type, p.patch_by_developer, p.created_by_user_id, u.username as uploaded_by_username, p.created_at, p.updated_by_user_id, upd_u.username as updated_by_username, p.updated_at, s.name as software_name, s.id as software_id, v.version_number, (SELECT COUNT(*) FROM comments c WHERE c.item_id = p.id AND c.item_type = 'patch' AND c.parent_comment_id IS NULL) as comment_count"

    # --- PERMISSION MODEL CHANGE ---
    if logged_in_user_id:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"
    else:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"

    from_clause = "FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id LEFT JOIN users u ON p.created_by_user_id = u.id LEFT JOIN users upd_u ON p.updated_by_user_id = upd_u.id"
    
    params = [] # Params for WHERE clause filters
    permission_join_params = [logged_in_user_id] # Param for the LEFT JOIN fp.user_id = ?
    filter_conditions = []

    # Permission Join and Conditions
    # --- PERMISSION MODEL CHANGE ---
    from_clause += " LEFT JOIN file_permissions fp ON p.id = fp.file_id AND fp.file_type = 'patch' AND fp.user_id = ?" # View permission join
    # Param for this join (logged_in_user_id) will be added to permission_join_params.
    filter_conditions.append("(fp.id IS NULL OR fp.can_view = 1)") # Final view condition
    # No need to append logged_in_user_id to `params` here for this filter condition.

    # Existing Filters
    if software_id_filter:
        filter_conditions.append("s.id = ?") 
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

    # Count Query
    count_params = permission_join_params + params
    count_query = f"SELECT COUNT(p.id) as count {from_clause}{where_clause}"
    try:
        # app.logger.info(f"Patches Count Query for user {logged_in_user_id}: {count_query}") # Removed
        # app.logger.info(f"Patches Count Params: {tuple(count_params)}") # Removed
        total_patches_cursor = db.execute(count_query, tuple(count_params))
        total_patches = total_patches_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total patch count with permissions: {e} using query {count_query} and params {tuple(count_params)}")
        return jsonify(msg="Error fetching patch count."), 500

    # Pagination Details
    total_pages = math.ceil(total_patches / per_page) if total_patches > 0 else 1
    offset = (page - 1) * per_page
    if page > total_pages and total_patches > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Main Data Query
    final_from_clause_for_data = from_clause # from_clause already includes the LEFT JOIN for view permissions (fp)
    # final_params_for_data = list(permission_join_params) # Start with user_id for the view permission JOIN (fp)
    # final_params_for_data.extend(params) # Add other filter params

    # New logic for assembling final_params_for_data
    final_params_for_data = list(permission_join_params)  # Start with permission join params

    if logged_in_user_id:
        # Add JOIN for favorite status
        final_from_clause_for_data += " LEFT JOIN user_favorites uf ON p.id = uf.item_id AND uf.item_type = 'patch' AND uf.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for uf join
        
        # Add separate LEFT JOIN for download permission (fp_dl)
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON p.id = fp_dl.file_id AND fp_dl.file_type = 'patch' AND fp_dl.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for fp_dl join
    else:
        # Add fp_dl join for anonymous users as well
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON p.id = fp_dl.file_id AND fp_dl.file_type = 'patch' AND fp_dl.user_id = ?"
        final_params_for_data.append(None) # Param for fp_dl join (None for anonymous)

    final_params_for_data.extend(params) # Add WHERE clause filter parameters
    final_params_for_data.extend([per_page, offset]) # Add pagination params
    final_query = f"{select_clause} {final_from_clause_for_data}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        # app.logger.info(f"Patches Data Query for user {logged_in_user_id}: {final_query}") # Removed
        # app.logger.info(f"Patches Data Params: {tuple(final_params_for_data)}") # Removed
        patches_cursor = db.execute(final_query, tuple(final_params_for_data))
        patches_list_raw = [dict(row) for row in patches_cursor.fetchall()]
        # Note: 'release_date' in patches is a DATE, not TIMESTAMP, so not included here.
        ts_keys = ['created_at', 'updated_at']
        patches_list = [convert_timestamps_to_ist_iso(patch, ts_keys) for patch in patches_list_raw]
    except Exception as e:
        app.logger.error(f"Error fetching paginated patches with permissions: {e} with query {final_query} and params {final_params_for_data}")
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
    base_query_select_fields = "l.id, l.title, l.description, l.software_id, l.version_id, l.is_external_link, l.url, l.stored_filename, l.original_filename_ref, l.file_size, l.file_type, l.created_by_user_id, u.username as uploaded_by_username, l.created_at, l.updated_by_user_id, upd_u.username as updated_by_username, l.updated_at, s.name as software_name, v.version_number as version_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = l.id AND c.item_type = 'link' AND c.parent_comment_id IS NULL) as comment_count"
    base_query_from = "FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id LEFT JOIN users u ON l.created_by_user_id = u.id LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id"
    
    params = []
    user_id_param_for_join = []

    # Attempt to get user_id for favorites and permissions
    logged_in_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            logged_in_user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_links_api: {e}")

    # Base query components
    base_query_select_fields_with_aliases = "l.id, l.title, l.description, l.software_id, l.version_id, l.is_external_link, l.url, l.stored_filename, l.original_filename_ref, l.file_size, l.file_type, l.created_by_user_id, u.username as uploaded_by_username, l.created_at, l.updated_by_user_id, upd_u.username as updated_by_username, l.updated_at, s.name as software_name, v.version_number as version_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = l.id AND c.item_type = 'link' AND c.parent_comment_id IS NULL) as comment_count"
    
    # --- PERMISSION MODEL CHANGE ---
    if logged_in_user_id:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"
    else:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"

    from_clause = "FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id LEFT JOIN users u ON l.created_by_user_id = u.id LEFT JOIN users upd_u ON l.updated_by_user_id = upd_u.id"
    
    params = [] # Params for WHERE clause filters
    permission_join_params = [logged_in_user_id] # Param for the LEFT JOIN fp.user_id = ?
    filter_conditions = []

    # Permission Join and Conditions
    # --- PERMISSION MODEL CHANGE ---
    from_clause += " LEFT JOIN file_permissions fp ON l.id = fp.file_id AND fp.file_type = 'link' AND fp.user_id = ?" # View permission join
    filter_conditions.append("(fp.id IS NULL OR fp.can_view = 1)") # Final view condition
    # logged_in_user_id for join is added to permission_join_params
        
    # Existing Filters
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
    if created_from_filter:
        filter_conditions.append("date(l.created_at) >= date(?)")
        params.append(created_from_filter)
    if created_to_filter:
        filter_conditions.append("date(l.created_at) <= date(?)")
        params.append(created_to_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Count Query
    count_params = permission_join_params + params
    count_query = f"SELECT COUNT(l.id) as count {from_clause}{where_clause}"
    try:
        # app.logger.info(f"Links Count Query for user {logged_in_user_id}: {count_query}") # Removed
        # app.logger.info(f"Links Count Params: {tuple(count_params)}") # Removed
        total_links_cursor = db.execute(count_query, tuple(count_params))
        total_links = total_links_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total link count with permissions: {e} using query {count_query} and params {tuple(count_params)}")
        return jsonify(msg="Error fetching link count."), 500

    # Pagination Details
    total_pages = math.ceil(total_links / per_page) if total_links > 0 else 1
    offset = (page - 1) * per_page
    if page > total_pages and total_links > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Main Data Query
    final_from_clause_for_data = from_clause # from_clause already includes the LEFT JOIN for view permissions (fp)
    # final_params_for_data = list(permission_join_params) # Start with user_id for the view permission JOIN (fp)
    # final_params_for_data.extend(params) # Add other filter params

    # New logic for assembling final_params_for_data
    final_params_for_data = list(permission_join_params)  # Start with permission join params

    if logged_in_user_id:
        # Add JOIN for favorite status
        final_from_clause_for_data += " LEFT JOIN user_favorites uf ON l.id = uf.item_id AND uf.item_type = 'link' AND uf.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for uf join
        
        # Add separate LEFT JOIN for download permission (fp_dl)
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON l.id = fp_dl.file_id AND fp_dl.file_type = 'link' AND fp_dl.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for fp_dl join
    else:
        # Add fp_dl join for anonymous users
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON l.id = fp_dl.file_id AND fp_dl.file_type = 'link' AND fp_dl.user_id = ?"
        final_params_for_data.append(None) # Param for fp_dl join (None for anonymous)
        
    final_params_for_data.extend(params) # Add WHERE clause filter parameters
    final_params_for_data.extend([per_page, offset]) # Add pagination params
    final_query = f"{select_clause} {final_from_clause_for_data}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        # app.logger.info(f"Links Data Query for user {logged_in_user_id}: {final_query}") # Removed
        # app.logger.info(f"Links Data Params: {tuple(final_params_for_data)}") # Removed
        links_cursor = db.execute(final_query, tuple(final_params_for_data))
        links_list_raw = [dict(row) for row in links_cursor.fetchall()]
        ts_keys = ['created_at', 'updated_at']
        links_list = [convert_timestamps_to_ist_iso(link, ts_keys) for link in links_list_raw]
    except Exception as e:
        app.logger.error(f"Error fetching paginated links with permissions: {e} with query {final_query} and params {final_params_for_data}")
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
    base_query_select_fields = "mf.id, mf.misc_category_id, mf.user_id, mf.user_provided_title, mf.user_provided_description, mf.original_filename, mf.stored_filename, mf.file_path, mf.file_type, mf.file_size, mf.created_by_user_id, u.username as uploaded_by_username, mf.created_at, mf.updated_by_user_id, upd_u.username as updated_by_username, mf.updated_at, mc.name as category_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = mf.id AND c.item_type = 'misc_file' AND c.parent_comment_id IS NULL) as comment_count"
    base_query_from = "FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id LEFT JOIN users u ON mf.created_by_user_id = u.id LEFT JOIN users upd_u ON mf.updated_by_user_id = upd_u.id"
    
    params = []
    user_id_param_for_join = []

    # Attempt to get user_id for favorites and permissions
    logged_in_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            logged_in_user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in get_all_misc_files_api: {e}")

    # Base query components
    base_query_select_fields_with_aliases = "mf.id, mf.misc_category_id, mf.user_id, mf.user_provided_title, mf.user_provided_description, mf.original_filename, mf.stored_filename, mf.file_path, mf.file_type, mf.file_size, mf.created_by_user_id, u.username as uploaded_by_username, mf.created_at, mf.updated_by_user_id, upd_u.username as updated_by_username, mf.updated_at, mc.name as category_name, (SELECT COUNT(*) FROM comments c WHERE c.item_id = mf.id AND c.item_type = 'misc_file' AND c.parent_comment_id IS NULL) as comment_count"

    # --- PERMISSION MODEL CHANGE ---
    if logged_in_user_id:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"
    else:
        select_clause = f"SELECT {base_query_select_fields_with_aliases}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable"

    from_clause = "FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id LEFT JOIN users u ON mf.created_by_user_id = u.id LEFT JOIN users upd_u ON mf.updated_by_user_id = upd_u.id"
    
    params = [] # Params for WHERE clause filters
    permission_join_params = [logged_in_user_id] # Param for the LEFT JOIN fp.user_id = ?
    filter_conditions = []

    # Permission Join and Conditions
    # --- PERMISSION MODEL CHANGE ---
    from_clause += " LEFT JOIN file_permissions fp ON mf.id = fp.file_id AND fp.file_type = 'misc_file' AND fp.user_id = ?" # View permission join
    filter_conditions.append("(fp.id IS NULL OR fp.can_view = 1)") # Final view condition
    # logged_in_user_id for join is added to permission_join_params.

    # Existing Filters
    if category_id_filter:
        filter_conditions.append("mf.misc_category_id = ?")
        params.append(category_id_filter)
    
    where_clause = ""
    if filter_conditions:
        where_clause = " WHERE " + " AND ".join(filter_conditions)

    # Count Query
    count_params = permission_join_params + params
    count_query = f"SELECT COUNT(mf.id) as count {from_clause}{where_clause}"
    try:
        # app.logger.info(f"Misc Files Count Query for user {logged_in_user_id}: {count_query}") # Removed
        # app.logger.info(f"Misc Files Count Params: {tuple(count_params)}") # Removed
        total_misc_files_cursor = db.execute(count_query, tuple(count_params))
        total_misc_files = total_misc_files_cursor.fetchone()['count']
    except Exception as e:
        app.logger.error(f"Error fetching total misc_files count with permissions: {e} using query {count_query} and params {tuple(count_params)}")
        return jsonify(msg="Error fetching misc_files count."), 500

    # Pagination Details
    total_pages = math.ceil(total_misc_files / per_page) if total_misc_files > 0 else 1
    offset = (page - 1) * per_page
    if page > total_pages and total_misc_files > 0:
        page = total_pages
        offset = (page - 1) * per_page
    
    # Main Data Query
    final_from_clause_for_data = from_clause # from_clause already includes the LEFT JOIN for view permissions (fp)
    # final_params_for_data = list(permission_join_params) # Start with user_id for the view permission JOIN (fp)
    # final_params_for_data.extend(params) # Add other filter params

    # New logic for assembling final_params_for_data
    final_params_for_data = list(permission_join_params)  # Start with permission join params

    if logged_in_user_id:
        # Add JOIN for favorite status
        final_from_clause_for_data += " LEFT JOIN user_favorites uf ON mf.id = uf.item_id AND uf.item_type = 'misc_file' AND uf.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for uf join
        
        # Add separate LEFT JOIN for download permission (fp_dl)
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON mf.id = fp_dl.file_id AND fp_dl.file_type = 'misc_file' AND fp_dl.user_id = ?"
        final_params_for_data.append(logged_in_user_id) # Param for fp_dl join
    else:
        # Add fp_dl join for anonymous users
        final_from_clause_for_data += " LEFT JOIN file_permissions fp_dl ON mf.id = fp_dl.file_id AND fp_dl.file_type = 'misc_file' AND fp_dl.user_id = ?"
        final_params_for_data.append(None) # Param for fp_dl join (None for anonymous)
    
    final_params_for_data.extend(params) # Add WHERE clause filter parameters
    final_params_for_data.extend([per_page, offset]) # Add pagination params
    final_query = f"{select_clause} {final_from_clause_for_data}{where_clause} ORDER BY {sort_by_column} {sort_order.upper()} LIMIT ? OFFSET ?"
    
    try:
        # app.logger.info(f"Misc Files Data Query for user {logged_in_user_id}: {final_query}") # Removed
        # app.logger.info(f"Misc Files Data Params: {tuple(final_params_for_data)}") # Removed
        misc_files_cursor = db.execute(final_query, tuple(final_params_for_data))
        misc_files_list_raw = [dict(row) for row in misc_files_cursor.fetchall()]
        ts_keys = ['created_at', 'updated_at']
        misc_files_list = [convert_timestamps_to_ist_iso(mf, ts_keys) for mf in misc_files_list_raw]
    except Exception as e:
        app.logger.error(f"Error fetching paginated misc_files with permissions: {e} with query {final_query} and params {final_params_for_data}")
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
    uploader_user = find_user_by_id(current_user_id) 
    uploader_username = uploader_user['username'] if uploader_user else "Unknown User"
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
                    new_item_dict = dict(new_item_row)
                    # Common timestamp keys for most items created/updated this way
                    timestamp_keys_to_convert = ['created_at', 'updated_at', 'release_date'] # release_date might be None or not applicable
                    processed_item = convert_timestamps_to_ist_iso(new_item_dict, timestamp_keys_to_convert)
                    app.logger.debug(f"_admin_helper: Converted fetched row to dict and processed timestamps: {processed_item}")
                    return jsonify(processed_item), 201
                except Exception as e_dict:
                    app.logger.error(f"_admin_helper: EXCEPTION converting sqlite3.Row to dict or processing timestamps for {table_name} ID {new_id}: {e_dict}. Row data: {new_item_row}")
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
    adder_username = "Unknown User"
    try:
        current_user_id = int(current_user_id_str)
        adder_user = find_user_by_id(current_user_id)
        if adder_user:
            adder_username = adder_user['username']
    except ValueError:
        app.logger.error(f"ADMIN_HELPER_LINK: Invalid user ID format in JWT: {current_user_id_str} for table {table_name}")
        return jsonify(msg="Invalid user identity in token"), 400

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
            new_item_dict = dict(new_item_row)
            timestamp_keys_to_convert = ['created_at', 'updated_at', 'release_date'] # release_date might be None or not applicable
            processed_item = convert_timestamps_to_ist_iso(new_item_dict, timestamp_keys_to_convert)
            app.logger.info(f"ADMIN_HELPER_LINK: Successfully fetched back and processed new item from {table_name}: {processed_item}")
            return jsonify(processed_item), 201
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

    if provided_version_id_str is not None: # Check if it's not None first
        # Convert to string to safely call .strip() and handle if it was sent as int
        version_id_val_str = str(provided_version_id_str) 
        if version_id_val_str.strip(): # Now it's safe to strip
            try:
                parsed_id = int(version_id_val_str)
                if parsed_id > 0: # Assuming version IDs must be positive
                    final_version_id = parsed_id
                else:
                    # Optional: Log or handle non-positive ID if it's considered invalid
                    app.logger.warning(f"Provided version_id '{parsed_id}' is not positive. Treating as not provided.")
            except ValueError:
                app.logger.warning(f"Invalid format for provided version_id: '{version_id_val_str}'. Could not convert to int.")
                # Depending on strictness, could return a 400 error here.
    
    # Then, the existing logic for typed_version_string:
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
            processed_doc = convert_timestamps_to_ist_iso(dict(updated_doc_row), ['created_at', 'updated_at'])
            return jsonify(processed_doc), 200
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
            processed_doc = convert_timestamps_to_ist_iso(dict(updated_doc_row), ['created_at', 'updated_at'])
            return jsonify(processed_doc), 200
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
def admin_edit_patch_url(patch_id):
    current_user_id = int(get_jwt_identity())
    db = get_db()
    patch = db.execute("SELECT * FROM patches WHERE id = ?", (patch_id,)).fetchone()
    if not patch: return jsonify(msg="Patch not found"), 404

    data = request.get_json()
    if not data: return jsonify(msg="Missing JSON data"), 400

    software_id_str = data.get('software_id') # Used if version string is changing
    provided_version_id_payload = data.get('version_id') # Can be int, string, or None
    typed_version_string = data.get('typed_version_string') # If user types/changes version string

    # Determine the version_id to update with
    final_version_id = patch['version_id'] # Default to existing version_id

    version_id_from_payload = None
    if isinstance(provided_version_id_payload, str):
        if provided_version_id_payload.strip():
            try:
                version_id_from_payload = int(provided_version_id_payload.strip())
            except ValueError:
                return jsonify(msg="Invalid format for provided version_id string."), 400
    elif isinstance(provided_version_id_payload, int):
        version_id_from_payload = provided_version_id_payload
    
    if version_id_from_payload is not None:
        if version_id_from_payload > 0: # Assuming version IDs must be positive
            final_version_id = version_id_from_payload
        else:
             return jsonify(msg=f"Invalid value for provided version_id: {version_id_from_payload}. Must be a positive integer if provided."), 400
    elif typed_version_string and typed_version_string.strip():
        # software_id_str is needed if typed_version_string is used to create/find a version
        if not software_id_str: 
            # Fallback to current patch's version's software_id if not provided in payload
            # This assumes software_id is always sent by frontend if typed_version_string is active.
            current_version_details = db.execute("SELECT software_id FROM versions WHERE id = ?", (patch['version_id'],)).fetchone()
            if not current_version_details:
                 return jsonify(msg="Cannot determine software for the current patch version."), 500
            software_id_for_version_logic = current_version_details['software_id']
        else: # software_id_str is provided
            try:
                software_id_for_version_logic = int(software_id_str)
            except ValueError: return jsonify(msg="Invalid software_id format."), 400

        resolved_id = get_or_create_version_id(db, software_id_for_version_logic, typed_version_string, current_user_id)
        if resolved_id is None:
            return jsonify(msg=f"Failed to process version '{typed_version_string}' for software ID {software_id_for_version_logic}."), 500
        final_version_id = resolved_id
    # If neither provided_version_id_payload nor typed_version_string leads to a valid ID,
    # final_version_id remains patch['version_id'] (no change to version).

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
             current_user_id, patch_id))
        log_audit_action(
            action_type='UPDATE_PATCH_URL',
            target_table='patches',
            target_id=patch_id,
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
            WHERE p.id = ?""", (patch_id,)).fetchone()
        
        if updated_item_row:
            # Note: 'release_date' in patches is DATE, not TIMESTAMP.
            processed_item = convert_timestamps_to_ist_iso(dict(updated_item_row), ['created_at', 'updated_at'])
            return jsonify(processed_item), 200
        else:
            # This case should ideally not be reached if the update was successful.
            app.logger.error(f"Failed to fetch patch with ID {patch_id} after edit_url.")
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
            # Note: 'release_date' in patches is DATE, not TIMESTAMP.
            processed_item = convert_timestamps_to_ist_iso(dict(updated_item_row), ['created_at', 'updated_at'])
            return jsonify(processed_item), 200
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
        new_cat_row = new_cat_cursor.fetchone()
        if new_cat_row:
            processed_cat = convert_timestamps_to_ist_iso(dict(new_cat_row), ['created_at', 'updated_at'])
            return jsonify(processed_cat), 201
        else: # Should not happen
            return jsonify(msg="Category created but failed to retrieve details."), 500
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
            response_data = convert_timestamps_to_ist_iso(dict(updated_item_dict), ['created_at', 'updated_at'])
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
            processed_item = convert_timestamps_to_ist_iso(dict(updated_item_dict), ['created_at', 'updated_at'])
            return jsonify(processed_item), 200
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
            processed_cat = convert_timestamps_to_ist_iso(dict(updated_category_row), ['created_at', 'updated_at'])
            return jsonify(processed_cat), 200
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
            processed_file = convert_timestamps_to_ist_iso(dict(updated_file_row), ['created_at', 'updated_at'])
            return jsonify(processed_file), 200
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

# Helper function for handling DB insertion for large file uploads
def _admin_handle_large_file_db_insert(
    item_type, stored_filename, original_filename, file_size, mime_type,
    current_user_id, metadata: dict
):
    db = get_db()
    table_name = ""
    sql_insert_query = ""
    sql_params_list = [] # List of actual values for the query
    
    # Common fields for logging/response
    item_name_for_log = metadata.get('doc_name') or metadata.get('patch_name') or metadata.get('link_title') or metadata.get('user_provided_title_misc') or original_filename

    server_path_prefix = ""
    # The 'mime_type' parameter received by this function is the client-provided/detected MIME type for the chunk.
    # We'll use this for the database 'file_type' column.
    db_file_type_to_store = mime_type 
    app.logger.info(f"Large file DB insert: Storing file_type='{db_file_type_to_store}' for {original_filename}.")

    if item_type == 'document':
        table_name = 'documents'
        server_path_prefix = '/official_uploads/docs'
        required_meta = ['software_id', 'doc_name']
        missing_meta = [field for field in required_meta if not metadata.get(field)]
        if missing_meta:
            return None, jsonify(msg=f"Missing metadata for document: {', '.join(missing_meta)}"), 400

        sql_insert_query = """INSERT INTO documents (software_id, doc_name, download_link, description, doc_type,
                                               is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                               created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)"""
        sql_params_list = [
            int(metadata['software_id']), metadata['doc_name'], f"{server_path_prefix}/{stored_filename}",
            metadata.get('description', ''), metadata.get('doc_type', ''), stored_filename, original_filename, # original_filename here is original_filename_ref
            file_size, db_file_type_to_store, current_user_id, current_user_id
        ]
    elif item_type == 'patch':
        table_name = 'patches'
        server_path_prefix = '/official_uploads/patches'
        required_meta = ['version_id', 'patch_name']
        missing_meta = [field for field in required_meta if not metadata.get(field)]
        if missing_meta:
            return None, jsonify(msg=f"Missing metadata for patch: {', '.join(missing_meta)}"), 400
        
        sql_insert_query = """INSERT INTO patches (version_id, patch_name, download_link, description, release_date, patch_by_developer,
                                             is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                             created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)"""
        sql_params_list = [
            int(metadata['version_id']), metadata['patch_name'], f"{server_path_prefix}/{stored_filename}",
            metadata.get('description', ''), metadata.get('release_date'), metadata.get('patch_by_developer', ''),
            stored_filename, original_filename, # original_filename here is original_filename_ref
            file_size, db_file_type_to_store, current_user_id, current_user_id
        ]
    elif item_type == 'misc_file':
        table_name = 'misc_files'
        server_path_prefix = '/misc_uploads'
        required_meta = ['misc_category_id']
        missing_meta = [field for field in required_meta if not metadata.get(field)]
        if missing_meta:
            return None, jsonify(msg=f"Missing metadata for misc_file: {', '.join(missing_meta)}"), 400
        
        user_provided_title = metadata.get('user_provided_title_misc') or original_filename

        sql_insert_query = """INSERT INTO misc_files (misc_category_id, user_id, user_provided_title, user_provided_description,
                                        original_filename, stored_filename, file_path, file_type, file_size,
                                        created_by_user_id, updated_by_user_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        sql_params_list = [
            int(metadata['misc_category_id']), current_user_id, user_provided_title, metadata.get('description', ''),
            original_filename, stored_filename, f"{server_path_prefix}/{stored_filename}", db_file_type_to_store, file_size, # original_filename here is correct for misc_files.original_filename
            current_user_id, current_user_id
        ]
    elif item_type == 'link_file': # Using 'link_file' to differentiate from external links added via URL
        table_name = 'links'
        server_path_prefix = '/official_uploads/links'
        required_meta = ['software_id', 'link_title'] # version_id for links can be optional
        missing_meta = [field for field in required_meta if not metadata.get(field)]
        if missing_meta:
            return None, jsonify(msg=f"Missing metadata for link_file: {', '.join(missing_meta)}"), 400

        version_id_for_link = metadata.get('version_id')
        if version_id_for_link:
            try:
                version_id_for_link = int(version_id_for_link)
            except ValueError:
                 return None, jsonify(msg="Invalid version_id format for link_file."), 400
        
        sql_insert_query = """INSERT INTO links (software_id, version_id, title, url, description,
                                           is_external_link, stored_filename, original_filename_ref, file_size, file_type,
                                           created_by_user_id, updated_by_user_id)
                              VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?)"""
        sql_params_list = [
            int(metadata['software_id']), version_id_for_link, metadata['link_title'], f"{server_path_prefix}/{stored_filename}",
            metadata.get('description', ''), stored_filename, original_filename, # original_filename here is original_filename_ref
            file_size, db_file_type_to_store,
            current_user_id, current_user_id
        ]
    else:
        return None, jsonify(msg=f"Unsupported item_type for large file DB insert: {item_type}"), 400

    try:
        cursor = db.execute(sql_insert_query, tuple(sql_params_list))
        new_id = cursor.lastrowid
        db.commit()
        app.logger.info(f"Large file DB insert: Successfully inserted {item_type} '{item_name_for_log}', new ID: {new_id}")

        # Fetch back the newly created item with joined data for response
        fetch_back_query = ""
        if table_name == 'documents':
            fetch_back_query = "SELECT d.*, s.name as software_name, u.username as uploaded_by_username FROM documents d JOIN software s ON d.software_id = s.id LEFT JOIN users u ON d.created_by_user_id = u.id WHERE d.id = ?"
        elif table_name == 'patches':
            fetch_back_query = "SELECT p.*, s.name as software_name, v.version_number, u.username as uploaded_by_username FROM patches p JOIN versions v ON p.version_id = v.id JOIN software s ON v.software_id = s.id LEFT JOIN users u ON p.created_by_user_id = u.id WHERE p.id = ?"
        elif table_name == 'misc_files':
            fetch_back_query = "SELECT mf.*, mc.name as category_name, u.username as uploaded_by_username FROM misc_files mf JOIN misc_categories mc ON mf.misc_category_id = mc.id LEFT JOIN users u ON mf.created_by_user_id = u.id WHERE mf.id = ?"
        elif table_name == 'links': # for 'link_file'
            fetch_back_query = "SELECT l.*, s.name as software_name, v.version_number as version_name, u.username as uploaded_by_username FROM links l JOIN software s ON l.software_id = s.id LEFT JOIN versions v ON l.version_id = v.id LEFT JOIN users u ON l.created_by_user_id = u.id WHERE l.id = ?"
        
        if fetch_back_query:
            new_item_row = db.execute(fetch_back_query, (new_id,)).fetchone()
            if new_item_row:
                return dict(new_item_row), None, 201 # item, error_response, status_code
            else:
                app.logger.error(f"Large file DB insert: Failed to fetch back {item_type} ID {new_id}")
                return None, jsonify(msg=f"{item_type.capitalize()} created (ID: {new_id}) but failed to retrieve details."), 207 # Partial success
        else: # Should not happen if table_name is set
            return None, jsonify(msg="Internal error: Fetch back query not defined."), 500

    except sqlite3.IntegrityError as e:
        db.rollback()
        app.logger.error(f"Large file DB insert: IntegrityError for {item_type} '{item_name_for_log}': {e}")
        return None, jsonify(msg=f"Database integrity error for {item_type}: {str(e)}"), 409
    except Exception as e:
        db.rollback()
        app.logger.error(f"Large file DB insert: General Exception for {item_type} '{item_name_for_log}': {e}", exc_info=True)
        return None, jsonify(msg=f"Server error during database insertion for {item_type}: {str(e)}"), 500


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

        # Note: 'release_date' is DATE, not TIMESTAMP. Timestamps are 'created_at', 'updated_at'.
        processed_version = convert_timestamps_to_ist_iso(dict(new_version_row), ['created_at', 'updated_at'])
        return jsonify(processed_version), 201

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
            versions_list_raw = [dict(row) for row in versions_cursor.fetchall()]
            # Note: 'release_date' is DATE, not TIMESTAMP.
            ts_keys = ['created_at', 'updated_at']
            versions_list = [convert_timestamps_to_ist_iso(ver, ts_keys) for ver in versions_list_raw]
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
    
    # Note: 'release_date' is DATE, not TIMESTAMP.
    processed_version = convert_timestamps_to_ist_iso(dict(version_row), ['created_at', 'updated_at'])
    return jsonify(processed_version), 200

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

        # Note: 'release_date' is DATE, not TIMESTAMP.
        processed_version = convert_timestamps_to_ist_iso(dict(updated_version_row), ['created_at', 'updated_at'])
        return jsonify(processed_version), 200

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
@jwt_required(optional=True) # Use optional to check identity even if no token
def serve_official_doc_file(filename):
    db = get_db()
    logged_in_user_id = None
    current_user_identity = get_jwt_identity()
    if current_user_identity:
        try:
            logged_in_user_id = int(current_user_identity)
        except ValueError:
            app.logger.warning(f"Invalid user ID format in JWT for doc download: {current_user_identity}")
            return jsonify(msg="Invalid user identity in token."), 401

    # If user is not logged in, logged_in_user_id will be None.
    # The permission query `WHERE user_id = ?` with `logged_in_user_id = None`
    # will correctly not find any user-specific permissions.
    # Default allow: if no specific deny, then allow.

    doc_item = db.execute("SELECT id FROM documents WHERE stored_filename = ?", (filename,)).fetchone()
    if not doc_item:
        return jsonify(msg="File not found in database records."), 404
    file_id = doc_item['id']

    # Check permission
    # If logged_in_user_id is None, this query will not find a row, permission will be None.
    permission = db.execute(
        "SELECT can_download FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'document'",
        (logged_in_user_id, file_id)
    ).fetchone()

    # Default Allow, Explicit Deny Logic:
    # Allow if no permission entry (permission is None)
    # OR if entry exists and can_download is not FALSE (i.e., TRUE or NULL)
    if permission and permission['can_download'] is False: # Explicitly False
        log_audit_action(
            action_type='DOWNLOAD_DENIED', target_table='documents', target_id=file_id,
            details={'filename': filename, 'reason': 'Explicit DENY permission (can_download is FALSE)'}
        )
        return jsonify(msg="You do not have permission to download this file."), 403
    # Else (permission is None OR permission['can_download'] is True OR permission['can_download'] is NULL), allow.

    try:
        _log_download_activity(filename, 'document', db) # Log before serving
    except Exception as e:
        app.logger.error(f"Error during download logging for doc '{filename}': {e}")
        # Do not necessarily prevent download if logging fails, but log the logging error.
    
    # Fetch the original filename to use for the download
    doc_details = db.execute("SELECT original_filename_ref FROM documents WHERE id = ?", (file_id,)).fetchone()
    download_as_name = filename # Fallback to stored name
    if doc_details and doc_details['original_filename_ref']:
        download_as_name = doc_details['original_filename_ref']

    file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mimetype_to_use = None
    if file_ext in INLINE_PRONE_EXTENSIONS:
        mimetype_to_use = 'application/octet-stream'
    
    return send_from_directory(
        app.config['DOC_UPLOAD_FOLDER'], 
        filename, # This is the stored_filename on disk
        as_attachment=True,
        download_name=download_as_name,
        mimetype=mimetype_to_use
    )

@app.route('/official_uploads/patches/<path:filename>')
@jwt_required(optional=True)
def serve_official_patch_file(filename):
    db = get_db()
    logged_in_user_id = None
    current_user_identity = get_jwt_identity()
    if current_user_identity:
        try:
            logged_in_user_id = int(current_user_identity)
        except ValueError:
            app.logger.warning(f"Invalid user ID format in JWT for patch download: {current_user_identity}")
            return jsonify(msg="Invalid user identity in token."), 401

    # Default Allow, Explicit Deny logic for patches

    patch_item = db.execute("SELECT id FROM patches WHERE stored_filename = ?", (filename,)).fetchone()
    if not patch_item:
        return jsonify(msg="File not found in database records."), 404
    file_id = patch_item['id']

    permission = db.execute(
        "SELECT can_download FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'patch'",
        (logged_in_user_id, file_id)
    ).fetchone()

    if permission and permission['can_download'] is False: # Explicit Deny
        log_audit_action(
            action_type='DOWNLOAD_DENIED', target_table='patches', target_id=file_id,
            details={'filename': filename, 'reason': 'Explicit DENY permission (can_download is FALSE)'}
        )
        return jsonify(msg="You do not have permission to download this file."), 403
    # Else (no entry, or entry allows/is null), allow.
    
    try:
        _log_download_activity(filename, 'patch', db)
    except Exception as e:
        app.logger.error(f"Error during download logging for patch '{filename}': {e}")

    patch_details = db.execute("SELECT original_filename_ref FROM patches WHERE id = ?", (file_id,)).fetchone()
    download_as_name = filename
    if patch_details and patch_details['original_filename_ref']:
        download_as_name = patch_details['original_filename_ref']

    file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mimetype_to_use = None
    if file_ext in INLINE_PRONE_EXTENSIONS:
        mimetype_to_use = 'application/octet-stream'

    return send_from_directory(
        app.config['PATCH_UPLOAD_FOLDER'], 
        filename, 
        as_attachment=True,
        download_name=download_as_name,
        mimetype=mimetype_to_use
    )

@app.route('/official_uploads/links/<path:filename>') 
@jwt_required(optional=True)
def serve_official_link_file(filename): # Only for uploaded files via "Links"
    db = get_db()
    logged_in_user_id = None
    current_user_identity = get_jwt_identity()
    if current_user_identity:
        try:
            logged_in_user_id = int(current_user_identity)
        except ValueError:
            app.logger.warning(f"Invalid user ID format in JWT for link file download: {current_user_identity}")
            return jsonify(msg="Invalid user identity in token."), 401
            
    # Default Allow, Explicit Deny logic for link files

    link_item = db.execute("SELECT id, is_external_link FROM links WHERE stored_filename = ?", (filename,)).fetchone()
    if not link_item:
        return jsonify(msg="File not found in database records."), 404
    if link_item['is_external_link']: # Should not happen if filename is present, but good check
        return jsonify(msg="Cannot download external links directly via this endpoint."), 400 
    file_id = link_item['id']

    permission = db.execute(
        "SELECT can_download FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'link'",
        (logged_in_user_id, file_id)
    ).fetchone()

    if permission and permission['can_download'] is False: # Explicit Deny
        log_audit_action(
            action_type='DOWNLOAD_DENIED', target_table='links', target_id=file_id,
            details={'filename': filename, 'reason': 'Explicit DENY permission (can_download is FALSE)'}
        )
        return jsonify(msg="You do not have permission to download this file."), 403
    # Else, allow.

    try:
        _log_download_activity(filename, 'link_file', db)
    except Exception as e:
        app.logger.error(f"Error during download logging for link file '{filename}': {e}")

    link_details = db.execute("SELECT original_filename_ref FROM links WHERE id = ?", (file_id,)).fetchone()
    download_as_name = filename
    if link_details and link_details['original_filename_ref']:
        download_as_name = link_details['original_filename_ref']

    file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mimetype_to_use = None
    if file_ext in INLINE_PRONE_EXTENSIONS:
        mimetype_to_use = 'application/octet-stream'
        
    return send_from_directory(
        app.config['LINK_UPLOAD_FOLDER'], 
        filename, 
        as_attachment=True,
        download_name=download_as_name,
        mimetype=mimetype_to_use
    )

@app.route('/misc_uploads/<path:filename>')
@jwt_required(optional=True)
def serve_misc_file(filename):
    db = get_db()
    logged_in_user_id = None
    current_user_identity = get_jwt_identity()
    if current_user_identity:
        try:
            logged_in_user_id = int(current_user_identity)
        except ValueError:
            app.logger.warning(f"Invalid user ID format in JWT for misc file download: {current_user_identity}")
            return jsonify(msg="Invalid user identity in token."), 401

    # Default Allow, Explicit Deny logic for misc files

    misc_item = db.execute("SELECT id FROM misc_files WHERE stored_filename = ?", (filename,)).fetchone()
    if not misc_item:
        return jsonify(msg="File not found in database records."), 404
    file_id = misc_item['id']

    permission = db.execute(
        "SELECT can_download FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'misc_file'",
        (logged_in_user_id, file_id)
    ).fetchone()

    if permission and permission['can_download'] is False: # Explicit Deny
        log_audit_action(
            action_type='DOWNLOAD_DENIED', target_table='misc_files', target_id=file_id,
            details={'filename': filename, 'reason': 'Explicit DENY permission (can_download is FALSE)'}
        )
        return jsonify(msg="You do not have permission to download this file."), 403
    # Else, allow.
    
    try:
        _log_download_activity(filename, 'misc_file', db)
    except Exception as e:
        app.logger.error(f"Error during download logging for misc file '{filename}': {e}")

    misc_details = db.execute("SELECT original_filename FROM misc_files WHERE id = ?", (file_id,)).fetchone()
    download_as_name = filename
    if misc_details and misc_details['original_filename']:
        download_as_name = misc_details['original_filename']

    file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mimetype_to_use = None
    if file_ext in INLINE_PRONE_EXTENSIONS:
        mimetype_to_use = 'application/octet-stream'

    return send_from_directory(
        app.config['MISC_UPLOAD_FOLDER'], 
        filename, 
        as_attachment=True,
        download_name=download_as_name,
        mimetype=mimetype_to_use
    )

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

    logged_in_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        current_user_identity = get_jwt_identity()
        if current_user_identity:
            logged_in_user_id = int(current_user_identity)
    except Exception as e:
        app.logger.error(f"Error getting user_id in search: {e}")

    # Documents
    doc_select_base = "SELECT d.id, d.doc_name AS name, d.description, 'document' AS type, (SELECT COUNT(*) FROM comments c WHERE c.item_id = d.id AND c.item_type = 'document' AND c.parent_comment_id IS NULL) as comment_count"
    # --- PERMISSION MODEL CHANGE for SEARCH ---
    # Using final revised explicit conditions:
    # View: (fp.id IS NULL OR fp.can_view = 1)
    # Download: (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END)
    # Note: The search logic needs to align with the listing logic, meaning two joins for permissions:
    # one for view ('fp') and one for download ('fp_dl').
    doc_from_base = "FROM documents d LEFT JOIN file_permissions fp ON d.id = fp.file_id AND fp.file_type = 'document' AND fp.user_id = ?"
    doc_params = [logged_in_user_id, like_query_term, like_query_term] # user_id for view JOIN, then search terms
    doc_where_base = "(fp.id IS NULL OR fp.can_view IS NOT FALSE) AND (LOWER(d.doc_name) LIKE ? OR LOWER(d.description) LIKE ?)" # Standardized view condition
    
    if logged_in_user_id:
        doc_select_final = f"{doc_select_base}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        # Add fp_dl join for download status, and uf for favorites
        doc_from_final = f"{doc_from_base} LEFT JOIN file_permissions fp_dl ON d.id = fp_dl.file_id AND fp_dl.file_type = 'document' AND fp_dl.user_id = ? LEFT JOIN user_favorites uf ON d.id = uf.item_id AND uf.item_type = 'document' AND uf.user_id = ?"
        doc_params.extend([logged_in_user_id, logged_in_user_id]) # Params for fp_dl and uf joins
    else:
        doc_select_final = f"{doc_select_base}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        # Add fp_dl join for download status, with NULL user_id
        doc_from_final = f"{doc_from_base} LEFT JOIN file_permissions fp_dl ON d.id = fp_dl.file_id AND fp_dl.file_type = 'document' AND fp_dl.user_id = ?"
        doc_params.append(None) # Param for fp_dl.user_id = NULL
    
    sql_documents = f"{doc_select_final} {doc_from_final} WHERE {doc_where_base}"
    # app.logger.info(f"Search API - Documents Query for user {logged_in_user_id}: {sql_documents}") # Removed
    # app.logger.info(f"Search API - Documents Params: {tuple(doc_params)}") # Removed
    results.extend([dict(row) for row in db.execute(sql_documents, tuple(doc_params)).fetchall()])

    # Patches
    patch_select_base = "SELECT p.id, p.patch_name AS name, p.description, 'patch' AS type, (SELECT COUNT(*) FROM comments c WHERE c.item_id = p.id AND c.item_type = 'patch' AND c.parent_comment_id IS NULL) as comment_count"
    patch_from_base = "FROM patches p LEFT JOIN file_permissions fp ON p.id = fp.file_id AND fp.file_type = 'patch' AND fp.user_id = ?"
    patch_params = [logged_in_user_id, like_query_term, like_query_term]
    patch_where_base = "(fp.id IS NULL OR fp.can_view IS NOT FALSE) AND (LOWER(p.patch_name) LIKE ? OR LOWER(p.description) LIKE ?)" # Standardized view condition

    if logged_in_user_id:
        patch_select_final = f"{patch_select_base}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        patch_from_final = f"{patch_from_base} LEFT JOIN file_permissions fp_dl ON p.id = fp_dl.file_id AND fp_dl.file_type = 'patch' AND fp_dl.user_id = ? LEFT JOIN user_favorites uf ON p.id = uf.item_id AND uf.item_type = 'patch' AND uf.user_id = ?"
        patch_params.extend([logged_in_user_id, logged_in_user_id])
    else:
        patch_select_final = f"{patch_select_base}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        patch_from_final = f"{patch_from_base} LEFT JOIN file_permissions fp_dl ON p.id = fp_dl.file_id AND fp_dl.file_type = 'patch' AND fp_dl.user_id = ?"
        patch_params.append(None)

    sql_patches = f"{patch_select_final} {patch_from_final} WHERE {patch_where_base}"
    # app.logger.info(f"Search API - Patches Query for user {logged_in_user_id}: {sql_patches}") # Removed
    # app.logger.info(f"Search API - Patches Params: {tuple(patch_params)}") # Removed
    results.extend([dict(row) for row in db.execute(sql_patches, tuple(patch_params)).fetchall()])

    # Links
    link_select_base = "SELECT l.id, l.title AS name, l.description, l.url, l.is_external_link, l.stored_filename, 'link' AS type, (SELECT COUNT(*) FROM comments c WHERE c.item_id = l.id AND c.item_type = 'link' AND c.parent_comment_id IS NULL) as comment_count"
    link_from_base = "FROM links l LEFT JOIN file_permissions fp ON l.id = fp.file_id AND fp.file_type = 'link' AND fp.user_id = ?"
    link_params = [logged_in_user_id, like_query_term, like_query_term, like_query_term]
    link_where_base = "(fp.id IS NULL OR fp.can_view IS NOT FALSE) AND (LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ? OR LOWER(l.url) LIKE ?)" # Standardized view condition

    if logged_in_user_id:
        link_select_final = f"{link_select_base}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        link_from_final = f"{link_from_base} LEFT JOIN file_permissions fp_dl ON l.id = fp_dl.file_id AND fp_dl.file_type = 'link' AND fp_dl.user_id = ? LEFT JOIN user_favorites uf ON l.id = uf.item_id AND uf.item_type = 'link' AND uf.user_id = ?"
        link_params.extend([logged_in_user_id, logged_in_user_id])
    else:
        link_select_final = f"{link_select_base}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        link_from_final = f"{link_from_base} LEFT JOIN file_permissions fp_dl ON l.id = fp_dl.file_id AND fp_dl.file_type = 'link' AND fp_dl.user_id = ?"
        link_params.append(None)
        
    sql_links = f"{link_select_final} {link_from_final} WHERE {link_where_base}"
    # app.logger.info(f"Search API - Links Query for user {logged_in_user_id}: {sql_links}") # Removed
    # app.logger.info(f"Search API - Links Params: {tuple(link_params)}") # Removed
    results.extend([dict(row) for row in db.execute(sql_links, tuple(link_params)).fetchall()])

    # Misc Files
    misc_select_base = "SELECT mf.id, mf.user_provided_title AS name, mf.original_filename, mf.user_provided_description AS description, mf.stored_filename, 'misc_file' AS type, (SELECT COUNT(*) FROM comments c WHERE c.item_id = mf.id AND c.item_type = 'misc_file' AND c.parent_comment_id IS NULL) as comment_count"
    misc_from_base = "FROM misc_files mf LEFT JOIN file_permissions fp ON mf.id = fp.file_id AND fp.file_type = 'misc_file' AND fp.user_id = ?"
    misc_params = [logged_in_user_id, like_query_term, like_query_term, like_query_term]
    misc_where_base = "(fp.id IS NULL OR fp.can_view IS NOT FALSE) AND (LOWER(mf.user_provided_title) LIKE ? OR LOWER(mf.user_provided_description) LIKE ? OR LOWER(mf.original_filename) LIKE ?)" # Standardized view condition

    if logged_in_user_id:
        misc_select_final = f"{misc_select_base}, uf.id AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        misc_from_final = f"{misc_from_base} LEFT JOIN file_permissions fp_dl ON mf.id = fp_dl.file_id AND fp_dl.file_type = 'misc_file' AND fp_dl.user_id = ? LEFT JOIN user_favorites uf ON mf.id = uf.item_id AND uf.item_type = 'misc_file' AND uf.user_id = ?"
        misc_params.extend([logged_in_user_id, logged_in_user_id])
    else:
        misc_select_final = f"{misc_select_base}, NULL AS favorite_id, (CASE WHEN fp_dl.id IS NULL THEN 1 WHEN fp_dl.can_download IS FALSE THEN 0 ELSE 1 END) AS is_downloadable" # Final download condition
        misc_from_final = f"{misc_from_base} LEFT JOIN file_permissions fp_dl ON mf.id = fp_dl.file_id AND fp_dl.file_type = 'misc_file' AND fp_dl.user_id = ?"
        misc_params.append(None)

    sql_misc_files = f"{misc_select_final} {misc_from_final} WHERE {misc_where_base}"
    # app.logger.info(f"Search API - Misc Files Query for user {logged_in_user_id}: {sql_misc_files}") # Removed
    # app.logger.info(f"Search API - Misc Files Params: {tuple(misc_params)}") # Removed
    results.extend([dict(row) for row in db.execute(sql_misc_files, tuple(misc_params)).fetchall()])

    # Software (No direct file_permissions, viewability depends on other factors or is public)
    # Favorite status is still relevant for software.
    sql_software_select = "SELECT s.id, s.name, s.description, 'software' AS type"
    sql_software_from = "FROM software s"
    software_params = [like_query_term, like_query_term]
    if logged_in_user_id: # For favorite status
        sql_software_select += ", uf.id AS favorite_id"
        sql_software_from += " LEFT JOIN user_favorites uf ON s.id = uf.item_id AND uf.item_type = 'software' AND uf.user_id = ?"
        software_params.append(logged_in_user_id)
    else: # Ensure favorite_id column exists
        sql_software_select += ", NULL AS favorite_id"
    sql_software_query = f"{sql_software_select} {sql_software_from} WHERE (LOWER(s.name) LIKE ? OR LOWER(s.description) LIKE ?)"
    results.extend([dict(row) for row in db.execute(sql_software_query, tuple(software_params)).fetchall()])

    # Versions (No direct file_permissions, viewability depends on other factors or is public)
    sql_versions_select = "SELECT v.id, v.version_number AS name, v.changelog, v.known_bugs, v.software_id, sw.name AS software_name, 'version' AS type" # Renamed s to sw to avoid conflict
    sql_versions_from = "FROM versions v JOIN software sw ON v.software_id = sw.id" # Renamed s to sw
    version_params = [like_query_term, like_query_term, like_query_term]
    if logged_in_user_id: # For favorite status
        sql_versions_select += ", uf.id AS favorite_id"
        sql_versions_from += " LEFT JOIN user_favorites uf ON v.id = uf.item_id AND uf.item_type = 'version' AND uf.user_id = ?"
        version_params.append(logged_in_user_id)
    else: # Ensure favorite_id column exists
        sql_versions_select += ", NULL AS favorite_id"
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

# --- Database Reset Start Endpoint (Super Admin) ---
@app.route('/api/superadmin/database/reset/start', methods=['POST'])
@jwt_required()
@super_admin_required
def database_reset_start():
    current_user_username = get_jwt_identity() # This is actually the user ID string from JWT
    db = get_db()

    # Fetch user details using the ID from JWT
    # Assuming get_jwt_identity() returns user ID as string, convert to int
    try:
        user_id_int = int(current_user_username)
    except ValueError:
        app.logger.error(f"Invalid user ID format from JWT: {current_user_username}")
        return jsonify(msg="Invalid user identity in token."), 401 # Or 400

    user = find_user_by_id(user_id_int)
    if not user:
        app.logger.error(f"User not found for ID: {user_id_int} from JWT.")
        return jsonify(msg="User not found or invalid token."), 401

    actual_username = user['username'] # Correct username for logging
    user_email = user['email']

    data = request.get_json()
    if not data or not data.get('reason'):
        return jsonify(msg="Reason for reset is required."), 400
    reason = data['reason']

    # 1. Create reset_logs directory
    reset_logs_dir = os.path.join(app.config['INSTANCE_FOLDER_PATH'], 'reset_logs')
    try:
        os.makedirs(reset_logs_dir, exist_ok=True)
    except OSError as e:
        app.logger.error(f"Failed to create reset_logs directory: {e}")
        return jsonify(msg="Server error: Could not create log directory."), 500

    # 2. Log information to a timestamped text file
    log_timestamp = datetime.now(IST) # Changed to IST
    log_filename = f"reset_{log_timestamp.strftime('%Y%m%d_%H%M%S')}_{actual_username}.txt"
    log_file_path = os.path.join(reset_logs_dir, log_filename)

    try:
        with open(log_file_path, 'w') as f:
            f.write(f"Timestamp: {log_timestamp.isoformat()}\n")
            f.write(f"Username: {actual_username}\n")
            f.write(f"Email: {user_email}\n")
            
            # Determine client IP
            x_forwarded_for = request.headers.get('X-Forwarded-For')
            ip_source = ''
            if x_forwarded_for:
                client_ip = x_forwarded_for.split(',')[0].strip()
                ip_source = 'X-Forwarded-For'
            else:
                client_ip = request.headers.get('X-Real-IP')
                if client_ip:
                    ip_source = 'X-Real-IP'
                else:
                    client_ip = request.remote_addr
                    ip_source = 'remote_addr'
            
            if not client_ip: # Fallback if somehow all are None/empty
                client_ip = "IPNotDetected"
                ip_source = "Unavailable"
            
            f.write(f"IP Address: {client_ip} (Source: {ip_source})\n")
            f.write(f"Reason: {reason}\n")
    except IOError as e:
        app.logger.error(f"Failed to write to reset log file {log_file_path}: {e}")
        # Continue with the process even if logging to file fails, but log this error.
        # Alternatively, could return an error here if file logging is critical.

    # 3. Call database backup logic
    backup_success, backup_path_or_error = _perform_database_backup()
    if not backup_success:
        log_audit_action(
            action_type='DATABASE_RESET_START_FAILED_BACKUP',
            target_table='database', # General target
            details={'reason': reason, 'backup_error': backup_path_or_error, 'log_file': log_file_path},
            user_id=user_id_int, # Pass the fetched user_id
            username=actual_username
        )
        return jsonify(msg="Database backup failed during reset process.", error=backup_path_or_error), 500

    # 4. Log audit action for successful initiation
    log_audit_action(
        action_type='DATABASE_RESET_START_INITIATED',
        target_table='database', # General target
        details={'reason': reason, 'backup_path': backup_path_or_error, 'log_file': log_file_path},
        user_id=user_id_int, # Pass the fetched user_id
        username=actual_username
    )

    # 5. Return success response
    return jsonify(
        message="Reason logged and database backup successful. Proceed to final confirmation.",
        backup_path=backup_path_or_error,
        log_file=log_file_path
    ), 200

# --- Helper for Database Backup ---
def _perform_database_backup():
    """
    Performs a database backup.
    Returns: (bool: success, str: backup_path or error_message)
    """
    try:
        backup_dir = os.path.join(app.config['INSTANCE_FOLDER_PATH'], 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        source_db_path = app.config['DATABASE']
        timestamp = datetime.now(IST).strftime('%Y%m%d_%H%M%S') # Changed to IST
        backup_filename = f"software_dashboard_{timestamp}.db"
        backup_file_path = os.path.join(backup_dir, backup_filename)
        shutil.copy2(source_db_path, backup_file_path)
        return True, backup_file_path
    except Exception as e:
        app.logger.error(f"Database backup helper failed: {e}", exc_info=True)
        return False, str(e)

# --- Database Backup Endpoint (Super Admin) ---
@app.route('/api/superadmin/database/backup', methods=['GET'])
@jwt_required()
@super_admin_required
def backup_database_route(): # Renamed to avoid conflict with the old name if it was a module-level function
    success, path_or_error = _perform_database_backup()
    if success:
        log_audit_action(
            action_type='DATABASE_BACKUP_SUCCESS', # Keep this specific for direct backup route
            details={'backup_path': path_or_error}
        )
        return jsonify(message="Database backup successful.", backup_path=path_or_error), 200
    else:
        # log_audit_action for failure could be added here if desired
        return jsonify(msg="Database backup failed.", error=path_or_error), 500

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

# --- Database Reset Confirm Endpoint (Super Admin) ---
@app.route('/api/superadmin/database/reset/confirm', methods=['POST'])
@jwt_required()
@super_admin_required
def database_reset_confirm():
    current_user_id_str = get_jwt_identity()
    try:
        user_id_int = int(current_user_id_str)
    except ValueError:
        app.logger.error(f"Invalid user ID format from JWT: {current_user_id_str}")
        return jsonify(msg="Invalid user identity in token."), 400 # Or 401

    user = find_user_by_id(user_id_int) # Fetch user for logging username
    if not user: # Should not happen if JWT is valid
        app.logger.error(f"User not found for ID: {user_id_int} from JWT during DB reset confirm.")
        return jsonify(msg="User not found or invalid token."), 401

    actual_username = user['username']

    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON payload."), 400

    reset_password = data.get('reset_password')
    confirmation_text = data.get('confirmation_text')

    # Validation
    if reset_password != "I2vdatabase@123#@123":
        log_audit_action(
            action_type='DATABASE_RESET_CONFIRM_FAILED_VALIDATION',
            user_id=user_id_int, username=actual_username,
            details={'reason': 'Invalid reset password provided', 'ip_address': request.remote_addr}
        )
        return jsonify(msg="Invalid reset password."), 400

    if confirmation_text != "CONFIRM DELETE":
        log_audit_action(
            action_type='DATABASE_RESET_CONFIRM_FAILED_VALIDATION',
            user_id=user_id_int, username=actual_username,
            details={'reason': 'Invalid confirmation text provided', 'ip_address': request.remote_addr}
        )
        return jsonify(msg="Invalid confirmation text."), 400

    db_path = app.config['DATABASE']

    # Close existing g.db connection if it exists
    db_conn_to_close = g.pop('db', None)
    if db_conn_to_close is not None:
        try:
            db_conn_to_close.close()
            app.logger.info("Successfully closed g.db connection before database reset.")
        except Exception as e_close:
            app.logger.error(f"Error closing g.db connection before reset: {e_close}")
            # Potentially proceed, but this is risky. For now, we will proceed.

    # Delete the database file
    try:
        if os.path.exists(db_path):
            os.remove(db_path)
            app.logger.info(f"Database file {db_path} deleted successfully.")
        else:
            app.logger.warning(f"Database file {db_path} not found for deletion during reset. Proceeding to re-initialize.")
    except OSError as e:
        app.logger.error(f"Error deleting database file {db_path}: {e}")
        log_audit_action(
            action_type='DATABASE_RESET_FAILED_DELETE',
            user_id=user_id_int, username=actual_username,
            details={'error': str(e), 'db_path': db_path, 'ip_address': request.remote_addr}
        )
        return jsonify(msg="Failed to delete database file.", error=str(e)), 500

    # Re-initialize the database
    try:
        database.init_db(db_path) # This function now handles db_path correctly
        app.logger.info(f"Database {db_path} re-initialized successfully.")

        # After init_db, it's good practice to re-establish g.db for any subsequent operations in this request (if any)
        # or for other teardown logic that might expect g.db.
        # However, since we're returning immediately, it might not be strictly necessary here.
        # For robustness:
        g.db = database.get_db_connection(db_path)
        g.db.row_factory = sqlite3.Row


        log_audit_action(
            action_type='DATABASE_RESET_COMPLETED',
            user_id=user_id_int, username=actual_username,
            details={'db_path': db_path, 'ip_address': request.remote_addr}
        )
        return jsonify(message="Database has been successfully reset."), 200
    except Exception as e:
        app.logger.error(f"Error re-initializing database {db_path}: {e}")
        log_audit_action(
            action_type='DATABASE_RESET_FAILED_INIT',
            user_id=user_id_int, username=actual_username,
            details={'error': str(e), 'db_path': db_path, 'ip_address': request.remote_addr}
        )
        # Attempt to restore failsafe backup if db re-initialization fails?
        # This is complex and depends on how init_db might fail.
        # For now, just report the error.
        return jsonify(msg="Failed to re-initialize database.", error=str(e)), 500


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
        items_as_dicts = [convert_timestamps_to_ist_iso(dict(item), ['favorited_at']) for item in items]

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
        processed_fav_record = convert_timestamps_to_ist_iso(dict(favorite_record), ['created_at'])
        return jsonify({
            "is_favorite": True,
            "favorite_id": processed_fav_record['id'], # ID of the user_favorites record
            "favorited_at": processed_fav_record['created_at'] # Key is 'created_at' in DB, exposed as 'favorited_at'
        }), 200
    else:
        return jsonify({"is_favorite": False, "favorite_id": None, "favorited_at": None}), 200

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
            logs_list_raw = [dict(row) for row in logs_cursor.fetchall()]
            ts_keys = ['timestamp']
            logs_list = [convert_timestamps_to_ist_iso(log, ts_keys) for log in logs_list_raw]
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
        recent_activities_raw = [
            dict(row) for row in db.execute(
                "SELECT action_type, username, timestamp, details FROM audit_logs ORDER BY timestamp DESC LIMIT 5"
            ).fetchall()
        ]
        recent_activities = [convert_timestamps_to_ist_iso(act, ['timestamp']) for act in recent_activities_raw]

        # --- Recent Additions (last 5 across all types) ---
        recent_additions_raw = []
        recent_additions_raw += [
            dict(row) for row in db.execute(
                "SELECT id, doc_name as name, created_at, 'Document' as type FROM documents ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions_raw += [
            dict(row) for row in db.execute(
                "SELECT id, patch_name as name, created_at, 'Patch' as type FROM patches ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions_raw += [
            dict(row) for row in db.execute(
                "SELECT id, title as name, created_at, 'Link File' as type FROM links WHERE is_external_link = FALSE ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        recent_additions_raw += [
            dict(row) for row in db.execute(
                "SELECT id, COALESCE(user_provided_title, original_filename) as name, created_at, 'Misc File' as type FROM misc_files ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        # Sort before converting, as conversion might make direct string sort tricky if not all are proper ISO strings yet
        recent_additions_raw.sort(key=lambda x: x['created_at'], reverse=True)

        processed_recent_additions = [convert_timestamps_to_ist_iso(add, ['created_at']) for add in recent_additions_raw]
        top_recent_additions = processed_recent_additions[:5]

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

# --- Helper function for Global Password Initialization ---
def _initialize_global_password(db: sqlite3.Connection):
    try:
        cursor = db.execute("SELECT setting_value FROM site_settings WHERE setting_key = 'global_password_hash'")
        existing_setting = cursor.fetchone()
        if not existing_setting:
            print("Initializing default global password...")
            default_password = "Admin@123"
            hashed_password = bcrypt.generate_password_hash(default_password).decode('utf-8')
            db.execute("INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)", ('global_password_hash', hashed_password))
            db.commit()
            print("Default global password initialized.")
        else:
            print("Global password already set.")
    except sqlite3.Error as e: print(f"SQLite error during global password initialization: {e}")
    except Exception as e: print(f"An unexpected error occurred during global password initialization: {e}")

# --- CLI Command ---
@app.cli.command('init-db')
def init_db_command():
    database.init_db(app.config['DATABASE'])
    print('Initialized the database.')
    try:
        db = get_db() 
        _initialize_global_password(db)
    except Exception as e: print(f"Error during global password initialization in init_db_command: {e}")

# It's important that app.static_folder is correctly defined earlier in the script,
# which should be:
# STATIC_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend', 'dist')
# app.static_folder = STATIC_FOLDER (implicitly set by Flask(static_folder=STATIC_FOLDER))

@app.route('/assets/<path:filename>')
def serve_spa_assets(filename):
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)

# This is the catch-all for your SPA's client-side routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa_catch_all(path): # Renamed function to ensure no endpoint conflicts
    # This function now serves index.html for any path not caught above (assets or API routes)
    # It needs to correctly find index.html within app.static_folder (frontend/dist/index.html)
    return send_from_directory(app.static_folder, 'index.html')

# --- Backup and Scheduler Functions ---




if __name__ == '__main__':
    db_path = app.config.get('DATABASE')
    if not db_path:
        app.logger.error("ERROR: DATABASE configuration not found in app.config. Cannot initialize DB.")
    else:
        db_dir = os.path.dirname(db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
                app.logger.info(f"Created instance directory: {db_dir}")
            except OSError as e:
                app.logger.error(f"Error creating instance directory {db_dir}: {e}")
        
        if not os.path.exists(db_path):
            app.logger.info(f"Database file not found at {db_path}. Initializing database schema...")
            try:
                database.init_db(db_path) 
                app.logger.info(f"Database schema initialized successfully at {db_path}.")
            except Exception as e:
                app.logger.error(f"An error occurred during database schema initialization: {e}")
        else:
            app.logger.info(f"Database file already exists at {db_path}. Skipping schema initialization.")

        if os.path.exists(db_path):
            with app.app_context(): # Create an app context for get_db()
                 temp_conn_main = None
                 try:
                    # Use get_db() within context to ensure proper handling if it uses 'g'
                    temp_conn_main = get_db() 
                    _initialize_global_password(temp_conn_main)
                 except sqlite3.OperationalError as e_op:
                     app.logger.error(f"SQLite OperationalError during global password initialization in __main__: {e_op}")
                 except Exception as e_global_pw:
                     app.logger.error(f"Error during global password initialization in __main__: {e_global_pw}")
                 # No explicit close needed for g.db here, teardown_appcontext handles it.
        else: 
            app.logger.warning(f"Skipping global password initialization as database file {db_path} was not successfully created/initialized.")

    # Note: Scheduler and backup checks are now initialized by initialize_scheduler_and_backups(app)
    # called after app creation and configuration.

    try:
        flask_port = int(os.environ.get('FLASK_RUN_PORT', 7000))
        app.run(host='0.0.0.0', port=flask_port, debug=True)
    except (KeyboardInterrupt, SystemExit):
        app.logger.info("Flask application shutting down...")
    # Removed explicit scheduler shutdown from here as it's handled by atexit

# --- Maintenance Mode Endpoints (Super Admin) ---
@app.route('/api/admin/maintenance-mode', methods=['GET'])
@jwt_required()
@super_admin_required
def get_maintenance_mode_status():
    db = get_db()
    try:
        setting = db.execute("SELECT is_enabled FROM system_settings WHERE setting_name = 'maintenance_mode'").fetchone()
        if setting:
            return jsonify({"maintenance_mode_enabled": bool(setting['is_enabled'])}), 200
        else:
            # This case should ideally not happen if schema.sql initializes the setting
            app.logger.warning("Maintenance mode setting 'maintenance_mode' not found in system_settings.")
            # Default to False if not found, though it should always be there.
            return jsonify({"maintenance_mode_enabled": False, "msg": "Setting not found, defaulting to disabled."}), 404 
    except sqlite3.Error as e:
        app.logger.error(f"Database error fetching maintenance mode status: {e}")
        return jsonify({"msg": "Database error", "error": str(e)}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching maintenance mode status: {e}", exc_info=True)
        return jsonify({"msg": "An unexpected server error occurred", "error": str(e)}), 500

@app.route('/api/admin/maintenance-mode/enable', methods=['POST'])
@jwt_required()
@super_admin_required
def enable_maintenance_mode():
    db = get_db()
    try:
        cursor = db.execute("UPDATE system_settings SET is_enabled = 1 WHERE setting_name = 'maintenance_mode'")
        db.commit()
        if cursor.rowcount > 0:
            log_audit_action(action_type='MAINTENANCE_MODE_ENABLED')
            return jsonify({"msg": "Maintenance mode enabled", "maintenance_mode_enabled": True}), 200
        else:
            # This implies 'maintenance_mode' setting was not found to update.
            app.logger.error("Failed to enable maintenance mode: 'maintenance_mode' setting not found in system_settings for update.")
            return jsonify({"msg": "Failed to enable maintenance mode: setting not found."}), 404
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error enabling maintenance mode: {e}")
        return jsonify({"msg": "Database error", "error": str(e)}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error enabling maintenance mode: {e}", exc_info=True)
        return jsonify({"msg": "An unexpected server error occurred", "error": str(e)}), 500

@app.route('/api/admin/maintenance-mode/disable', methods=['POST'])
@jwt_required()
@super_admin_required
def disable_maintenance_mode():
    db = get_db()
    try:
        cursor = db.execute("UPDATE system_settings SET is_enabled = 0 WHERE setting_name = 'maintenance_mode'")
        db.commit()
        if cursor.rowcount > 0:
            log_audit_action(action_type='MAINTENANCE_MODE_DISABLED')
            return jsonify({"msg": "Maintenance mode disabled", "maintenance_mode_enabled": False}), 200
        else:
            app.logger.error("Failed to disable maintenance mode: 'maintenance_mode' setting not found in system_settings for update.")
            return jsonify({"msg": "Failed to disable maintenance mode: setting not found."}), 404
    except sqlite3.Error as e:
        db.rollback()
        app.logger.error(f"Database error disabling maintenance mode: {e}")
        return jsonify({"msg": "Database error", "error": str(e)}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error disabling maintenance mode: {e}", exc_info=True)
        return jsonify({"msg": "An unexpected server error occurred", "error": str(e)}), 500

# --- Large File Upload Endpoint ---
@app.route('/api/admin/upload_large_file', methods=['POST'])
@jwt_required()
@admin_required
def admin_upload_large_file():
    current_user_id = int(get_jwt_identity())
    db = get_db() # For potential future use (e.g., storing metadata early)

    try:
        # --- Form Data ---
        file_chunk = request.files.get('file_chunk')
        chunk_number_str = request.form.get('chunk_number')
        total_chunks_str = request.form.get('total_chunks')
        upload_id = request.form.get('upload_id')
        original_filename = request.form.get('original_filename')
        item_type = request.form.get('item_type')

        # --- Metadata (expected with every chunk, but primarily used by the last) ---
        # Common metadata
        description = request.form.get('description', '') # Optional
        
        # Item-type specific metadata
        software_id_str = request.form.get('software_id') # For docs, patches, links
        version_id_str = request.form.get('version_id') # For patches, links
        doc_name = request.form.get('doc_name') # For documents
        doc_type = request.form.get('doc_type') # For documents
        patch_name = request.form.get('patch_name') # For patches
        release_date = request.form.get('release_date') # For patches
        patch_by_developer = request.form.get('patch_by_developer') # For patches
        link_title = request.form.get('title') # For links (used as 'title')
        # For misc_files
        misc_category_id_str = request.form.get('misc_category_id')
        user_provided_title_misc = request.form.get('user_provided_title') # For misc_files (can also be 'title')
        # For links (title comes as 'link_title' from AdminLinkEntryForm's chunkMetadata)
        link_title_from_form = request.form.get('link_title') 
        typed_version_string = request.form.get('typed_version_string') # For patches/links if version_id not directly given


        # --- Basic Validation for core chunking fields ---
        required_chunk_fields = {
            'file_chunk': file_chunk, 'chunk_number': chunk_number_str, 'total_chunks': total_chunks_str,
            'upload_id': upload_id, 'original_filename': original_filename, 'item_type': item_type
        }
        missing_chunk_fields = [name for name, val in required_chunk_fields.items() if val is None or (isinstance(val, str) and not val.strip())]
        if file_chunk and file_chunk.filename == '':
            missing_chunk_fields.append('file_chunk (empty filename)')
        
        if missing_chunk_fields:
            return jsonify(msg=f"Missing required chunking form fields: {', '.join(missing_chunk_fields)}"), 400

        try:
            chunk_number = int(chunk_number_str)
            total_chunks = int(total_chunks_str)
        except ValueError:
            return jsonify(msg="chunk_number and total_chunks must be integers."), 400

        valid_item_types = ['document', 'patch', 'misc_file', 'link_file']
        if item_type not in valid_item_types:
            return jsonify(msg=f"Invalid item_type. Must be one of: {', '.join(valid_item_types)}"), 400
        
        # Log a warning if original_filename fails allowed_file check but proceed
        if not allowed_file(original_filename):
            app.logger.warning(f"Large file upload: original_filename '{original_filename}' failed allowed_file check (e.g. missing extension or disallowed). Proceeding with upload based on item_type '{item_type}'.")
            # The upload proceeds; actual storage and DB record will use derived/default types if needed.

        # --- Chunk Handling ---
        tmp_dir = app.config['TMP_LARGE_UPLOADS_FOLDER']
        if not os.path.exists(tmp_dir): # Should have been created at startup, but check again
            os.makedirs(tmp_dir, exist_ok=True)

        # Secure original_filename before using it in path (though upload_id provides uniqueness)
        secured_original_filename = secure_filename(original_filename)
        temp_part_filename = f"{upload_id}-{secured_original_filename}.part"
        temp_part_filepath = os.path.join(tmp_dir, temp_part_filename)
        
        # For simplicity, append chunks. Client must send them in order.
        # More robust solution would use chunk_number to write to specific offsets,
        # or store chunks separately and reassemble, but that's more complex.
        try:
            with open(temp_part_filepath, 'ab') as f: # Append binary
                f.write(file_chunk.read())
        except IOError as e:
            app.logger.error(f"IOError appending to chunk file {temp_part_filepath}: {e}")
            # Consider cleaning up temp_part_filepath if error occurs
            return jsonify(msg="Error saving file chunk."), 500
        
        app.logger.info(f"User {current_user_id} uploaded chunk {chunk_number}/{total_chunks-1} for upload_id {upload_id}, file {original_filename} to {temp_part_filepath}")

        # --- Check if this is the last chunk ---
        if chunk_number == total_chunks - 1:
            # File assembly is complete (or all chunks received if appending serially)
            app.logger.info(f"Last chunk received for {upload_id}-{original_filename}. File assembly complete at {temp_part_filepath}.")
            
            # TODO:
            # 1. Determine final upload folder based on item_type.
            # 2. Generate new unique stored_filename.
            # 3. Move temp_part_filepath to final_folder/stored_filename.
            # 4. Calculate file_size (os.path.getsize).
            # 5. Get file_type (MIME from original or infer).
            # 6. Insert metadata into appropriate DB table.
            #    - This requires all other metadata fields (software_id, title, description etc.)
            #    - Consider requiring all metadata with the LAST chunk, or storing metadata from first chunk.
            #    - For now, assume metadata will be passed with the last chunk for processing.
            # File assembly is complete (or all chunks received if appending serially)
            app.logger.info(f"Last chunk received for {upload_id}-{original_filename}. File assembly complete at {temp_part_filepath}.")
            
            # --- Metadata Validation for Last Chunk ---
            # (This assumes metadata is sent with the last chunk, or every chunk)
            final_metadata_errors = []
            metadata_payload = {'description': description} # Common field

            if item_type == 'document':
                if not software_id_str: final_metadata_errors.append("software_id")
                else: metadata_payload['software_id'] = software_id_str
                if not doc_name: final_metadata_errors.append("doc_name")
                else: metadata_payload['doc_name'] = doc_name
                metadata_payload['doc_type'] = doc_type if doc_type else ''
            elif item_type == 'patch':
                resolved_version_id_for_patch = None
                if version_id_str and version_id_str.strip():
                    try:
                        parsed_version_id = int(version_id_str)
                        if parsed_version_id > 0:
                            # TODO: Validate this version_id actually belongs to the software_id if software_id is also part of patch metadata directly
                            # For now, assume if version_id is given, it's valid and associated correctly upstream or doesn't need software_id for this specific item_type's direct FK.
                            # The `_admin_handle_large_file_db_insert` for patches uses version_id directly.
                            # However, if a software_id is also passed for patches (it's not typical for patch table, version implies software), it should be consistent.
                            # For now, we take version_id_str as the primary identifier for the version.
                            resolved_version_id_for_patch = parsed_version_id
                        else:
                            final_metadata_errors.append("version_id must be a positive integer if provided directly.")
                    except ValueError:
                        final_metadata_errors.append("Invalid format for version_id.")
                elif typed_version_string and typed_version_string.strip():
                    if not software_id_str or not software_id_str.strip(): # software_id is needed to create/find version by string
                        final_metadata_errors.append("software_id is required when typed_version_string is used for patches.")
                    else:
                        try:
                            temp_software_id = int(software_id_str)
                            # current_user_id and db are available in this scope
                            resolved_version_id_for_patch = get_or_create_version_id(db, temp_software_id, typed_version_string.strip(), current_user_id)
                            if resolved_version_id_for_patch is None:
                                final_metadata_errors.append(f"Failed to find or create version from '{typed_version_string.strip()}' for software ID {temp_software_id}.")
                        except ValueError:
                            final_metadata_errors.append("Invalid software_id format when using typed_version_string.")
                else: # Neither direct version_id nor typed_version_string provided
                    final_metadata_errors.append("version_id (selected or typed via typed_version_string with software_id) is required for patches.")

                if resolved_version_id_for_patch is not None:
                    metadata_payload['version_id'] = resolved_version_id_for_patch
                elif not any("version_id" in e.lower() or "version" in e.lower() for e in final_metadata_errors):
                     # Add a generic error if no specific version error was already added
                    final_metadata_errors.append("Valid version_id could not be determined for patch.")

                # Other patch metadata
                if not patch_name: final_metadata_errors.append("patch_name")
                else: metadata_payload['patch_name'] = patch_name
                
                metadata_payload['software_id'] = software_id_str 
                metadata_payload['release_date'] = release_date 
                metadata_payload['patch_by_developer'] = patch_by_developer if patch_by_developer else ''
            elif item_type == 'misc_file':
                if not misc_category_id_str: final_metadata_errors.append("misc_category_id")
                else: metadata_payload['misc_category_id'] = misc_category_id_str
                metadata_payload['user_provided_title_misc'] = user_provided_title_misc
            elif item_type == 'link_file':
                # software_id is mandatory for links
                if not software_id_str: 
                    final_metadata_errors.append("software_id for link_file")
                else:
                    try:
                        metadata_payload['software_id'] = int(software_id_str) # Store as int
                    except ValueError:
                        final_metadata_errors.append("Invalid software_id format for link_file.")

                # version_id is mandatory for links (NOT NULL in DB)
                resolved_version_id_for_link = None
                if version_id_str and version_id_str.strip():
                    try:
                        parsed_version_id = int(version_id_str)
                        if parsed_version_id > 0:
                            resolved_version_id_for_link = parsed_version_id
                        else:
                            final_metadata_errors.append("version_id must be a positive integer if provided directly for link_file.")
                    except ValueError:
                        final_metadata_errors.append("Invalid format for version_id for link_file.")
                elif typed_version_string and typed_version_string.strip():
                    if not software_id_str or not software_id_str.strip(): # software_id must be present
                        final_metadata_errors.append("software_id is required with typed_version_string for link_file.")
                    else:
                        try:
                            temp_software_id_for_link = int(software_id_str)
                            resolved_version_id_for_link = get_or_create_version_id(db, temp_software_id_for_link, typed_version_string.strip(), current_user_id)
                            if resolved_version_id_for_link is None:
                                final_metadata_errors.append(f"Failed to find or create version from '{typed_version_string.strip()}' for software ID {temp_software_id_for_link} (link_file).")
                        except ValueError:
                            final_metadata_errors.append("Invalid software_id format for typed_version_string (link_file).")
                else: 
                    final_metadata_errors.append("A valid version (selected or typed) is required for link_file.")

                if resolved_version_id_for_link is not None:
                    metadata_payload['version_id'] = resolved_version_id_for_link
                elif not any("version_id" in e.lower() or "version" in e.lower() for e in final_metadata_errors):
                     final_metadata_errors.append("Valid version_id could not be determined for link_file.")

                # Use 'link_title' from form (as sent by frontend)
                if not link_title_from_form: 
                    final_metadata_errors.append("link_title (form field 'title') is required for link_file")
                else: 
                    metadata_payload['link_title'] = link_title_from_form
                
                # description is already in metadata_payload if provided (common field)

            if final_metadata_errors:
                _delete_file_if_exists(temp_part_filepath) # Cleanup partial file on error
                return jsonify(msg=f"Missing required metadata for item_type '{item_type}' on final chunk: {', '.join(final_metadata_errors)}"), 400

            # --- Final File Processing ---
            final_upload_folder = None
            if item_type == 'document': final_upload_folder = app.config['DOC_UPLOAD_FOLDER']
            elif item_type == 'patch': final_upload_folder = app.config['PATCH_UPLOAD_FOLDER']
            elif item_type == 'misc_file': final_upload_folder = app.config['MISC_UPLOAD_FOLDER']
            elif item_type == 'link_file': final_upload_folder = app.config['LINK_UPLOAD_FOLDER']

            if not final_upload_folder:
                 _delete_file_if_exists(temp_part_filepath)
                 return jsonify(msg="Internal error: Could not determine final upload folder."), 500

            # Determine extension for stored_filename
            original_ext = secured_original_filename.rsplit('.', 1)[-1].lower() if '.' in secured_original_filename else ''
            
            # Capture mime type from the current file_chunk (representing the last chunk)
            chunk_mime_type = file_chunk.mimetype if file_chunk else 'application/octet-stream'
            app.logger.info(f"Large file upload: Last chunk MIME type detected as '{chunk_mime_type}' for {original_filename}")

            final_ext = original_ext
            if not final_ext: # If original filename had no extension
                final_ext = COMMON_MIME_TO_EXT.get(chunk_mime_type)
                if final_ext:
                    app.logger.info(f"Large file upload: Original filename '{original_filename}' had no extension. Derived '{final_ext}' from MIME type '{chunk_mime_type}'.")
                else:
                    app.logger.warning(f"Large file upload: Could not derive extension for '{original_filename}' from MIME type '{chunk_mime_type}'. Stored file may lack an extension.")
                    final_ext = '' # Ensure it's an empty string if no extension found
            
            new_stored_filename_base = uuid.uuid4().hex
            # Ensure final_ext is not None before concatenation if COMMON_MIME_TO_EXT.get could return None and final_ext wasn't re-assigned to ''
            final_stored_filename = f"{new_stored_filename_base}{'.' + final_ext if final_ext else ''}"
            final_filepath = os.path.join(final_upload_folder, final_stored_filename)
            app.logger.info(f"Large file upload: Determined final stored_filename as '{final_stored_filename}' (original_ext: '{original_ext}', mime_type: '{chunk_mime_type}', derived_ext: '{final_ext}')")
            
            try:
                shutil.move(temp_part_filepath, final_filepath)
                app.logger.info(f"Moved completed file from {temp_part_filepath} to {final_filepath}")
            except Exception as e_move:
                app.logger.error(f"Error moving completed file {temp_part_filepath} to {final_filepath}: {e_move}")
                _delete_file_if_exists(temp_part_filepath) # Attempt cleanup
                _delete_file_if_exists(final_filepath) # Attempt cleanup if move partially failed
                return jsonify(msg=f"Error finalizing file movement: {str(e_move)}"), 500

            file_size = os.path.getsize(final_filepath)
            
            # Infer MIME type (basic) - can be enhanced
            # original_ext is defined above from secured_original_filename
            mime_type = file_chunk.mimetype if file_chunk and file_chunk.mimetype and file_chunk.mimetype != 'application/octet-stream' else None
            app.logger.info(f"Large file upload: MIME type from chunk: {mime_type if mime_type else 'N/A or octet-stream'}")

            if not mime_type: # If chunk's mime_type is generic or missing
                app.logger.info(f"Large file upload: Inferring MIME type from original_ext: '{original_ext}'")
                # Basic inference from extension (original_ext is defined above)
                if original_ext == 'pdf': mime_type = 'application/pdf'
                elif original_ext in ['png', 'jpg', 'jpeg', 'gif']: mime_type = f'image/{original_ext}'
                # Add more inferences based on COMMON_MIME_TO_EXT keys or other known extensions
                elif original_ext == 'mkv': mime_type = 'video/x-matroska'
                elif original_ext == 'ts': mime_type = 'video/mp2t'
                elif original_ext == 'iso': mime_type = 'application/x-iso9660-image'
                elif original_ext == 'zip': mime_type = 'application/zip'
                else: mime_type = 'application/octet-stream' # Default
                app.logger.info(f"Large file upload: Inferred MIME type as: '{mime_type}'")
            
            # Use the captured chunk_mime_type for DB insertion.
            # The _admin_handle_large_file_db_insert helper will use this as the 'file_type' in the DB.
            db_mime_type_for_insert = mime_type # This line was from a previous incorrect diff, it should be chunk_mime_type that is refined and then used.
                                                 # The mime_type variable itself is what gets refined here.

            app.logger.info(f"Large file upload: Passing to DB helper: stored_filename='{final_stored_filename}', original_filename='{original_filename}', file_size={file_size}, mime_type_for_db='{mime_type}'") # Use refined mime_type
            # --- Database Insertion ---
            new_item, error_response, status_code = _admin_handle_large_file_db_insert(
                item_type=item_type,
                stored_filename=final_stored_filename,
                original_filename=original_filename, # secured_original_filename is not the true original
                file_size=file_size,
                mime_type=mime_type, # Pass the refined mime_type
                current_user_id=current_user_id,
                metadata=metadata_payload
            )

            if error_response: # DB insertion failed
                _delete_file_if_exists(final_filepath) # Cleanup successfully moved file
                app.logger.error(f"DB insertion failed for large file {original_filename} (upload_id: {upload_id}). Cleaned up final file: {final_filepath}")
                return error_response, status_code # error_response is already a jsonify object

            # Log audit action for successful large file upload and DB insert
            audit_action_type = f'CREATE_{item_type.upper()}_LARGE_FILE'
            log_audit_action(
                action_type=audit_action_type,
                target_table=item_type + "s", 
                target_id=new_item.get('id') if new_item else None,
                details={
                    'original_filename': original_filename,
                    'stored_filename': final_stored_filename,
                    'file_size': file_size,
                    'item_type': item_type,
                    'upload_id': upload_id,
                    # Add other relevant metadata from metadata_payload if needed for audit
                    'doc_name': metadata_payload.get('doc_name'), # Example
                    'patch_name': metadata_payload.get('patch_name') # Example
                },
                user_id=current_user_id
            )
            
            return jsonify(new_item), 201 # Return the newly created item from DB

        else:
            # Not the last chunk, acknowledge receipt
            return jsonify(msg=f"Chunk {chunk_number}/{total_chunks-1} for {original_filename} received successfully."), 200

    except Exception as e:
        app.logger.error(f"Error in /api/admin/upload_large_file: {e}", exc_info=True)
        # Consider cleaning up temp_part_filepath if an error occurs at a higher level
        return jsonify(msg=f"An unexpected server error occurred: {str(e)}"), 500


# --- Profile Picture Serving Endpoint ---
@app.route('/profile_pictures/<path:filename>')
def serve_profile_picture(filename):
    return send_from_directory(app.config['PROFILE_PICTURES_UPLOAD_FOLDER'], filename)

# --- User Favorites Endpoints ---
ALLOWED_FAVORITE_ITEM_TYPES = ['document', 'patch', 'link', 'misc_file', 'software', 'version']

# --- Bulk Action Constants ---
ALLOWED_BULK_ITEM_TYPES = ['document', 'patch', 'link', 'misc_file']

# --- Comment Item Types ---
ALLOWED_COMMENT_ITEM_TYPES = ['document', 'patch', 'link', 'misc_file', 'software', 'version'] # Added software and version as per potential future needs, can be restricted per endpoint.

# --- Helper function to check if an item exists in its respective table ---
def check_item_exists(db, item_type, item_id):
    """Checks if an item exists in its respective table."""
    if item_type == 'document':
        return db.execute("SELECT 1 FROM documents WHERE id = ?", (item_id,)).fetchone()
    elif item_type == 'patch':
        return db.execute("SELECT 1 FROM patches WHERE id = ?", (item_id,)).fetchone()
    elif item_type == 'link':
        return db.execute("SELECT 1 FROM links WHERE id = ?", (item_id,)).fetchone()
    elif item_type == 'misc_file':
        return db.execute("SELECT 1 FROM misc_files WHERE id = ?", (item_id,)).fetchone()
    elif item_type == 'software': # Added for future commentability
        return db.execute("SELECT 1 FROM software WHERE id = ?", (item_id,)).fetchone()
    elif item_type == 'version': # Added for future commentability
        return db.execute("SELECT 1 FROM versions WHERE id = ?", (item_id,)).fetchone()
    return None

# --- Bulk Action Endpoints ---

@app.route('/api/bulk/delete', methods=['POST'])
@jwt_required()
@admin_required
def bulk_delete_items():
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    item_ids = data.get('item_ids')
    item_type = data.get('item_type')

    if not isinstance(item_ids, list) or not item_ids or not all(isinstance(i, int) and i > 0 for i in item_ids):
        return jsonify(msg="item_ids must be a non-empty list of positive integers."), 400
    if not item_type or item_type not in ALLOWED_BULK_ITEM_TYPES:
        return jsonify(msg=f"item_type is required and must be one of: {', '.join(ALLOWED_BULK_ITEM_TYPES)}."), 400

    current_user_id = int(get_jwt_identity())
    db = get_db()

    item_type_map = {
        'document': {
            'table': 'documents', 'id_col': 'id', 'name_col': 'doc_name', 
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link',
            'folder_config': 'DOC_UPLOAD_FOLDER', 'log_action': 'BULK_DELETE_DOCUMENT_ITEM'
        },
        'patch': {
            'table': 'patches', 'id_col': 'id', 'name_col': 'patch_name',
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link',
            'folder_config': 'PATCH_UPLOAD_FOLDER', 'log_action': 'BULK_DELETE_PATCH_ITEM'
        },
        'link': {
            'table': 'links', 'id_col': 'id', 'name_col': 'title',
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link', # True for external URLs, False for uploaded files via links
            'folder_config': 'LINK_UPLOAD_FOLDER', 'log_action': 'BULK_DELETE_LINK_ITEM'
        },
        'misc_file': {
            'table': 'misc_files', 'id_col': 'id', 'name_col': 'user_provided_title', # or original_filename
            'filename_col': 'stored_filename', 'is_external_col': None, # Misc files are always physical
            'folder_config': 'MISC_UPLOAD_FOLDER', 'log_action': 'BULK_DELETE_MISC_FILE_ITEM'
        }
    }

    if item_type not in item_type_map: # Should be caught by ALLOWED_BULK_ITEM_TYPES, but good practice
        return jsonify(msg=f"Invalid item_type '{item_type}' for bulk delete."), 400

    config = item_type_map[item_type]
    success_count = 0
    failed_ids = []
    processed_ids_details = [] # For logging individual successes or failures

    db.execute("BEGIN") # Start transaction

    try:
        for item_id in item_ids:
            item_query = f"SELECT {config['name_col']} AS name, {config['filename_col']} AS filename"
            if config['is_external_col']:
                item_query += f", {config['is_external_col']} AS is_external"
            item_query += f" FROM {config['table']} WHERE {config['id_col']} = ?"
            
            item = db.execute(item_query, (item_id,)).fetchone()

            if not item:
                failed_ids.append(item_id)
                processed_ids_details.append({'id': item_id, 'status': 'not_found'})
                continue

            item_name = item['name']
            stored_filename = item['filename']
            is_external = item['is_external'] if config['is_external_col'] and 'is_external' in item.keys() else False

            file_deleted_successfully = True # Assume true for external links or items without files
            if stored_filename and (config['is_external_col'] is None or not is_external) : # Physical file exists
                file_path = os.path.join(app.config[config['folder_config']], stored_filename)
                if not _delete_file_if_exists(file_path):
                    app.logger.warning(f"Bulk delete: Failed to delete physical file {file_path} for {item_type} ID {item_id}.")
                    # Depending on policy, you might add this to failed_ids or just log.
                    # For now, we'll proceed to delete DB record even if file deletion fails, but log it.
                    file_deleted_successfully = False # Log this, but don't necessarily fail the DB delete for it

            # Delete DB record
            delete_cursor = db.execute(f"DELETE FROM {config['table']} WHERE {config['id_col']} = ?", (item_id,))
            
            if delete_cursor.rowcount > 0:
                success_count += 1
                processed_ids_details.append({'id': item_id, 'name': item_name, 'status': 'deleted', 'file_deleted': file_deleted_successfully})
                log_audit_action(
                    action_type=config['log_action'],
                    target_table=config['table'],
                    target_id=item_id,
                    details={'deleted_item_name': item_name, 'bulk_operation_id': request.headers.get('X-Request-ID', 'N/A'), 'file_deleted': file_deleted_successfully}
                )
            else:
                # This case should be rare if item was fetched successfully above, but handle it.
                failed_ids.append(item_id)
                processed_ids_details.append({'id': item_id, 'name': item_name, 'status': 'delete_failed_db'})
                app.logger.error(f"Bulk delete: DB delete command affected 0 rows for {item_type} ID {item_id} which was previously fetched.")
        
        if not failed_ids: # All items processed successfully (or file deletion failed but DB delete succeeded)
            db.commit()
            msg = f"Successfully deleted {success_count} {item_type}(s)."
            if success_count != len(item_ids): # Some items were not found initially
                 msg += f" ({len(item_ids) - success_count} items not found or failed to delete)."
        else:
            db.rollback()
            msg = f"Bulk delete for {item_type} failed for {len(failed_ids)} IDs: {', '.join(map(str, failed_ids))}. No items were deleted."
            # If we want partial success, the commit would be outside this else, and message adjusted.
            # For now, full rollback on any DB delete failure for an item that was found.
            # Items not found initially don't cause a rollback if others succeed.

        log_audit_action(
            action_type='BULK_DELETE_COMPLETE',
            details={
                'item_type': item_type, 
                'requested_count': len(item_ids),
                'deleted_count': success_count, 
                'failed_ids': failed_ids,
                'processed_details': processed_ids_details # Provides status for each item
            }
        )
        return jsonify(msg=msg, deleted_count=success_count, failed_ids=failed_ids), 200 if not failed_ids or success_count > 0 else 400

    except Exception as e:
        db.rollback()
        app.logger.error(f"Exception during bulk delete for {item_type}: {e}", exc_info=True)
        log_audit_action(
            action_type='BULK_DELETE_FAILED',
            details={'item_type': item_type, 'error': str(e), 'item_ids_requested': item_ids}
        )
        return jsonify(msg=f"An error occurred during bulk delete: {str(e)}"), 500

@app.route('/api/bulk/download', methods=['POST'])
@jwt_required()
def bulk_download_items():
    data = request.get_json()
    if not data:
        return jsonify(msg="Missing JSON data"), 400

    item_ids = data.get('item_ids')
    item_type = data.get('item_type')

    if not isinstance(item_ids, list) or not item_ids or not all(isinstance(i, int) and i > 0 for i in item_ids):
        return jsonify(msg="item_ids must be a non-empty list of positive integers."), 400
    if not item_type or item_type not in ALLOWED_BULK_ITEM_TYPES:
        return jsonify(msg=f"item_type is required and must be one of: {', '.join(ALLOWED_BULK_ITEM_TYPES)}."), 400

    current_user_id = int(get_jwt_identity()) # For logging, though _log_download_activity handles user from JWT
    db = get_db()

    item_type_map = {
        'document': {
            'table': 'documents', 'id_col': 'id', 'name_col': 'doc_name', 
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link',
            'folder_config': 'DOC_UPLOAD_FOLDER', 'original_ref_col': 'original_filename_ref'
        },
        'patch': {
            'table': 'patches', 'id_col': 'id', 'name_col': 'patch_name',
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link',
            'folder_config': 'PATCH_UPLOAD_FOLDER', 'original_ref_col': 'original_filename_ref'
        },
        'link': { # Only uploaded files associated with links are downloadable in bulk
            'table': 'links', 'id_col': 'id', 'name_col': 'title',
            'filename_col': 'stored_filename', 'is_external_col': 'is_external_link',
            'folder_config': 'LINK_UPLOAD_FOLDER', 'original_ref_col': 'original_filename_ref'
        },
        'misc_file': {
            'table': 'misc_files', 'id_col': 'id', 'name_col': 'user_provided_title', 
            'filename_col': 'stored_filename', 'is_external_col': None, # Misc files are always physical
            'folder_config': 'MISC_UPLOAD_FOLDER', 'original_ref_col': 'original_filename'
        }
    }

    if item_type not in item_type_map:
        return jsonify(msg=f"Invalid item_type '{item_type}' for bulk download."), 400

    config = item_type_map[item_type]
    files_to_zip_details = []
    errors_details = [] # To store details about why certain items couldn't be added

    for item_id in item_ids:
        # Fetch item details including original filename for use in zip
        query_fields = f"{config['id_col']} AS id, {config['name_col']} AS name, {config['filename_col']} AS stored_filename, {config['original_ref_col']} AS original_name_ref"
        if config['is_external_col']:
            query_fields += f", {config['is_external_col']} AS is_external"
        
        item_query = f"SELECT {query_fields} FROM {config['table']} WHERE {config['id_col']} = ?"
        item = db.execute(item_query, (item_id,)).fetchone()

        if not item:
            errors_details.append({'id': item_id, 'error': 'not_found'})
            continue

        is_external = item['is_external'] if config['is_external_col'] and 'is_external' in item.keys() else False
        if is_external:
            errors_details.append({'id': item_id, 'name': item['name'], 'error': 'is_external_link'})
            continue

        stored_filename = item['stored_filename']
        if not stored_filename:
            errors_details.append({'id': item_id, 'name': item['name'], 'error': 'no_stored_file'})
            continue

        file_path = os.path.join(app.config[config['folder_config']], stored_filename)
        if not os.path.exists(file_path):
            errors_details.append({'id': item_id, 'name': item['name'], 'error': 'file_not_found_on_disk', 'path_checked': file_path})
            app.logger.warning(f"Bulk download: File {file_path} for {item_type} ID {item_id} not found on disk.")
            continue
        
        # Use original filename if available and sensible, otherwise use stored_filename or ID-based name
        name_in_zip = item['original_name_ref'] or stored_filename
        # Sanitize name_in_zip further if needed, or ensure uniqueness if multiple items have same original_name_ref
        # For now, direct use. Could add item_id prefix for guaranteed uniqueness: f"{item_id}_{name_in_zip}"
        
        files_to_zip_details.append({'path': file_path, 'name_in_zip': name_in_zip, 'item_id': item_id, 'item_name': item['name']})
        
        # Log individual download attempt (actual logging happens when file is served, but good to note here)
        # _log_download_activity is typically called by the serving endpoint.
        # For bulk, we might log a single "BULK_DOWNLOAD_PACKAGE_CREATED" and list contents.
        # Or, if _log_download_activity is called per file, ensure it happens before sending.
        # For now, deferring specific logging of individual files until after zip creation and before sending.

    if not files_to_zip_details:
        log_audit_action(action_type='BULK_DOWNLOAD_NO_FILES', details={'item_type': item_type, 'requested_ids': item_ids, 'errors': errors_details})
        return jsonify(msg="No files found or eligible for download based on selection.", errors=errors_details), 404

    zip_filepath = None # Initialize to ensure it's defined in the finally/except block
    try:
        # Create a temporary file for the zip archive
        with NamedTemporaryFile(suffix=".zip", delete=False) as tmp_zip_file:
            zip_filepath = tmp_zip_file.name
        # tmp_zip_file is now closed, but the file still exists at zip_filepath
        # We will open it again using zipfile.ZipFile

        zip_filename_base = f"bulk_download_{item_type}_{datetime.now().strftime('%Y%m%d%H%M%S')}.zip"

        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_detail in files_to_zip_details:
                zf.write(file_detail['path'], arcname=file_detail['name_in_zip'])

        # Log successful creation
        log_audit_action(
            action_type='BULK_DOWNLOAD_CREATED',
            details={
                'item_type': item_type,
                'zip_filename': zip_filename_base,
                'file_count': len(files_to_zip_details),
                'requested_ids_count': len(item_ids),
                'files_included': [{'id': fd['item_id'], 'name': fd['item_name'], 'zipped_as': fd['name_in_zip']} for fd in files_to_zip_details],
                'errors_encountered': errors_details if errors_details else None
            }
        )

        @after_this_request
        def cleanup_zip(response):
            try:
                # Attempt to explicitly close the file stream if response.response is a file wrapper
                # This is to help release any lock held by the response stream, especially on Windows.
                if hasattr(response, 'response') and hasattr(response.response, 'close') and callable(response.response.close):
                    try:
                        response.response.close()
                        app.logger.info(f"Cleanup_zip: Explicitly closed response.response for {zip_filepath}")
                    except Exception as e_resp_close:
                        # Log warning if closing the response stream fails, but don't let it stop cleanup.
                        app.logger.warning(f"Cleanup_zip: Error closing response.response for {zip_filepath}: {e_resp_close}")

                if zip_filepath and os.path.exists(zip_filepath):
                    os.remove(zip_filepath)
                    app.logger.info(f"Successfully cleaned up temporary zip file: {zip_filepath}")
            except PermissionError as e_perm: # Catch PermissionError specifically for more targeted logging
                app.logger.error(f"PermissionError cleaning up temporary zip file {zip_filepath}: {e_perm}. This is often a timing issue on Windows. The file may be cleaned up later or require manual deletion.", exc_info=True)
            except Exception as e_cleanup: # Catch other potential exceptions during cleanup
                app.logger.error(f"Error cleaning up temporary zip file {zip_filepath}: {e_cleanup}", exc_info=True)
            return response

        return send_file(zip_filepath, as_attachment=True, download_name=zip_filename_base)

    except Exception as e:
        app.logger.error(f"Error during bulk download zip creation or sending for {item_type}: {e}", exc_info=True)
        if zip_filepath and os.path.exists(zip_filepath): # Attempt to cleanup partially created file on error
            try:
                os.remove(zip_filepath)
                app.logger.info(f"Cleaned up temporary zip file on error: {zip_filepath}")
            except Exception as e_cleanup_error:
                app.logger.error(f"Error cleaning up temporary zip file {zip_filepath} on error: {e_cleanup_error}", exc_info=True)
        
        log_audit_action(
            action_type='BULK_DOWNLOAD_FAILED',
            details={'item_type': item_type, 'error': str(e), 'item_ids_requested': item_ids, 'files_prepared_count': len(files_to_zip_details)}
        )
        return jsonify(msg=f"Failed to create or send bulk download archive: {str(e)}"), 500



@app.route('/api/bulk/move', methods=['POST'])
@jwt_required()
@admin_required
def bulk_move_items():
    data = request.get_json()
    if not data:
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Missing JSON data'")
        return jsonify(msg="Missing JSON data"), 400

    item_ids = data.get('item_ids')
    item_type = data.get('item_type')
    target_metadata = data.get('target_metadata')

    app.logger.debug(f"bulk_move_items: Received item_ids={item_ids}, item_type='{item_type}', target_metadata={target_metadata}")

    if not isinstance(item_ids, list) or not item_ids or not all(isinstance(i, int) and i > 0 for i in item_ids):
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='item_ids must be a non-empty list of positive integers.'")
        return jsonify(msg="item_ids must be a non-empty list of positive integers."), 400
    if not item_type or item_type not in ALLOWED_BULK_ITEM_TYPES:
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='item_type is required and must be one of: {', '.join(ALLOWED_BULK_ITEM_TYPES)}.'")
        return jsonify(msg=f"item_type is required and must be one of: {', '.join(ALLOWED_BULK_ITEM_TYPES)}."), 400
    if not isinstance(target_metadata, dict):
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='target_metadata (object) is required.'")
        return jsonify(msg="target_metadata (object) is required."), 400

    current_user_id = int(get_jwt_identity())
    db = get_db()

    item_type_config_map = {
        'document': {
            'table': 'documents', 'id_col': 'id', 'name_col': 'doc_name',
            'fk_map': {'target_software_id': 'software_id'},
            'required_targets': ['target_software_id'],
            'target_validations': {
                'target_software_id': {'table': 'software', 'col': 'id'}
            },
            'log_action': 'BULK_MOVE_DOCUMENT_ITEM'
        },
        'patch': {
            'table': 'patches', 'id_col': 'id', 'name_col': 'patch_name',
            'fk_map': {'target_version_id': 'version_id'},
            'required_targets': ['target_version_id'],
            'target_validations': {
                'target_version_id': {'table': 'versions', 'col': 'id'}
            },
            'log_action': 'BULK_MOVE_PATCH_ITEM'
        },
        'link': {
            'table': 'links', 'id_col': 'id', 'name_col': 'title',
            'fk_map': {'target_software_id': 'software_id', 'target_version_id': 'version_id'},
            'required_targets': ['target_software_id'], # version_id is optional for links (can be NULL)
            'target_validations': {
                'target_software_id': {'table': 'software', 'col': 'id'},
                'target_version_id': {'table': 'versions', 'col': 'id', 'optional': True} # Validate if provided
            },
            'log_action': 'BULK_MOVE_LINK_ITEM'
        },
        'misc_file': {
            'table': 'misc_files', 'id_col': 'id', 'name_col': 'user_provided_title',
            'fk_map': {'target_misc_category_id': 'misc_category_id'},
            'required_targets': ['target_misc_category_id'],
            'target_validations': {
                'target_misc_category_id': {'table': 'misc_categories', 'col': 'id'}
            },
            'log_action': 'BULK_MOVE_MISC_FILE_ITEM'
        }
    }

    if item_type not in item_type_config_map:
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Invalid item_type '{item_type}' for bulk move.'")
        return jsonify(msg=f"Invalid item_type '{item_type}' for bulk move."), 400

    config = item_type_config_map[item_type]
    app.logger.debug(f"bulk_move_items: Using config={config}")
    
    # Validate presence of required target_metadata fields
    for req_target in config['required_targets']:
        if req_target not in target_metadata or target_metadata[req_target] is None: # Ensure it's not None if required
            app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Missing required target_metadata field for {item_type}: {req_target}'")
            return jsonify(msg=f"Missing required target_metadata field for {item_type}: {req_target}"), 400
        try:
            # Ensure required target IDs are positive integers
            if not (isinstance(target_metadata[req_target], int) and target_metadata[req_target] > 0):
                 app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Invalid value for {req_target}. Must be a positive integer.'")
                 return jsonify(msg=f"Invalid value for {req_target}. Must be a positive integer."), 400
        except Exception: # Broad exception for type issues if not int
            app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Invalid type for {req_target}. Must be an integer.'")
            return jsonify(msg=f"Invalid type for {req_target}. Must be an integer."), 400


    # Validate existence of target IDs in the database
    valid_targets = {}
    for target_key, target_val_details in config['target_validations'].items():
        target_id_value = target_metadata.get(target_key)
        is_optional = target_val_details.get('optional', False)

        if target_id_value is not None: # If a value is provided (even for optional fields)
            if not (isinstance(target_id_value, int) and target_id_value > 0):
                 app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Invalid value for {target_key}. Must be a positive integer if provided.'")
                 return jsonify(msg=f"Invalid value for {target_key}. Must be a positive integer if provided."), 400
            
            target_exists_query = f"SELECT 1 FROM {target_val_details['table']} WHERE {target_val_details['col']} = ?"
            if not db.execute(target_exists_query, (target_id_value,)).fetchone():
                app.logger.debug(f"bulk_move_items: Returning error status=404, msg='Target {target_val_details['table']} with ID {target_id_value} for {target_key} not found.'")
                return jsonify(msg=f"Target {target_val_details['table']} with ID {target_id_value} for {target_key} not found."), 404
            valid_targets[config['fk_map'][target_key]] = target_id_value # Store actual DB column name and value
        elif not is_optional and target_key in config['required_targets']: # Should have been caught above, but double check
             app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Required target_metadata field {target_key} is missing or null.'")
             return jsonify(msg=f"Required target_metadata field {target_key} is missing or null."), 400
        elif is_optional: # If optional and not provided, set to NULL for update
            valid_targets[config['fk_map'][target_key]] = None

    app.logger.debug(f"bulk_move_items: Validated targets: {valid_targets}")

    if not valid_targets: # No valid FKs to update based on input
        app.logger.debug(f"bulk_move_items: Returning error status=400, msg='No valid target metadata provided for update.'")
        return jsonify(msg="No valid target metadata provided for update."), 400

    # Special validation for 'link' type: if target_version_id is provided, it must belong to target_software_id
    if item_type == 'link' and valid_targets.get('version_id') is not None:
        target_software_id_for_link = valid_targets.get('software_id') # This must be present for links
        target_version_id_for_link = valid_targets['version_id']
        
        if not target_software_id_for_link: # Should be caught by required_targets but good check
            app.logger.debug(f"bulk_move_items: Returning error status=400, msg='target_software_id is required when target_version_id is specified for a link.'")
            return jsonify(msg="target_software_id is required when target_version_id is specified for a link."), 400

        version_belongs_to_software = db.execute(
            "SELECT 1 FROM versions WHERE id = ? AND software_id = ?",
            (target_version_id_for_link, target_software_id_for_link)
        ).fetchone()
        if not version_belongs_to_software:
            app.logger.debug(f"bulk_move_items: Returning error status=400, msg='Target version ID {target_version_id_for_link} does not belong to target software ID {target_software_id_for_link}.'")
            return jsonify(msg=f"Target version ID {target_version_id_for_link} does not belong to target software ID {target_software_id_for_link}."), 400
    
    # Special validation for 'patch' type: target_version_id implies a specific software_id.
    # The UI should handle this, but good to be aware. We only update version_id directly.

    success_count = 0
    failed_items_details = [] # Store {id, error_reason}
    conflicted_items = [] # Added to store items with conflicts
    processed_ids_audit_details = []

    db.execute("BEGIN")
    try:
        for item_id in item_ids:
            # Fetch old item details for logging
            old_item_details_query = f"SELECT * FROM {config['table']} WHERE {config['id_col']} = ?"
            old_item = db.execute(old_item_details_query, (item_id,)).fetchone()

            if not old_item:
                failed_items_details.append({'id': item_id, 'error': 'not_found'})
                app.logger.debug(f"bulk_move_items: Item ID {item_id} not found in table {config['table']}.")
                processed_ids_audit_details.append({'id': item_id, 'status': 'not_found'})
                continue
            
            old_associations = {db_col: old_item[db_col] for db_col in valid_targets.keys()}
            app.logger.debug(f"bulk_move_items: Processing item_id={item_id}, old_item_name='{old_item[config['name_col']]}', current_fks={old_associations}, is_external={(old_item['is_external_link'] if 'is_external_link' in old_item else 'N/A')})")

            # Conflict check for patches
            if item_type == 'patch':
                target_version_id = valid_targets.get('version_id')
                patch_name_to_check = old_item['patch_name']
                if target_version_id is not None and patch_name_to_check:
                    app.logger.debug(f"bulk_move_items: Conflict check for patch_id={item_id}, name='{patch_name_to_check}', target_version_id={target_version_id}")
                    conflict_query = "SELECT 1 FROM patches WHERE version_id = ? AND patch_name = ? AND id != ?"
                    # Exclude the current patch being moved from the conflict check if it's already in the target version (though this logic is for moving to a *different* version)
                    existing_patch_in_target = db.execute(conflict_query, (target_version_id, patch_name_to_check, item_id)).fetchone()
                    app.logger.debug(f"bulk_move_items: Conflict found for patch_id={item_id}: {bool(existing_patch_in_target)}")
                    if existing_patch_in_target:
                        conflicted_items.append({'id': item_id, 'name': patch_name_to_check})
                        processed_ids_audit_details.append({'id': item_id, 'status': 'conflict', 'name': patch_name_to_check, 'target_version_id': target_version_id})
                        continue # Skip this item

            set_clauses = []
            update_params = []
            for db_col, new_val in valid_targets.items():
                set_clauses.append(f"{db_col} = ?")
                update_params.append(new_val)
            
            set_clauses.append("updated_by_user_id = ?")
            update_params.append(current_user_id)
            set_clauses.append("updated_at = CURRENT_TIMESTAMP")

            update_query = f"UPDATE {config['table']} SET {', '.join(set_clauses)} WHERE {config['id_col']} = ?"
            update_params.append(item_id)

            app.logger.debug(f"bulk_move_items: Attempting to update item_id={item_id} with params: {valid_targets}")
            update_cursor = db.execute(update_query, tuple(update_params))

            if update_cursor.rowcount > 0:
                success_count += 1
                processed_ids_audit_details.append({
                    'id': item_id, 'status': 'moved', 
                    'old_associations': old_associations, 
                    'new_associations': valid_targets
                })
                log_audit_action(
                    action_type=config['log_action'],
                    target_table=config['table'],
                    target_id=item_id,
                    details={
                        'item_name': old_item[config['name_col']],
                        'old_associations': old_associations,
                        'new_associations': valid_targets,
                        'bulk_operation_id': request.headers.get('X-Request-ID', 'N/A')
                    }
                )
            else:
                # Should not happen if item was found, unless DB error or concurrent modification
                failed_items_details.append({'id': item_id, 'error': 'update_failed_in_db'})
                processed_ids_audit_details.append({'id': item_id, 'status': 'db_update_failed'})
                app.logger.error(f"Bulk move: DB update command affected 0 rows for {item_type} ID {item_id}.")

        # Refined message logic
        if success_count == 0 and len(conflicted_items) > 0 and len(failed_items_details) == 0:
            # Scenario 1: All items conflicted
            if item_type == 'patch':
                msg = "Bulk move failed: All selected patches conflict with existing patch names in the target version."
            else:
                msg = f"Bulk move failed: All selected {item_type} items conflict with existing names in the target location."
            db.rollback() # Ensure rollback if all conflicted and no other failures
        elif success_count > 0 and len(conflicted_items) > 0:
            # Scenario 2: Partial success with some conflicts
            if item_type == 'patch':
                 msg = f"Bulk move partially successful. {success_count} patch(es) moved. {len(conflicted_items)} patch(es) were not moved due to naming conflicts in the target version."
            else:
                 msg = f"Bulk move partially successful. {success_count} {item_type}(s) moved. {len(conflicted_items)} {item_type}(s) were not moved due to naming conflicts in the target location."
            db.commit() # Commit successful moves
        elif success_count == 0 and len(conflicted_items) == 0 and len(failed_items_details) > 0:
            # Scenario 3 & 5: All items failed for reasons other than conflict OR all not found
            all_not_found = all(item.get('error') == 'not_found' for item in failed_items_details)
            if all_not_found and len(failed_items_details) == len(item_ids):
                msg = f"Bulk move failed: None of the selected {item_type} items could be found."
            else:
                msg = f"Bulk move failed: {len(failed_items_details)} {item_type}(s) could not be processed (e.g., not found or database error). No items were moved."
            db.rollback() # Rollback as no items were successfully processed
        elif success_count == 0 and len(conflicted_items) > 0 and len(failed_items_details) > 0:
            # Scenario 4: Mixed failures (conflicts and other errors) with no successes
            msg = f"Bulk move failed: {len(failed_items_details)} {item_type}(s) could not be processed, and {len(conflicted_items)} {item_type}(s) conflict with existing names. No items were moved."
            db.rollback() # Rollback due to failures
        elif success_count > 0 and len(conflicted_items) == 0 and len(failed_items_details) == 0:
            # All successful, no conflicts, no other failures
            msg = f"Successfully moved {success_count} {item_type}(s)."
            db.commit()
        else: # Default catch-all, should ideally be covered by above, or represents mixed success/failures not fully captured yet
            # This handles cases like: some success, some not_found, no conflicts.
            # Or some success, some db_update_failures (which would lead to rollback if db_update_failures > 0).
            db_update_failures = sum(1 for detail in processed_ids_audit_details if detail['status'] == 'db_update_failed')
            if db_update_failures > 0:
                db.rollback()
                msg = f"Bulk move for {item_type} failed for {db_update_failures} items due to database update issues. No items were moved."
                success_count = 0 # Reset success_count as all changes are rolled back
            else: # Only "not_found" errors or other non-DB-update failures among failed_items_details, with some successes and no conflicts
                db.commit() # Commit successes
                msg = f"Successfully moved {success_count} {item_type}(s)."
                if len(failed_items_details) > 0:
                    msg += f" {len(failed_items_details)} item(s) could not be processed (e.g., not found)."

        log_audit_action(
            action_type='BULK_MOVE_COMPLETE',
            details={
                'item_type': item_type,
                'requested_count': len(item_ids),
                'moved_count': success_count,
                'conflicted_count': len(conflicted_items),
                'conflicted_items_details': conflicted_items,
                'target_metadata_applied': valid_targets, # Log what was applied
                'processed_details': processed_ids_audit_details
            }
        )
        
        # Determine overall status code
        status_code = 200
        # if success_count == 0 and len(item_ids) > 0 and not conflicted_items: # No items moved at all, and no conflicts (e.g. all not found or all failed DB update)
        #     status_code = 400 
        if success_count < (len(item_ids) - len(conflicted_items)): # Partial success (excluding conflicts as they are handled separately)
            status_code = 207 # Multi-Status
        elif success_count == 0 and len(item_ids) > 0 : # No items moved at all
            status_code = 400 # if all were not found or failed db update. If all were conflicts, conflicted_items would exist.
        
        response_payload = {
            "msg": msg, 
            "moved_count": success_count, 
            "failed_items": failed_items_details, # Items that failed for reasons other than conflict (e.g. not found, db update error)
            "conflicted_items": conflicted_items # Items that specifically failed due to name conflict
        }
        app.logger.debug(f"bulk_move_items: Returning status={status_code}, payload={response_payload}")
        return jsonify(response_payload), status_code

    except Exception as e:
        db.rollback()
        app.logger.error(f"Exception during bulk move for {item_type}: {e}", exc_info=True)
        # Log before returning error
        error_payload = {'item_type': item_type, 'error': str(e), 'item_ids_requested': item_ids, 'target_metadata': target_metadata}
        app.logger.debug(f"bulk_move_items: Returning error status=500, payload={error_payload}")
        log_audit_action(
            action_type='BULK_MOVE_FAILED',
            details=error_payload
        )
        return jsonify(msg=f"An error occurred during bulk move: {str(e)}"), 500

# --- Comment Endpoints ---
@app.route('/api/items/<item_type>/<int:item_id>/comments', methods=['POST'])
@jwt_required()
def add_comment_to_item(item_type, item_id):
    current_user_id_str = get_jwt_identity()
    comment_author_username = "Unknown" 
    try:
        user_id = int(current_user_id_str)
        commenting_user = find_user_by_id(user_id)
        if commenting_user:
            comment_author_username = commenting_user['username']
        else: # Should not happen if JWT is valid and user exists
            app.logger.error(f"ADD_COMMENT: User ID {user_id} from JWT not found in DB.")
            return jsonify(msg="Commenting user not found."), 404
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    if item_type not in ALLOWED_COMMENT_ITEM_TYPES:
        return jsonify(msg=f"Invalid item_type. Allowed types: {', '.join(ALLOWED_COMMENT_ITEM_TYPES)}."), 400

    db = get_db()
    if not check_item_exists(db, item_type, item_id):
        return jsonify(msg=f"{item_type.capitalize()} with ID {item_id} not found."), 404

    data = request.get_json()
    if not data or not data.get('content') or not data.get('content').strip():
        return jsonify(msg="Comment content is required and cannot be empty."), 400
    
    content = data['content'].strip()
    parent_comment_id = data.get('parent_comment_id')
    parent_comment_author_id = None

    if parent_comment_id is not None:
        if not isinstance(parent_comment_id, int) or parent_comment_id <= 0:
            return jsonify(msg="parent_comment_id must be a positive integer if provided."), 400
        parent_comment = database.get_comment_by_id(db, parent_comment_id)
        if not parent_comment:
            return jsonify(msg=f"Parent comment with ID {parent_comment_id} not found."), 400
        if parent_comment['item_id'] != item_id or parent_comment['item_type'] != item_type:
            return jsonify(msg="Parent comment does not belong to the same item."), 400
        parent_comment_author_id = parent_comment['user_id']


    try:
        comment_id = database.add_comment(db, user_id, item_id, item_type, content, parent_comment_id)
        if comment_id:
            log_audit_action(
                action_type='ADD_COMMENT',
                target_table='comments',
                target_id=comment_id,
                details={'item_type': item_type, 'item_id': item_id, 'parent_comment_id': parent_comment_id, 'content_length': len(content)}
            )
            
            # --- Notification Logic ---
            item_name_for_notification = _get_item_name_for_notification(db, item_type, item_id)

            # Reply Notification
            if parent_comment_author_id and parent_comment_author_id != user_id:
                try:
                    database.create_notification(
                        db,
                        user_id=parent_comment_author_id,
                        type='reply',
                        message=f"{comment_author_username} replied to your comment on {item_type} '{item_name_for_notification}'.",
                        item_id=comment_id, 
                        item_type='comment' 
                    )
                    app.logger.info(f"Reply notification created for user {parent_comment_author_id} for comment {comment_id}")
                except Exception as e_notify_reply:
                    app.logger.error(f"Failed to create reply notification: {e_notify_reply}")

            # Mention Notification
            mentioned_usernames = set(re.findall(r'@(\w+)', content))
            if mentioned_usernames: 
                app.logger.info(f"Potential mentions found: {mentioned_usernames}")
            for mentioned_username_match in mentioned_usernames:
                
                if mentioned_username_match.lower() == comment_author_username.lower(): 
                    app.logger.info(f"Skipping self-mention for {comment_author_username}")
                    continue
                
                mentioned_user = find_user_by_username(mentioned_username_match) 
                
                if mentioned_user and mentioned_user['is_active'] and mentioned_user['id'] != user_id:
                    try:
                        database.create_notification(
                            db,
                            user_id=mentioned_user['id'],
                            type='mention',
                            message=f"{comment_author_username} mentioned you in a comment on {item_type} '{item_name_for_notification}'.",
                            item_id=comment_id, 
                            item_type='comment'
                        )
                        app.logger.info(f"Mention notification created for user {mentioned_user['id']} (username: {mentioned_username_match}) for comment {comment_id}")
                    except Exception as e_notify_mention:
                        app.logger.error(f"Failed to create mention notification for @{mentioned_username_match}: {e_notify_mention}")
                elif mentioned_user:
                     app.logger.info(f"Skipping mention notification for @{mentioned_username_match} (inactive or self). User active: {mentioned_user['is_active']}, User ID: {mentioned_user['id']}, Current User ID: {user_id}")
                else:
                    app.logger.info(f"Mentioned username @{mentioned_username_match} not found or invalid.")

            # --- End Notification Logic ---

            new_comment_raw = database.get_comment_by_id(db, comment_id)
            if new_comment_raw:
                processed_comment = convert_timestamps_to_ist_iso(dict(new_comment_raw), ['created_at', 'updated_at'])
                return jsonify(processed_comment), 201
            else:
                app.logger.error(f"Failed to retrieve comment {comment_id} after creation.")
                return jsonify(msg="Comment created but failed to retrieve details."), 500
        else:
            return jsonify(msg="Failed to add comment due to a database error."), 500
    except Exception as e:
        app.logger.error(f"Error adding comment to {item_type} ID {item_id}: {e}", exc_info=True)
        return jsonify(msg="An unexpected server error occurred while adding comment."), 500

def _get_item_name_for_notification(db, item_type, item_id):
    """Helper to get a display name for an item for notification messages."""
    name = f"item (ID: {item_id})" # Default
    query = None
    if item_type == 'document': query = "SELECT doc_name as name FROM documents WHERE id = ?"
    elif item_type == 'patch': query = "SELECT patch_name as name FROM patches WHERE id = ?"
    elif item_type == 'link': query = "SELECT title as name FROM links WHERE id = ?"
    elif item_type == 'misc_file': query = "SELECT COALESCE(user_provided_title, original_filename) as name FROM misc_files WHERE id = ?"
    elif item_type == 'software': query = "SELECT name FROM software WHERE id = ?"
    elif item_type == 'version': query = "SELECT version_number as name FROM versions WHERE id = ?"
    elif item_type == 'comment': 
        comment_for_name = database.get_comment_by_id(db, item_id)
        if comment_for_name:
            return _get_item_name_for_notification(db, comment_for_name['item_type'], comment_for_name['item_id'])
        else: 
            return f"a deleted comment (ID: {item_id})"
    
    if query:
        try:
            row = db.execute(query, (item_id,)).fetchone()
            if row and row['name']:
                name = row['name']
        except Exception as e:
            app.logger.error(f"Error fetching item name for notification ({item_type} ID {item_id}): {e}")
    return name

@app.route('/api/items/<item_type>/<int:item_id>/comments', methods=['GET'])
@jwt_required(optional=True) # Allow anonymous access, JWT enhances if present
def get_comments_for_item_api(item_type, item_id):
    if item_type not in ALLOWED_COMMENT_ITEM_TYPES:
        return jsonify(msg=f"Invalid item_type. Allowed types: {', '.join(ALLOWED_COMMENT_ITEM_TYPES)}."), 400

    db = get_db()
    if not check_item_exists(db, item_type, item_id):
        return jsonify(msg=f"{item_type.capitalize()} with ID {item_id} not found."), 404

    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=20, type=int)
    if page <= 0: page = 1
    if per_page <= 0: per_page = 20
    if per_page > 100: per_page = 100 # Max limit

    try:
        # database.get_comments_for_item should return a dict with 'comments' list and pagination fields
        comments_data_raw = database.get_comments_for_item(db, item_id, item_type, page, per_page)

        # Process timestamps within the 'comments' list of the returned dict
        if 'comments' in comments_data_raw:
            ts_keys_comments = ['created_at', 'updated_at']
            processed_comments_list = []
            for comment_dict in comments_data_raw['comments']: # comment_dict is already a dict
                # Recursively process replies if they exist
                if 'replies' in comment_dict and isinstance(comment_dict['replies'], list):
                    processed_replies = [convert_timestamps_to_ist_iso(reply, ts_keys_comments) for reply in comment_dict['replies']]
                    comment_dict['replies'] = processed_replies
                processed_comments_list.append(convert_timestamps_to_ist_iso(comment_dict, ts_keys_comments))
            comments_data_raw['comments'] = processed_comments_list
        
        return jsonify(comments_data_raw), 200
        
    except Exception as e:
        app.logger.error(f"Error fetching comments for {item_type} ID {item_id}: {e}", exc_info=True)
        return jsonify(msg="An unexpected server error occurred while fetching comments."), 500

@app.route('/api/comments/<int:comment_id>', methods=['PUT'])
@jwt_required()
def update_comment_api(comment_id):
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    data = request.get_json()
    if not data or not data.get('content') or not data.get('content').strip():
        return jsonify(msg="Comment content is required and cannot be empty."), 400
    
    new_content = data['content'].strip()
    db = get_db()

    # Fetch comment to check existence and for logging old content
    existing_comment = database.get_comment_by_id(db, comment_id)
    if not existing_comment:
        return jsonify(msg=f"Comment with ID {comment_id} not found."), 404

    # The database.update_comment_content function handles ownership check
    updated = database.update_comment_content(db, comment_id, user_id, new_content)

    if updated:
        log_audit_action(
            action_type='UPDATE_COMMENT',
            target_table='comments',
            target_id=comment_id,
            details={'item_type': existing_comment['item_type'], 'item_id': existing_comment['item_id'], 'old_content_snippet': existing_comment['content'][:50], 'new_content_length': len(new_content)}
        )
        updated_comment_raw = database.get_comment_by_id(db, comment_id)
        if updated_comment_raw:
            processed_comment = convert_timestamps_to_ist_iso(dict(updated_comment_raw), ['created_at', 'updated_at'])
            return jsonify(processed_comment), 200
        else:
            app.logger.error(f"Failed to retrieve comment {comment_id} after update.")
            return jsonify(msg="Comment updated but failed to retrieve details."), 500
    else:
        # This could be due to ownership failure or other DB issue (e.g., comment deleted concurrently)
        # Check if comment still exists to differentiate 403 from 404
        if not database.get_comment_by_id(db, comment_id):
             return jsonify(msg=f"Comment with ID {comment_id} not found (possibly deleted)."), 404
        # If it exists, assume permission issue from update_comment_content
        return jsonify(msg="Failed to update comment. You may not be the owner or a database error occurred."), 403


@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_comment_api(comment_id):
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    db = get_db()
    user = find_user_by_id(user_id) # Fetch user details for role
    if not user:
        return jsonify(msg="User not found based on token."), 401 # Should not happen if JWT is valid

    user_role = user['role']

    # Fetch comment for logging and to check existence before delete attempt
    comment_to_delete = database.get_comment_by_id(db, comment_id)
    if not comment_to_delete:
        return jsonify(msg=f"Comment with ID {comment_id} not found."), 404

    # database.delete_comment_by_id handles ownership/admin check
    deleted = database.delete_comment_by_id(db, comment_id, user_id, user_role)

    if deleted:
        log_audit_action(
            action_type='DELETE_COMMENT',
            target_table='comments',
            target_id=comment_id,
            details={'item_type': comment_to_delete['item_type'], 'item_id': comment_to_delete['item_id'], 'deleted_content_snippet': comment_to_delete['content'][:50]}
        )
        return jsonify(msg="Comment deleted successfully."), 200 # Or 204 No Content
    else:
        # This could be due to ownership/role failure or other DB issue
        # Check if comment still exists to differentiate 403 from 404
        if not database.get_comment_by_id(db, comment_id):
             return jsonify(msg=f"Comment with ID {comment_id} not found (possibly already deleted)."), 404
        return jsonify(msg="Failed to delete comment. You may not be the owner or an administrator, or a database error occurred."), 403

@app.route('/api/users/mention_suggestions', methods=['GET'])
@jwt_required()
def get_mention_suggestions():
    query_term = request.args.get('q', '').strip()
    if not query_term: # Or if len(query_term) < N, e.g., 2 or 3 characters
        return jsonify([]), 200 # Return empty list if query is too short or empty

    db = get_db()
    try:
        # Query for active users whose username starts with the query_term (case-insensitive)
        # Using LOWER() for case-insensitivity might be slow on large datasets without proper indexing.
        # For SQLite, LIKE with a wildcard at the end can use an index if one exists on `username`.
        # SQLite's default LIKE is case-insensitive for ASCII. For Unicode, consider `PRAGMA case_sensitive_like = OFF;` or use `LOWER()`.
        # Assuming default SQLite behavior or `LOWER()` for broader compatibility.
        
        # For case-insensitive search, typically use `LOWER(username) LIKE ?`
        # However, SQLite's `LIKE` is case-insensitive by default for ASCII characters.
        # If full Unicode case-insensitivity is needed and PRAGMA is not set, LOWER() is better.
        # Let's assume default behavior is sufficient or LOWER() is used if needed.
        
        # Using `PRAGMA case_sensitive_like = OFF;` (per connection) or `COLLATE NOCASE` in schema could also work.
        # For this, let's use `username LIKE ?` and assume default SQLite behavior is fine.
        # If not, `LOWER(username) LIKE LOWER(?)` would be more robust.

        search_pattern = f"{query_term}%"
        users_cursor = db.execute(
            "SELECT id, username FROM users WHERE is_active = TRUE AND username LIKE ? ORDER BY username ASC LIMIT 10",
            (search_pattern,)
        )
        # Alternative with LOWER for explicit case-insensitivity:
        # search_pattern_lower = f"{query_term.lower()}%"
        # users_cursor = db.execute(
        #     "SELECT id, username FROM users WHERE is_active = TRUE AND LOWER(username) LIKE ? ORDER BY username ASC LIMIT 10",
        #     (search_pattern_lower,)
        # )
        
        suggestions = [dict(row) for row in users_cursor.fetchall()]
        return jsonify(suggestions), 200
        
    except sqlite3.Error as e:
        app.logger.error(f"Database error fetching mention suggestions for query '{query_term}': {e}")
        return jsonify(msg="Database error while fetching suggestions."), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching mention suggestions for query '{query_term}': {e}", exc_info=True)
        return jsonify(msg="An unexpected server error occurred."), 500

# --- Notification Endpoints ---

@app.route('/api/notifications', methods=['GET'])
@jwt_required()
def get_notifications_api():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)
    status_filter = request.args.get('status', default='all', type=str).lower()

    if page <= 0: page = 1
    if per_page <= 0: per_page = 10
    if per_page > 100: per_page = 100

    db = get_db()
    notifications_list = []
    total_notifications = 0

    try:
        if status_filter == 'unread':
            # Current database.get_unread_notifications doesn't support full pagination.
            # Fetch all unread and manually paginate for this endpoint.
            unread_notifications_all = database.get_unread_notifications(db, user_id)
            total_notifications = len(unread_notifications_all)
            start_index = (page - 1) * per_page
            end_index = start_index + per_page
            notifications_list_raw = [dict(n) for n in unread_notifications_all[start_index:end_index]]
            notifications_list = [convert_timestamps_to_ist_iso(n, ['created_at', 'updated_at']) for n in notifications_list_raw]
        elif status_filter == 'all': # Explicitly check for 'all'
            notifications_rows_raw, total_notifications_count = database.get_all_notifications(db, user_id, page, per_page)
            notifications_list_raw = [dict(n) for n in notifications_rows_raw]
            notifications_list = [convert_timestamps_to_ist_iso(n, ['created_at', 'updated_at']) for n in notifications_list_raw]
            total_notifications = total_notifications_count
        else: # Handle invalid status filters
             app.logger.info(f"Notification API: Received invalid status_filter '{status_filter}', returning empty list.")
             # Or, could default to 'all' or return a 400 error. For now, empty list.
             notifications_list = []
             total_notifications = 0


        total_pages = math.ceil(total_notifications / per_page) if total_notifications > 0 else 1
        
        return jsonify({
            "notifications": notifications_list,
            "page": page,
            "per_page": per_page,
            "total_notifications": total_notifications,
            "total_pages": total_pages,
            "status_filter": status_filter 
        }), 200

    except Exception as e:
        app.logger.error(f"Error fetching notifications for user {user_id} (status: {status_filter}): {e}", exc_info=True)
        return jsonify(msg="An error occurred while fetching notifications."), 500

@app.route('/api/notifications/unread_count', methods=['GET'])
@jwt_required()
def get_unread_notification_count_api():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401
    
    db = get_db()
    try:
        unread_notifications = database.get_unread_notifications(db, user_id)
        return jsonify({"count": len(unread_notifications)}), 200
    except Exception as e:
        app.logger.error(f"Error fetching unread notification count for user {user_id}: {e}", exc_info=True)
        return jsonify(msg="An error occurred while fetching unread notification count."), 500

@app.route('/api/notifications/<int:notification_id>/read', methods=['PUT'])
@jwt_required()
def mark_notification_as_read_api(notification_id):
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    db = get_db()
    
    success = database.mark_notification_as_read(db, notification_id, user_id)

    if success:
        log_audit_action(
            action_type='NOTIFICATION_MARKED_READ',
            target_table='notifications',
            target_id=notification_id,
            details={'notification_id': notification_id}
        )
        updated_notification_raw = database.get_notification_by_id(db, notification_id)
        if updated_notification_raw:
            processed_notification = convert_timestamps_to_ist_iso(dict(updated_notification_raw), ['created_at', 'updated_at'])
            return jsonify(processed_notification), 200
        else:
            app.logger.error(f"Failed to retrieve notification {notification_id} after marking as read.")
            return jsonify(msg="Notification marked as read, but failed to retrieve updated details."), 500
    else:
        notification_check = database.get_notification_by_id(db, notification_id)
        if not notification_check:
            return jsonify(msg="Notification not found."), 404
        if notification_check['user_id'] != user_id:
             return jsonify(msg="You do not have permission to mark this notification as read."), 403
        return jsonify(msg="Failed to mark notification as read. It may have already been read or another error occurred."), 400


@app.route('/api/notifications/mark_all_read', methods=['PUT'])
@jwt_required()
def mark_all_user_notifications_as_read_api():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    db = get_db()
    try:
        count_marked_read = database.mark_all_notifications_as_read(db, user_id)
        log_audit_action(
            action_type='NOTIFICATIONS_MARKED_ALL_READ',
            details={'count_marked_read': count_marked_read}
        )
        return jsonify(msg=f"Successfully marked {count_marked_read} notification(s) as read."), 200
    except Exception as e:
        app.logger.error(f"Error marking all notifications as read for user {user_id}: {e}", exc_info=True)
        return jsonify(msg="An error occurred while marking all notifications as read."), 500

@app.route('/api/notifications/clear_all', methods=['DELETE'])
@jwt_required()
def clear_all_user_notifications_api():
    current_user_id_str = get_jwt_identity()
    try:
        user_id = int(current_user_id_str)
    except ValueError:
        return jsonify(msg="Invalid user identity in token."), 401

    db = get_db()
    try:
        count_deleted = database.clear_all_notifications(db, user_id)
        log_audit_action(
            action_type='NOTIFICATIONS_CLEARED_ALL',
            details={'count_deleted': count_deleted}
        )
        return jsonify(msg=f"Successfully deleted {count_deleted} notification(s)."), 200
    except Exception as e:
        app.logger.error(f"Error clearing all notifications for user {user_id}: {e}", exc_info=True)
        return jsonify(msg="An error occurred while clearing all notifications."), 500
