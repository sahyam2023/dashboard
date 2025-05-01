# app.py
import sqlite3
from flask import Flask, request, g, jsonify
from flask_cors import CORS # Import CORS
import database # Import database helper functions/variables

app = Flask(__name__)
# Apply CORS to your app, allowing requests from any origin (*)
# For production, you might restrict this to specific origins: CORS(app, origins=["http://yourfrontenddomain.com"])
CORS(app)

app.config['DATABASE'] = database.DATABASE

# --- Database Connection Handling ---
def get_db():
    if 'db' not in g:
        g.db = database.get_db_connection()
        g.db.row_factory = sqlite3.Row # Ensure rows behave like dictionaries
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# --- Data Fetching Functions (Returning Lists of Dicts) ---

def fetch_all_software():
    """Fetches all software details."""
    db = get_db()
    cursor = db.execute("SELECT id, name, description FROM software ORDER BY name")
    software_list = [dict(row) for row in cursor.fetchall()]
    return software_list

def fetch_links(filter_software_id=None):
    """Fetches links, optionally filtered by software_id. Includes general links."""
    db = get_db()
    query = """
        SELECT l.id, l.title, l.description, l.url, l.category, s.name as software_name
        FROM links l
        LEFT JOIN software s ON l.software_id = s.id
    """
    params = []
    # Filter logic: Show specific software's links AND general (NULL) links
    if filter_software_id:
        query += " WHERE l.software_id = ? OR l.software_id IS NULL"
        params.append(filter_software_id)
    # If no filter, show ALL links (specific and general)

    query += " ORDER BY CASE WHEN s.name IS NULL THEN 1 ELSE 0 END, s.name, l.title" # General links last or first? Adjust as needed
    cursor = db.execute(query, params)
    links = [dict(row) for row in cursor.fetchall()]
    return links

def fetch_documents(filter_software_id=None):
    """Fetches documents, optionally filtered by software_id."""
    db = get_db()
    query = """
        SELECT d.id, d.doc_name, d.description, d.download_link, d.doc_type, s.name as software_name
        FROM documents d
        JOIN software s ON d.software_id = s.id
    """
    params = []
    if filter_software_id:
        query += " WHERE d.software_id = ?"
        params.append(filter_software_id)

    query += " ORDER BY s.name, d.doc_type, d.doc_name"
    cursor = db.execute(query, params)
    documents = [dict(row) for row in cursor.fetchall()]
    return documents

def fetch_patches(filter_software_id=None):
    """Fetches ALL patches, optionally filtered by the parent software_id."""
    db = get_db()
    # We need to join Patches -> Versions -> Software
    query = """
        SELECT
            p.id, p.patch_name, p.description, p.download_link, p.release_date,
            v.version_number,
            s.name as software_name,
            s.id as software_id -- Include software_id for potential frontend grouping
        FROM patches p
        JOIN versions v ON p.version_id = v.id
        JOIN software s ON v.software_id = s.id
    """
    params = []
    if filter_software_id:
        query += " WHERE s.id = ?"
        params.append(filter_software_id)

    query += " ORDER BY s.name, v.release_date DESC, v.version_number DESC, p.release_date DESC, p.patch_name"
    cursor = db.execute(query, params)
    patches = [dict(row) for row in cursor.fetchall()]
    return patches

# --- API Endpoints ---

@app.route('/api/software', methods=['GET'])
def get_software_api():
    """API endpoint to get the list of all software."""
    software_list = fetch_all_software()
    return jsonify(software_list)

@app.route('/api/links', methods=['GET'])
def get_links_api():
    """API endpoint for links. Supports ?software_id= filtering."""
    filter_id = request.args.get('software_id', type=int)
    links = fetch_links(filter_software_id=filter_id)
    return jsonify(links)

@app.route('/api/documents', methods=['GET'])
def get_documents_api():
    """API endpoint for documents. Supports ?software_id= filtering."""
    filter_id = request.args.get('software_id', type=int)
    documents = fetch_documents(filter_software_id=filter_id)
    return jsonify(documents)

@app.route('/api/patches', methods=['GET'])
def get_patches_api():
    """API endpoint for patches. Supports ?software_id= filtering."""
    filter_id = request.args.get('software_id', type=int)
    patches = fetch_patches(filter_software_id=filter_id)
    return jsonify(patches)

# --- Placeholder for Future Search API ---
@app.route('/api/search', methods=['GET'])
def search_api():
    query = request.args.get('q', '')
    if not query:
        return jsonify({"error": "Search query parameter 'q' is required."}), 400

    # TODO: Implement search logic across multiple tables (links, docs, patches, versions?)
    # This can be complex. Start simple, maybe search titles/names first.
    results = [] # Placeholder
    # Example: Search link titles (add more logic later)
    db = get_db()
    cursor = db.execute(
        "SELECT id, title, description, url, 'link' as type FROM links WHERE title LIKE ? OR description LIKE ?",
        (f'%{query}%', f'%{query}%')
    )
    results.extend([dict(row) for row in cursor.fetchall()])
     # ... add searches for documents, patches etc. ...

    return jsonify(results)


# --- CLI Command ---
@app.cli.command('init-db')
def init_db_command():
    """Clear existing data and create new tables based on schema.sql."""
    database.init_db() # Make sure database.py still handles initial software insertion
    print('Initialized the database.')
    # Optionally add sample data here or instruct user to do it manually/via SQL script

# --- Run the App ---
if __name__ == '__main__':
    # Host='0.0.0.0' makes it accessible on your network, not just localhost
    # Change port if 5000 is already in use
    app.run(host='0.0.0.0', port=5000, debug=True)