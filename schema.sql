-- schema.sql

-- Drop tables in reverse order of dependency for clean re-initialization
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_favorites;
DROP TABLE IF EXISTS download_log;
DROP TABLE IF EXISTS misc_files;
DROP TABLE IF EXISTS misc_categories;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS patches;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS software;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS user_security_answers;
DROP TABLE IF EXISTS security_questions;
DROP TABLE IF EXISTS password_reset_requests;

-- Table for Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'user' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    password_reset_required BOOLEAN DEFAULT FALSE NOT NULL, -- Added this line
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Table for Software Products
CREATE TABLE IF NOT EXISTS software (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);
CREATE INDEX IF NOT EXISTS idx_software_name ON software (name);

-- Table for Software Versions
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER NOT NULL,
    version_number TEXT NOT NULL,
    release_date DATE,
    main_download_link TEXT,
    changelog TEXT,
    known_bugs TEXT,
    created_by_user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (software_id) REFERENCES software (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS idx_versions_software_id ON versions (software_id);
CREATE TRIGGER IF NOT EXISTS update_versions_updated_at
AFTER UPDATE ON versions FOR EACH ROW BEGIN
    UPDATE versions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for Official Documents
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER NOT NULL,
    doc_name TEXT NOT NULL,
    description TEXT,
    doc_type TEXT,
    is_external_link BOOLEAN DEFAULT FALSE NOT NULL,
    download_link TEXT NOT NULL,
    stored_filename TEXT UNIQUE,
    original_filename_ref TEXT,
    file_size INTEGER,
    file_type TEXT,
    created_by_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (software_id) REFERENCES software (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id),
    UNIQUE (software_id, doc_name)
);
CREATE INDEX IF NOT EXISTS idx_documents_software_id ON documents (software_id);
CREATE INDEX IF NOT EXISTS idx_documents_stored_filename ON documents (stored_filename);
CREATE TRIGGER IF NOT EXISTS update_documents_updated_at
AFTER UPDATE ON documents FOR EACH ROW BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for Official Patches
CREATE TABLE IF NOT EXISTS patches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    patch_name TEXT NOT NULL,
    description TEXT,
    release_date DATE,
    is_external_link BOOLEAN DEFAULT FALSE NOT NULL,
    download_link TEXT NOT NULL,
    stored_filename TEXT UNIQUE,
    original_filename_ref TEXT,
    file_size INTEGER,
    file_type TEXT,
    patch_by_developer TEXT,
    created_by_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (version_id) REFERENCES versions (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id),
    UNIQUE (version_id, patch_name)
);
CREATE INDEX IF NOT EXISTS idx_patches_version_id ON patches (version_id);
CREATE INDEX IF NOT EXISTS idx_patches_stored_filename ON patches (stored_filename);
CREATE TRIGGER IF NOT EXISTS update_patches_updated_at
AFTER UPDATE ON patches FOR EACH ROW BEGIN
    UPDATE patches SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for Links
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    software_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,
    is_external_link BOOLEAN DEFAULT FALSE NOT NULL,
    url TEXT NOT NULL,
    stored_filename TEXT UNIQUE,
    original_filename_ref TEXT,
    file_size INTEGER,
    file_type TEXT,
    created_by_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (software_id) REFERENCES software (id),
    FOREIGN KEY (version_id) REFERENCES versions (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS idx_links_software_id ON links (software_id);
CREATE INDEX IF NOT EXISTS idx_links_version_id ON links (version_id);
CREATE INDEX IF NOT EXISTS idx_links_stored_filename ON links (stored_filename);
CREATE TRIGGER IF NOT EXISTS update_links_updated_at
AFTER UPDATE ON links FOR EACH ROW BEGIN
    UPDATE links SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for Misc Categories
CREATE TABLE IF NOT EXISTS misc_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
);
CREATE TRIGGER IF NOT EXISTS update_misc_categories_updated_at
AFTER UPDATE ON misc_categories FOR EACH ROW BEGIN
    UPDATE misc_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for Misc Files
CREATE TABLE IF NOT EXISTS misc_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    misc_category_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_provided_title TEXT,
    user_provided_description TEXT,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    created_by_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (misc_category_id) REFERENCES misc_categories (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (created_by_user_id) REFERENCES users (id),
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id),
    UNIQUE (misc_category_id, user_provided_title),
    UNIQUE (misc_category_id, original_filename)
);
CREATE INDEX IF NOT EXISTS idx_misc_files_category_id ON misc_files (misc_category_id);
CREATE INDEX IF NOT EXISTS idx_misc_files_user_id ON misc_files (user_id);
CREATE TRIGGER IF NOT EXISTS update_misc_files_updated_at
AFTER UPDATE ON misc_files FOR EACH ROW BEGIN
    UPDATE misc_files SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Table for User Favorites
CREATE TABLE IF NOT EXISTS user_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    item_type TEXT NOT NULL, -- 'document', 'patch', 'link', 'misc_file', 'software', 'version'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE (user_id, item_id, item_type)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_item_id_item_type ON user_favorites (item_id, item_type);

-- Table for Download Logs
CREATE TABLE IF NOT EXISTS download_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    file_id INTEGER NOT NULL, -- Can refer to documents.id, patches.id, links.id, or misc_files.id
    file_type TEXT NOT NULL, -- 'document', 'patch', 'link', 'misc_file'
    download_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS idx_download_log_user_id ON download_log (user_id);
CREATE INDEX IF NOT EXISTS idx_download_log_file_id_file_type ON download_log (file_id, file_type);
CREATE INDEX IF NOT EXISTS idx_download_log_timestamp ON download_log (download_timestamp);

-- Table for Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action_type TEXT NOT NULL,
    target_table TEXT,
    target_id INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_table ON audit_logs (target_table);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);

-- Table for Site-wide Settings
CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
);

-- Table for Security Questions
CREATE TABLE IF NOT EXISTS security_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_text TEXT NOT NULL UNIQUE
);

-- Table for User Security Answers
CREATE TABLE IF NOT EXISTS user_security_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    answer_hash TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(question_id) REFERENCES security_questions(id),
    UNIQUE(user_id, question_id)
);

-- Table for Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_requests (
    token TEXT PRIMARY KEY, -- Secure random token
    user_id INTEGER NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON password_reset_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires_at ON password_reset_requests (expires_at);
