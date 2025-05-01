-- schema.sql (Ensure this is up-to-date)

-- Software Table
CREATE TABLE IF NOT EXISTS software (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Versions Table (Links to Software)
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER NOT NULL,
    version_number TEXT NOT NULL,
    release_date DATE,
    main_download_link TEXT,
    changelog TEXT,
    known_bugs TEXT,
    FOREIGN KEY (software_id) REFERENCES software (id)
);

-- Patches Table (Links to Versions)
CREATE TABLE IF NOT EXISTS patches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    patch_name TEXT NOT NULL,
    description TEXT,
    download_link TEXT NOT NULL,
    release_date DATE,
    FOREIGN KEY (version_id) REFERENCES versions (id)
);

-- Documents Table (Links to Software)
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER NOT NULL,
    doc_name TEXT NOT NULL,
    description TEXT,
    download_link TEXT NOT NULL,
    doc_type TEXT,
    FOREIGN KEY (software_id) REFERENCES software (id)
);

-- Links Table (Optionally links to Software)
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER, -- Can be NULL for general links
    title TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL UNIQUE,
    category TEXT,
    FOREIGN KEY (software_id) REFERENCES software (id)
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_versions_software_id ON versions (software_id);
CREATE INDEX IF NOT EXISTS idx_patches_version_id ON patches (version_id);
CREATE INDEX IF NOT EXISTS idx_documents_software_id ON documents (software_id);
CREATE INDEX IF NOT EXISTS idx_links_software_id ON links (software_id);
CREATE INDEX IF NOT EXISTS idx_links_category ON links (category);