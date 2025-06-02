# Dashboard

A comprehensive full-stack dashboard application for managing, visualizing, and controlling software assets, users, and related data. Built with a Python (Flask) backend and a modern React + TypeScript frontend, using SQLite for persistent storage.

---

## Table of Contents
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Overview](#api-overview)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment & Backup](#deployment--backup)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Contributing](#contributing)
- [License](#license)
- [Authors & Acknowledgements](#authors--acknowledgements)

---

## Features

### User & Access Management
- User registration, login, and JWT-based authentication
- Role-based access: user, admin, super admin
- Profile management with custom/default profile pictures
- Password reset (with security questions)
- Granular permissions: Super admins can grant/revoke view/download rights per file (document, patch, link, misc file)
- Maintenance mode: Super admins can enable/disable maintenance, restricting access to only super admins

### Data & Content Management
- CRUD for software, versions, documents, patches, links, and miscellaneous files
- Bulk actions: Delete, move, download multiple items at once
- Favorites: Users can favorite any item for quick access
- Comments & mentions: Users can comment on items and mention others (e.g., @username)
- Audit log: Track user actions for security and compliance

### Dashboard & Visualization
- Interactive dashboard with statistics: user activity, downloads, uploads, storage usage, content health, and more
- Responsive, customizable UI (React, Tailwind CSS, Vite)
- Admin dashboard with widget-based layout, persistent user preferences

### Notifications & System Health
- Real-time notifications (planned): e.g., document added/updated, permission changes, comments
- System health monitoring: API/database status, storage usage

### Security
- Secure password hashing (bcrypt)
- JWT authentication for API endpoints
- File upload validation and secure storage
- Download logging and access control

---

## Architecture Overview

- **Backend:** Python 3.10+, Flask, Flask-JWT-Extended, Flask-CORS, Flask-Bcrypt, SQLAlchemy, APScheduler
- **Frontend:** React (TypeScript), Vite, Tailwind CSS, React Grid Layout, Chart.js
- **Database:** SQLite (with schema in `schema.sql`), migrations supported
- **Testing:** Pytest (backend), MSW/Jest (frontend, if implemented)

---

## Project Structure

```
├── app.py                  # Flask backend application (API, auth, file handling, admin)
├── database.py             # DB models, helpers, migrations
├── requirements.txt        # Python dependencies
├── schema.sql              # Database schema (see below)
├── frontend/               # React + TypeScript frontend
│   ├── src/                # Frontend source code
│   │   ├── components/     # Reusable UI components
│   │   ├── views/          # Page-level components (dashboard, admin, etc.)
│   │   ├── services/       # API service layer
│   │   ├── types/          # TypeScript types/interfaces
│   │   ├── context/        # React context (auth, theme, etc.)
│   │   └── ...
│   ├── index.html          # Main HTML file
│   └── ...                 # Configs, assets, etc.
├── instance/               # SQLite DB, uploads, backups, profile pictures
│   ├── software_dashboard.db
│   ├── backups/            # DB backups
│   ├── default_profile_pictures/
│   ├── misc_uploads/
│   ├── official_uploads/
│   ├── profile_pictures/
│   └── ...
├── migrations/             # DB migration scripts
├── tests/                  # Backend tests (pytest, unittest)
└── README.md               # Project documentation
```

---

## Database Schema

- **Users:** Roles, profile pictures, password hash, security answers
- **Software/Versions:** Software products and their versions
- **Documents/Patches/Links/Misc Files:** File metadata, storage, permissions
- **Comments:** Threaded comments, mentions
- **Audit Logs:** User actions
- **Favorites:** User-item favorites
- **Permissions:** Per-user, per-file view/download rights
- **System Settings:** Maintenance mode, site settings
- **Notifications:** (Planned) Real-time and historical notifications

See [`schema.sql`](schema.sql) for full details.

---

## API Overview

- **Auth:** `/api/auth/register`, `/api/auth/login`, `/api/auth/reset_password`, `/api/auth/security_questions`
- **Users:** `/api/users`, `/api/users/<id>`, `/api/users/profile_picture`, `/api/users/mention_suggestions`
- **Software/Versions:** `/api/software`, `/api/versions`, `/api/versions_for_software`
- **Documents/Patches/Links/Misc:** `/api/documents`, `/api/patches`, `/api/links`, `/api/misc_files`
- **Comments:** `/api/comments`, `/api/comments/<item_type>/<item_id>`
- **Favorites:** `/api/favorites`
- **Permissions:** `/api/superadmin/users/<id>/permissions`
- **Admin:** `/api/admin/dashboard-stats`, `/api/admin/backup`, `/api/admin/restore`, `/api/admin/maintenance_mode`, `/api/admin/audit_log`
- **System Health:** `/api/system_health`, `/api/maintenance_mode`

All endpoints require JWT authentication unless otherwise noted. See code for full parameter and response details.

---

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js (v18+ recommended) & npm

### 1. Backend Setup (Flask)

1. **Create a virtual environment:**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```
3. **Set environment variables:**
   - Create a `.env` file or set variables in your shell (see below).
4. **Initialize the database:**
   ```powershell
   python database.py
   ```
5. **Run the backend server:**
   ```powershell
   python app.py
   ```

### 2. Frontend Setup (React + Vite)

1. **Install dependencies:**
   ```powershell
   cd frontend
   npm install
   ```
2. **Start the development server:**
   ```powershell
   npm run dev
   ```
   The app will be available at `http://localhost:5173` by default.

---

## Environment Variables

- `FLASK_ENV`: Set to `development` for debug mode.
- `DATABASE_URL`: Path to the SQLite database (default: `instance/software_dashboard.db`).
- `SECRET_KEY`: Flask secret key for sessions and JWT.
- `UPLOAD_FOLDER`: Path for file uploads (default: `instance/official_uploads/` etc.)
- (Optional) `JWT_SECRET_KEY`, `MAIL_SERVER`, etc. as needed by your app.

---

## Testing

- **Backend:**
  ```powershell
  pytest tests/
  ```
- **Frontend:**
  (Add frontend test instructions if available)
- **API:** Use tools like Postman or curl to test endpoints.

---

## Deployment & Backup

- **Production:**
  - Use a production WSGI server (e.g., Gunicorn) and a reverse proxy (e.g., Nginx)
  - Set `FLASK_ENV=production` and configure secure environment variables
- **Database Backups:**
  - Automatic and manual backups stored in `instance/backups/`
  - Restore using admin API or by replacing the DB file
- **Static Files:**
  - Uploaded files are stored in `instance/official_uploads/`, `misc_uploads/`, etc.

---

## Troubleshooting & FAQ

- **Common Issues:**
  - *Database locked*: Ensure no other process is using the DB, or increase timeout in SQLite config.
  - *CORS errors*: Check frontend/backend URLs and CORS settings in `app.py`.
  - *JWT expired*: Log in again to refresh your token.
  - *Uploads fail*: Check file size/type and folder permissions.
- **How do I reset a user password?** Use the password reset API or ask a super admin.
- **How do I enable maintenance mode?** Use the super admin dashboard or `/api/admin/maintenance_mode`.
- **How do I restore a backup?** Use the admin API or replace the DB file in `instance/`.
