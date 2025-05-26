import unittest
import json
import os
import tempfile
import sqlite3

# Adjust the import path to go up one level to the parent directory where 'app.py' and 'database.py' are located
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import datetime, timezone # Added timezone
from app import app, get_db, INSTANCE_FOLDER_PATH
from database import init_db, get_db_connection

class TestAPISearch(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Set up for all tests in the class"""
        # Create a temporary folder for instance path if it doesn't exist,
        # though for testing with a temporary DB, this might not be strictly necessary
        # if the app doesn't write other files to instance_path during these specific tests.
        if not os.path.exists(INSTANCE_FOLDER_PATH):
            os.makedirs(INSTANCE_FOLDER_PATH)

        # Create a temporary database file
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
        
        # Initialize the database schema
        with app.app_context():
            init_db(cls.db_path) # Pass the path to init_db

    @classmethod
    def tearDownClass(cls):
        """Tear down after all tests in the class"""
        os.close(cls.db_fd)
        os.unlink(cls.db_path)
        # Clean up instance folder if it was created by tests and is empty
        if os.path.exists(INSTANCE_FOLDER_PATH) and not os.listdir(INSTANCE_FOLDER_PATH):
            os.rmdir(INSTANCE_FOLDER_PATH)
        elif os.path.exists(INSTANCE_FOLDER_PATH) and os.path.basename(cls.db_path) in os.listdir(INSTANCE_FOLDER_PATH) and len(os.listdir(INSTANCE_FOLDER_PATH)) == 0 :
             #This case is if only the db file was in there, which we unlinked.
             #However, due to race conditions / timing, it might not be seen as empty immediately.
             #Safer to leave empty instance folders created by tests if they persist.
             pass


    def setUp(self):
        """Set up for each test method"""
        self.client = app.test_client()
        # Populate database with sample data before each test
        with app.app_context():
            db = get_db() # Uses the app context's db connection
            cursor = db.cursor()

            # Clear existing data to ensure test isolation
            tables = [
                "documents", "patches", "links", "misc_files", 
                "software", "versions", "misc_categories", "users", 
                "file_permissions", "user_security_answers", "security_questions", "password_reset_requests",
                "audit_logs", "download_log" # Added audit_logs and download_log
            ]
            for table in tables:
                try:
                    cursor.execute(f"DELETE FROM {table}")
                except sqlite3.OperationalError: # Table might not exist on first run if schema changed
                    pass # Or log this if it's unexpected during normal test runs
            db.commit()

            # Ensure security questions exist for registration
            cursor.execute("INSERT OR IGNORE INTO security_questions (id, question_text) VALUES (1, 'Q1'), (2, 'Q2'), (3, 'Q3')")
            db.commit()

            # Register testadmin (will be user_id 1, typically super_admin if first)
            admin_reg_payload = {
                "username": "testadmin", "password": "", "email": "admin@test.com",
                "security_answers": [{"question_id": 1, "answer": "test"},{"question_id": 2, "answer": "test"},{"question_id": 3, "answer": "test"}]
            }
            response = self.client.post('/api/auth/register', json=admin_reg_payload)
            self.assertEqual(response.status_code, 201, f"Failed to register testadmin: {response.get_json()}")
            
            # Register testuser (will be user_id 2)
            user_reg_payload = {
                "username": "testuser", "password": "userpassword", "email": "user@test.com",
                "security_answers": [{"question_id": 1, "answer": "test"},{"question_id": 2, "answer": "test"},{"question_id": 3, "answer": "test"}]
            }
            response = self.client.post('/api/auth/register', json=user_reg_payload)
            self.assertEqual(response.status_code, 201, f"Failed to register testuser: {response.get_json()}")

            # Manually ensure testadmin is super_admin (user_id 1 from registration)
            # and testuser is user (user_id 2 from registration)
            cursor.execute("UPDATE users SET role = 'super_admin' WHERE id = 1")
            cursor.execute("UPDATE users SET role = 'user' WHERE id = 2")
            db.commit()
            
            # Re-fetch user details to confirm IDs if needed, though we'll assume 1 and 2 for simplicity
            # self.admin_user = db.execute("SELECT * FROM users WHERE username = 'testadmin'").fetchone()
            # self.test_user = db.execute("SELECT * FROM users WHERE username = 'testuser'").fetchone()
            # self.admin_user_id = self.admin_user['id']
            # self.test_user_id = self.test_user['id']
            
            # Use fixed IDs for predictability in tests
            self.admin_user_id = 1
            self.test_user_id = 2


            # Sample Software
            cursor.execute("INSERT INTO software (id, name, description) VALUES (?, ?, ?)",
                           (1, 'TestApp Alpha', 'A test application.'))
            cursor.execute("INSERT INTO software (id, name, description) VALUES (?, ?, ?)",
                           (2, 'Another Utility Tool', 'Some other tool.'))

            # Sample Versions
            cursor.execute("""
                INSERT INTO versions (id, software_id, version_number, changelog, known_bugs, created_by_user_id, updated_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (1, 1, '1.0.0', 'Initial public release.', 'Minor UI glitches.', 1, 1))
            cursor.execute("""
                INSERT INTO versions (id, software_id, version_number, changelog, known_bugs, created_by_user_id, updated_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (2, 1, 'Beta v2.1', 'Performance improvements and bug fixes.', 'Crashes sometimes on older hardware.', 1, 1))

            # Sample Documents
            # schema: id, software_id, doc_name, description, doc_type, is_external_link, download_link, stored_filename, original_filename_ref, file_size, file_type, created_by_user_id, created_at, updated_by_user_id, updated_at
            cursor.execute("""
                INSERT INTO documents (id, software_id, doc_name, description, doc_type, download_link, is_external_link, created_by_user_id, updated_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (1, 1, 'User Manual', 'Complete guide to using TestApp Alpha.', 'PDF', '/docs/user_manual.pdf', False, 1, 1)) # Stored file, updated_by_user_id is 1
            cursor.execute("""
                INSERT INTO documents (id, software_id, doc_name, description, doc_type, download_link, is_external_link, created_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (2, 1, 'API Specification', 'Technical details for TestApp Alpha API.', 'Online', 'http://api.example.com/spec', True, 1)) # External link, no updated_by_user_id initially

            # Sample Patches
            # schema: id, version_id, patch_name, description, release_date, is_external_link, download_link, stored_filename, original_filename_ref, file_size, file_type, created_by_user_id, created_at, updated_by_user_id, updated_at
            cursor.execute("""
                INSERT INTO patches (id, version_id, patch_name, description, download_link, is_external_link, created_by_user_id, updated_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (1, 1, 'Hotfix 1.0.1', 'Critical bug fix for data corruption.', '/patches/hotfix_1.0.1.zip', False, 1, 1))
            cursor.execute("""
                INSERT INTO patches (id, version_id, patch_name, description, download_link, is_external_link, created_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (2, 2, 'Security Update P01', 'Patches critical vulnerability CVE-2023-1234.', 'http://example.com/sec_update_p01', True, 1))
            
            # Sample Links
            # schema: id, title, description, software_id, version_id, is_external_link, url, stored_filename, original_filename_ref, file_size, file_type, created_by_user_id, created_at, updated_by_user_id, updated_at
            cursor.execute("""
                INSERT INTO links (id, software_id, version_id, title, url, description, is_external_link, created_by_user_id, updated_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (1, 1, 1, 'TestApp Homepage', 'http://example.com/testapp', 'Official website for TestApp Alpha.', True, 1, 1))
            cursor.execute("""
                INSERT INTO links (id, software_id, version_id, title, url, description, is_external_link, created_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (2, 1, 2, 'Support Forum Thread', 'http://forums.example.com/testapp/beta2_thread', 'Discussion for Beta v2.1.', True, 1))


            # Sample Misc Categories
            # schema: id, name, description, created_by_user_id, created_at, updated_by_user_id, updated_at
            cursor.execute("INSERT INTO misc_categories (id, name, description, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?)",
                           (1, 'Logos', 'Official company and product logos.', 1, 1))
            cursor.execute("INSERT INTO misc_categories (id, name, description, created_by_user_id) VALUES (?, ?, ?, ?)",
                           (2, 'Screenshots', 'Product screenshots for marketing.', 1))

            # Sample Misc Files
            # schema: id, misc_category_id, user_id, user_provided_title, user_provided_description, original_filename, stored_filename, file_path, file_type, file_size, created_by_user_id, created_at, updated_by_user_id, updated_at
            cursor.execute("""
                INSERT INTO misc_files (id, misc_category_id, user_id, user_provided_title, user_provided_description, original_filename, stored_filename, file_path, file_type, file_size, created_by_user_id, updated_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (1, 1, 1, 'Main Product Logo', 'The official logo for TestApp Alpha.', 'logo_testapp.png', 'abc123logo.png', '/misc/abc123logo.png', 'image/png', 10240, 1, 1)) # user_id is the uploader, created_by_user_id is admin/system
            cursor.execute("""
                INSERT INTO misc_files (id, misc_category_id, user_id, user_provided_title, user_provided_description, original_filename, stored_filename, file_path, file_type, file_size, created_by_user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (2, 2, 1, 'UI Screenshot Example', 'A screenshot of the main interface of TestApp.', 'UI_screenshot.JPG', 'def456screenshot.jpg', '/misc/def456screenshot.jpg', 'image/jpeg', 204800, 1)) # Corrected: Removed last '1'
            
            db.commit()

    def tearDown(self):
        """Tear down after each test method"""
        # The database is cleaned up in setUpClass, and data is cleared in setUp.
        # No specific action needed here if using a single temp DB file for the class.
        pass

    def _assert_common_search_response_structure(self, response, expected_type=None, expected_min_items=1):
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsInstance(data, list)
        if expected_min_items > 0:
            self.assertGreaterEqual(len(data), expected_min_items)
            for item in data:
                self.assertIsInstance(item, dict)
                self.assertIn('id', item)
                self.assertIsInstance(item['id'], int)
                self.assertIn('name', item) # 'name' is the common alias
                self.assertIsInstance(item['name'], str)
                self.assertIn('type', item)
                self.assertIsInstance(item['type'], str)
                # The specific expected_type check will be done in individual tests
                # if a certain type is expected to be predominant or exclusively present.
        elif expected_min_items == 0:
             self.assertEqual(len(data), 0)


    def test_search_empty_query(self):
        response = self.client.get('/api/search?q=')
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertEqual(data, {"error": "Search query parameter 'q' is required and cannot be empty."})

    def test_search_missing_query_parameter(self):
        response = self.client.get('/api/search')
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertEqual(data, {"error": "Search query parameter 'q' is required and cannot be empty."})
        
    def test_search_term_not_found(self):
        response = self.client.get('/api/search?q=NonExistentTermXYZ123')
        self._assert_common_search_response_structure(response, expected_min_items=0)

    def test_search_documents_name(self):
        response = self.client.get('/api/search?q=User Manual')
        self._assert_common_search_response_structure(response, expected_type='document')
        data = json.loads(response.data)
        self.assertTrue(any(item['name'] == 'User Manual' and item['type'] == 'document' for item in data))
        first_doc = next(item for item in data if item['type'] == 'document')
        self.assertIn('description', first_doc)

    def test_search_documents_description(self):
        response = self.client.get('/api/search?q=Complete guide')
        self._assert_common_search_response_structure(response, expected_type='document')
        data = json.loads(response.data)
        self.assertTrue(any('Complete guide' in item['description'] and item['type'] == 'document' for item in data))

    def test_search_patches_name(self):
        response = self.client.get('/api/search?q=Hotfix 1.0.1')
        self._assert_common_search_response_structure(response, expected_type='patch')
        data = json.loads(response.data)
        self.assertTrue(any(item['name'] == 'Hotfix 1.0.1' and item['type'] == 'patch' for item in data))
        first_patch = next(item for item in data if item['type'] == 'patch')
        self.assertIn('description', first_patch)

    def test_search_links_title(self):
        response = self.client.get('/api/search?q=TestApp Homepage')
        self._assert_common_search_response_structure(response, expected_type='link')
        data = json.loads(response.data)
        self.assertTrue(any(item['name'] == 'TestApp Homepage' and item['type'] == 'link' for item in data))
        first_link = next(item for item in data if item['type'] == 'link')
        self.assertIn('url', first_link)
        self.assertIn('description', first_link)

    def test_search_links_url(self):
        response = self.client.get('/api/search?q=http://forums.example.com')
        self._assert_common_search_response_structure(response, expected_type='link')
        data = json.loads(response.data)
        self.assertTrue(any('http://forums.example.com' in item['url'] and item['type'] == 'link' for item in data))

    def test_search_misc_files_title(self):
        response = self.client.get('/api/search?q=Main Product Logo')
        self._assert_common_search_response_structure(response, expected_type='misc_file')
        data = json.loads(response.data)
        self.assertTrue(any(item['name'] == 'Main Product Logo' and item['type'] == 'misc_file' for item in data))
        first_misc = next(item for item in data if item['type'] == 'misc_file')
        self.assertIn('original_filename', first_misc)
        self.assertIn('description', first_misc)


    def test_search_misc_files_original_filename(self):
        response = self.client.get('/api/search?q=UI_screenshot.JPG') # Test with case
        self._assert_common_search_response_structure(response, expected_type='misc_file')
        data = json.loads(response.data)
        self.assertTrue(any(item['original_filename'] == 'UI_screenshot.JPG' and item['type'] == 'misc_file' for item in data))

    def test_search_software_name(self):
        response = self.client.get('/api/search?q=TestApp Alpha')
        self._assert_common_search_response_structure(response) # Removed expected_type from here
        data = json.loads(response.data)
        # Ensure at least one item of type 'software' with the correct name is present
        found_software = any(item['name'] == 'TestApp Alpha' and item['type'] == 'software' for item in data)
        self.assertTrue(found_software, "Expected 'TestApp Alpha' software item not found in results.")
        
        # Optionally, find and check details of the specific software item
        software_item = next((item for item in data if item['type'] == 'software' and item['name'] == 'TestApp Alpha'), None)
        self.assertIsNotNone(software_item, "'TestApp Alpha' software item is None.")
        if software_item: # Check further only if found
             self.assertIn('description', software_item)


    def test_search_versions_number(self):
        response = self.client.get('/api/search?q=Beta v2.1')
        self._assert_common_search_response_structure(response) # Removed expected_type
        data = json.loads(response.data)
        # Ensure at least one item of type 'version' with the correct name is present
        found_version = any(item['name'] == 'Beta v2.1' and item['type'] == 'version' for item in data)
        self.assertTrue(found_version, "Expected 'Beta v2.1' version item not found in results.")

        version_item = next((item for item in data if item['type'] == 'version' and item['name'] == 'Beta v2.1'), None)
        self.assertIsNotNone(version_item, "'Beta v2.1' version item is None.")
        if version_item: # Check further only if found
            self.assertIn('changelog', version_item)
            self.assertIn('known_bugs', version_item)
            self.assertIn('software_id', version_item)
            self.assertIn('software_name', version_item)
            self.assertEqual(version_item['software_name'], 'TestApp Alpha')


    def test_search_versions_changelog(self):
        response = self.client.get('/api/search?q=Initial public')
        self._assert_common_search_response_structure(response)
        data = json.loads(response.data)
        self.assertTrue(any('Initial public' in item.get('changelog','') and item['type'] == 'version' for item in data), "Search for 'Initial public' in version changelog failed.")

    def test_search_versions_known_bugs(self):
        response = self.client.get('/api/search?q=Crashes sometimes')
        self._assert_common_search_response_structure(response)
        data = json.loads(response.data)
        self.assertTrue(any('Crashes sometimes' in item.get('known_bugs','') and item['type'] == 'version' for item in data), "Search for 'Crashes sometimes' in version known_bugs failed.")

    def test_search_case_insensitive(self):
        # Search "user manual" for "User Manual" (document name)
        response_doc_name = self.client.get('/api/search?q=user manual')
        self._assert_common_search_response_structure(response_doc_name) 
        data_doc_name = json.loads(response_doc_name.data)
        self.assertTrue(any(item['name'].lower() == 'user manual' and item['type'] == 'document' for item in data_doc_name), "Case-insensitive search for 'user manual' failed in doc name.")

        # Search "critical BUG fix" for "Critical bug fix" (patch description)
        response_patch_desc = self.client.get('/api/search?q=critical BUG fix')
        self._assert_common_search_response_structure(response_patch_desc)
        data_patch_desc = json.loads(response_patch_desc.data)
        self.assertTrue(any('critical bug fix' in item.get('description','').lower() and item['type'] == 'patch' for item in data_patch_desc), "Case-insensitive search for 'critical BUG fix' failed in patch description.")

        # Search "testapp alpha" for "TestApp Alpha" (software name)
        response_sw_name = self.client.get('/api/search?q=testapp alpha')
        self._assert_common_search_response_structure(response_sw_name)
        data_sw_name = json.loads(response_sw_name.data)
        self.assertTrue(any(item['name'].lower() == 'testapp alpha' and item['type'] == 'software' for item in data_sw_name), "Case-insensitive search for 'testapp alpha' failed in software name.")
        
        # Search "ui_screenshot.jpg" (lowercase) for "UI_screenshot.JPG" (misc_files original_filename)
        # Assuming testuser (id=2) has view permission for this misc_file (id=2)
        with app.app_context():
            db = get_db()
            # user_id=2 (testuser), file_id=2 (UI_screenshot.JPG), file_type='misc_file'
            _set_permission_for_test(db, 2, 2, 'misc_file', True, False) 
            db.commit()
        
        # Log in as testuser
        access_token = _login_user_for_test(self.client, 'testuser', 'userpassword')
        headers = {'Authorization': f'Bearer {access_token}'}

        response_misc_orig = self.client.get('/api/search?q=ui_screenshot.jpg', headers=headers)
        self._assert_common_search_response_structure(response_misc_orig, expected_min_items=1) # Expecting at least one result
        data_misc_orig = json.loads(response_misc_orig.data)
        self.assertTrue(any(item.get('original_filename','').lower() == 'ui_screenshot.jpg' and item['type'] == 'misc_file' for item in data_misc_orig), "Case-insensitive search for 'ui_screenshot.jpg' failed in misc_file original_filename.")


# --- Helper Functions for Auth and Permissions ---
def _login_user_for_test(client, username, password):
    """Logs in a user and returns the access token."""
    response = client.post('/api/auth/login', json={'username': username, 'password': password})
    if response.status_code != 200:
        # Attempt to get more detailed error from JSON response if possible
        error_details = ""
        try:
            error_data = response.get_json()
            if error_data and 'msg' in error_data:
                error_details = error_data['msg']
        except Exception: # Fallback if response is not JSON or 'msg' key is missing
            error_details = response.get_data(as_text=True)
        raise ValueError(f"Login failed for {username}: {response.status_code} - {error_details}")
    return json.loads(response.data)['access_token']

def _set_permission_for_test(db, user_id, file_id, file_type, can_view, can_download):
    """Directly inserts or updates a file permission in the database."""
    now_ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO file_permissions (user_id, file_id, file_type, can_view, can_download, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, file_id, file_type) DO UPDATE SET
                can_view = excluded.can_view,
                can_download = excluded.can_download,
                updated_at = excluded.updated_at
        """, (user_id, file_id, file_type, can_view, can_download, now_ts, now_ts))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error in _set_permission_for_test: {e}") # Print error for debugging
        raise


# --- Test Class for File Permission API Endpoints ---
class TestFilePermissionsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(INSTANCE_FOLDER_PATH):
            os.makedirs(INSTANCE_FOLDER_PATH)
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
        app.config['JWT_SECRET_KEY'] = 'testsecretkeypermissions' 
        
        with app.app_context():
            init_db(cls.db_path)

    @classmethod
    def tearDownClass(cls):
        os.close(cls.db_fd)
        os.unlink(cls.db_path)

    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            # Extended list of tables including new ones
            tables = [
                "documents", "patches", "links", "misc_files", 
                "software", "versions", "misc_categories", "users", 
                "file_permissions", "user_security_answers", "security_questions", 
                "password_reset_requests", "audit_logs", "download_log", "site_settings", "system_settings"
            ]
            for table in tables:
                try:
                    cursor.execute(f"DELETE FROM {table}")
                except sqlite3.OperationalError as e:
                    print(f"Could not delete from {table}: {e}") # Table might not exist on first run
            
            # Pre-populate security questions for user registration
            cursor.execute("INSERT OR IGNORE INTO security_questions (id, question_text) VALUES (1, 'Q1'), (2, 'Q2'), (3, 'Q3')")
            # Initialize system settings like maintenance mode
            cursor.execute("INSERT OR IGNORE INTO system_settings (setting_name, is_enabled) VALUES ('maintenance_mode', FALSE)")

            db.commit()

            # Register users using the helper
            self._register_user_for_test_internal("superadmin_perm", "superpassword1", "superperm@test.com") # Expected User ID 1
            self._register_user_for_test_internal("admin_perm", "adminpassword1", "adminperm@test.com")     # Expected User ID 2
            self._register_user_for_test_internal("user_perm", "userpassword1", "userperm@test.com")       # Expected User ID 3
            
            # Manually set roles
            cursor.execute("UPDATE users SET role='super_admin' WHERE username='superadmin_perm'")
            cursor.execute("UPDATE users SET role='admin' WHERE username='admin_perm'")
            cursor.execute("UPDATE users SET role='user' WHERE username='user_perm'")

            # Sample software and document for permission testing
            cursor.execute("INSERT INTO software (id, name, created_by_user_id) VALUES (300, 'PermTestSW', 1)")
            cursor.execute("INSERT INTO documents (id, software_id, doc_name, download_link, created_by_user_id) VALUES (?, ?, ?, ?, ?)",
                           (3001, 300, 'Perm Doc Alpha', '/docs/pdoc_alpha.pdf', 1))
            db.commit()

        # Login as superadmin for tests in this class
        self.superadmin_token = _login_user_for_test(self.client, "superadmin_perm", "superpassword1")
        self.superadmin_headers = {'Authorization': f'Bearer {self.superadmin_token}'}
        
        # Store IDs for convenience
        self.superadmin_id = 1
        self.admin_id = 2
        self.user_id = 3
        self.doc_id = 3001


    def _register_user_for_test_internal(self, username, password, email, role_to_set=None):
        payload = {
            "username": username, "password": password, "email": email,
            "security_answers": [{"question_id": 1, "answer": "test"},{"question_id": 2, "answer": "test"},{"question_id": 3, "answer": "test"}]
        }
        response = self.client.post('/api/auth/register', json=payload)
        # Allow 409 if user already exists from a previous (failed) test run's setup
        self.assertTrue(response.status_code == 201 or response.status_code == 409, f"Registration failed for {username}: {response.get_json()}")
        # If a specific role needs to be ensured beyond what registration does:
        if role_to_set:
            with app.app_context():
                db = get_db()
                db.execute("UPDATE users SET role = ? WHERE username = ?", (role_to_set, username))
                db.commit()


    def test_get_permissions_success_superadmin(self):
        response = self.client.get(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 0) # No permissions set yet

    def test_get_permissions_forbidden_admin(self):
        admin_token = _login_user_for_test(self.client, "admin_perm", "adminpassword1")
        response = self.client.get(f'/api/superadmin/users/{self.user_id}/permissions', headers={'Authorization': f'Bearer {admin_token}'})
        self.assertEqual(response.status_code, 403)

    def test_get_permissions_unauthorized(self):
        response = self.client.get(f'/api/superadmin/users/{self.user_id}/permissions') # No token
        self.assertEqual(response.status_code, 401)

    def test_get_permissions_user_not_found(self):
        response = self.client.get('/api/superadmin/users/9999/permissions', headers=self.superadmin_headers)
        self.assertEqual(response.status_code, 404)

    def test_get_permissions_with_existing_data(self):
        with app.app_context():
            _set_permission_for_test(get_db(), self.user_id, self.doc_id, 'document', True, False)
        
        response = self.client.get(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['file_id'], self.doc_id)
        self.assertEqual(data[0]['file_type'], 'document')
        self.assertTrue(data[0]['can_view'])
        self.assertFalse(data[0]['can_download'])

    def test_update_permissions_new_and_update_existing(self):
        # Initial permission for doc_id
        with app.app_context():
            _set_permission_for_test(get_db(), self.user_id, self.doc_id, 'document', True, False)
        
        # Create another document for this test
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            cursor.execute("INSERT INTO documents (id, software_id, doc_name, download_link, created_by_user_id) VALUES (?, ?, ?, ?, ?)",
                           (3002, 300, 'Perm Doc Beta', '/docs/pdoc_beta.pdf', self.superadmin_id))
            db.commit()
        
        doc_id_beta = 3002
        payload = [
            {'file_id': self.doc_id, 'file_type': 'document', 'can_view': False, 'can_download': True}, # Update existing
            {'file_id': doc_id_beta, 'file_type': 'document', 'can_view': True, 'can_download': True}    # New permission
        ]
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('permissions updated successfully', data.get('msg', '').lower()) # Check 'msg' key
        self.assertEqual(len(data['permissions']), 2)

        # Verify in DB
        with app.app_context():
            db = get_db()
            perm1 = db.execute("SELECT * FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'document'", (self.user_id, self.doc_id)).fetchone()
            self.assertIsNotNone(perm1)
            self.assertFalse(perm1['can_view'])
            self.assertTrue(perm1['can_download'])
            
            perm2 = db.execute("SELECT * FROM file_permissions WHERE user_id = ? AND file_id = ? AND file_type = 'document'", (self.user_id, doc_id_beta)).fetchone()
            self.assertIsNotNone(perm2)
            self.assertTrue(perm2['can_view'])
            self.assertTrue(perm2['can_download'])
            
            # Check audit log (simplified)
            log = db.execute("SELECT * FROM audit_logs WHERE action_type = 'UPDATE_USER_FILE_PERMISSIONS_SUCCESS' AND target_id = ?", (self.user_id,)).fetchone()
            self.assertIsNotNone(log)
            log_details = json.loads(log['details'])
            self.assertEqual(log_details['permissions_processed_count'], 2)

    def test_update_permissions_forbidden_non_superadmin(self):
        # Login as admin (not superadmin)
        admin_token = _login_user_for_test(self.client, "admin_perm", "adminpassword1")
        headers = {'Authorization': f'Bearer {admin_token}'}
        payload = [{'file_id': self.doc_id, 'file_type': 'document', 'can_view': True, 'can_download': True}]
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=headers, json=payload)
        self.assertEqual(response.status_code, 403)

        # Login as regular user
        user_token = _login_user_for_test(self.client, "user_perm", "userpassword1")
        headers = {'Authorization': f'Bearer {user_token}'}
        response = self.client.put(f'/api/superadmin/users/{self.superadmin_id}/permissions', headers=headers, json=payload) # Targetting superadmin to check
        self.assertEqual(response.status_code, 403)

    def test_update_permissions_unauthorized_no_token(self):
        payload = [{'file_id': self.doc_id, 'file_type': 'document', 'can_view': True, 'can_download': True}]
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', json=payload)
        self.assertEqual(response.status_code, 401)

    def test_update_permissions_target_user_not_found(self):
        payload = [{'file_id': self.doc_id, 'file_type': 'document', 'can_view': True, 'can_download': True}]
        response = self.client.put('/api/superadmin/users/9999/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 404)
        data = json.loads(response.data)
        self.assertEqual(data['msg'], "Target user not found.")

    def test_update_permissions_invalid_payload_bad_list(self):
        payload = {"key": "not a list"} # Not a list
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("request body must be a list", data['msg'].lower())
        
    def test_update_permissions_invalid_payload_item_not_dict(self):
        payload = ["not a dict"] # List item not a dict
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("each item in the list must be a permission object", data['errors'][0].lower())

    def test_update_permissions_invalid_payload_bad_file_id(self):
        payload = [{'file_id': 'not-an-int', 'file_type': 'document', 'can_view': True, 'can_download': False}]
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("invalid 'file_id'", data['errors'][0].lower())

        payload_zero = [{'file_id': 0, 'file_type': 'document', 'can_view': True, 'can_download': False}]
        response_zero = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload_zero)
        self.assertEqual(response_zero.status_code, 400)
        data_zero = json.loads(response_zero.data)
        self.assertIn("invalid 'file_id'", data_zero['errors'][0].lower())


    def test_update_permissions_invalid_payload_bad_can_view_type(self):
        payload = [{'file_id': self.doc_id, 'file_type': 'document', 'can_view': 'not-a-bool', 'can_download': False}]
        response = self.client.put(f'/api/superadmin/users/{self.user_id}/permissions', headers=self.superadmin_headers, json=payload)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("invalid 'can_view' value", data['errors'][0].lower())


# --- Test Class for Permission Enforcement ---
class TestPermissionEnforcement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(INSTANCE_FOLDER_PATH): os.makedirs(INSTANCE_FOLDER_PATH)
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
        app.config['JWT_SECRET_KEY'] = 'testsecretkeyenforcement'
        with app.app_context(): init_db(cls.db_path)

    @classmethod
    def tearDownClass(cls):
        os.close(cls.db_fd)
        os.unlink(cls.db_path)

    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            # Extended list of tables including new ones
            tables = [
                "documents", "patches", "links", "misc_files", 
                "software", "versions", "misc_categories", "users", 
                "file_permissions", "user_security_answers", "security_questions", 
                "password_reset_requests", "audit_logs", "download_log", "site_settings", "system_settings"
            ]
            for table in tables: 
                try:
                    cursor.execute(f"DELETE FROM {table}")
                except sqlite3.OperationalError: pass # Ignore if table doesn't exist yet
            
            cursor.execute("INSERT OR IGNORE INTO security_questions (id, question_text) VALUES (1, 'Q1'), (2, 'Q2'), (3, 'Q3')")
            cursor.execute("INSERT OR IGNORE INTO system_settings (setting_name, is_enabled) VALUES ('maintenance_mode', FALSE)")
            db.commit()

            # Register users
            self._register_user_for_test_internal("perm_superadmin", "superpassword", "perm_super@test.com") # ID 1
            self._register_user_for_test_internal("perm_testuser", "userpassword", "perm_user@test.com")   # ID 2
            
            # Set roles
            cursor.execute("UPDATE users SET role='super_admin' WHERE username='perm_superadmin'")
            cursor.execute("UPDATE users SET role='user' WHERE username='perm_testuser'")
            
            self.superadmin_id = 1 # Based on registration order
            self.testuser_id = 2   # Based on registration order

            # Sample Data
            cursor.execute("INSERT INTO software (id, name, created_by_user_id) VALUES (400, 'PermEnforceSW', ?)", (self.superadmin_id,))
            # Document
            cursor.execute("INSERT INTO documents (id, software_id, doc_name, download_link, stored_filename, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", 
                           (4001, 400, 'ViewPermDoc', '/docs/vpdoc.pdf', 'vpdoc.pdf', self.superadmin_id))
            # Version (for Patch)
            cursor.execute("INSERT INTO versions (id, software_id, version_number, created_by_user_id) VALUES (?, ?, ?, ?)", 
                           (401, 400, '1.0-perm', self.superadmin_id))
            # Patch
            cursor.execute("INSERT INTO patches (id, version_id, patch_name, download_link, stored_filename, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", 
                           (4002, 401, 'ViewPermPatch', '/patch/vppatch.zip', 'vppatch.zip', self.superadmin_id))
            # Link (uploaded file type)
            cursor.execute("INSERT INTO links (id, software_id, version_id, title, url, stored_filename, is_external_link, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
                           (4003, 400, 401, 'ViewPermLinkFile', '/links/vplink.txt', 'vplink.txt', 0, self.superadmin_id))
            # Misc Category
            cursor.execute("INSERT INTO misc_categories (id, name, created_by_user_id) VALUES (?, ?, ?)", 
                           (402, 'PermEnforceCat', self.superadmin_id))
            # Misc File
            cursor.execute("INSERT INTO misc_files (id, misc_category_id, user_id, original_filename, stored_filename, file_path, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                           (4004, 402, self.superadmin_id, 'viewmisc.txt', 'viewmisc.txt', '/misc_uploads/viewmisc.txt', self.superadmin_id))
            db.commit()
            
            self.doc_id_perm = 4001
            self.patch_id_perm = 4002
            self.link_id_perm = 4003
            self.misc_id_perm = 4004


        self.user_token = _login_user_for_test(self.client, "perm_testuser", "userpassword")
        self.user_headers = {'Authorization': f'Bearer {self.user_token}'}

    def _register_user_for_test_internal(self, username, password, email=None, role_to_set=None): # Duplicated for now
        if email is None: email = f"{username}@example.com"
        payload = {"username": username, "password": password, "email": email, "security_answers": [{"question_id":1,"answer":"t"},{"question_id":2,"answer":"t"},{"question_id":3,"answer":"t"}]}
        self.client.post('/api/auth/register', json=payload)


    def test_document_view_permission_enforcement(self):
        # Initially, testuser should not see document
        response = self.client.get('/api/documents', headers=self.user_headers) # No specific software filter
        data = json.loads(response.data)
        self.assertFalse(any(doc['id'] == self.doc_id_perm for doc in data['documents']), "Document visible without permission")

        # Grant view permission
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', True, False)
        
        response = self.client.get('/api/documents', headers=self.user_headers)
        data = json.loads(response.data)
        doc_found = next((doc for doc in data['documents'] if doc['id'] == self.doc_id_perm), None)
        self.assertIsNotNone(doc_found, "Document not visible after granting view permission")
        self.assertFalse(doc_found.get('is_downloadable', True)) # Explicitly check for False as default might be True if key missing

        # Revoke view permission
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', False, False)
        response = self.client.get('/api/documents', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(doc['id'] == self.doc_id_perm for doc in data['documents']), "Document still visible after revoking view permission")

    def test_document_download_permission_enforcement(self):
        # Grant view, no download
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', True, False)
        
        response = self.client.get(f'/official_uploads/docs/vpdoc.pdf', headers=self.user_headers) # filename from setup
        self.assertEqual(response.status_code, 403, "Download allowed without can_download=True")

        # Grant download
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', True, True)
        response = self.client.get(f'/official_uploads/docs/vpdoc.pdf', headers=self.user_headers)
        self.assertEqual(response.status_code, 200, "Download denied with can_download=True")
        # Verify download log
        with app.app_context():
            log = get_db().execute("SELECT * FROM download_log WHERE file_id = ? AND file_type = 'document' AND user_id = ?", (self.doc_id_perm, self.testuser_id)).fetchone()
            self.assertIsNotNone(log, "Download activity not logged")

        # Revoke download
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', True, False)
        response = self.client.get(f'/official_uploads/docs/vpdoc.pdf', headers=self.user_headers)
        self.assertEqual(response.status_code, 403, "Download allowed after revoking can_download")

    # Similar tests for patch, link, misc_file would follow...
    # For search, it's more complex as it aggregates. One test might suffice to show search respects view perms.
    def test_search_respects_view_permission_document(self):
        # Initially, no permission for doc_id_perm (4001)
        response = self.client.get(f'/api/search?q=ViewPermDoc', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(item['id'] == self.doc_id_perm and item['type'] == 'document' for item in data), "Document found in search without view permission")

        # Grant view permission
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', True, False)
        response = self.client.get(f'/api/search?q=ViewPermDoc', headers=self.user_headers)
        data = json.loads(response.data)
        found_item = next((item for item in data if item['id'] == self.doc_id_perm and item['type'] == 'document'), None)
        self.assertIsNotNone(found_item, "Document not found in search after granting view permission")
        self.assertFalse(found_item.get('is_downloadable', True)) # Check is_downloadable flag from search

        # Revoke view
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.doc_id_perm, 'document', False, False)
        response = self.client.get(f'/api/search?q=ViewPermDoc', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(item['id'] == self.doc_id_perm and item['type'] == 'document' for item in data), "Document still found in search after revoking view permission")

    # --- Patch Permission Tests ---
    def test_patch_view_permission_enforcement(self):
        response = self.client.get('/api/patches', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(p['id'] == self.patch_id_perm for p in data['patches']), "Patch visible without permission")

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.patch_id_perm, 'patch', True, False)
        response = self.client.get('/api/patches', headers=self.user_headers)
        data = json.loads(response.data)
        patch_found = next((p for p in data['patches'] if p['id'] == self.patch_id_perm), None)
        self.assertIsNotNone(patch_found)
        self.assertFalse(patch_found.get('is_downloadable', True))

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.patch_id_perm, 'patch', False, False)
        response = self.client.get('/api/patches', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(p['id'] == self.patch_id_perm for p in data['patches']))

    def test_patch_download_permission_enforcement(self):
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.patch_id_perm, 'patch', True, False)
        response = self.client.get(f'/official_uploads/patches/vppatch.zip', headers=self.user_headers)
        self.assertEqual(response.status_code, 403)

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.patch_id_perm, 'patch', True, True)
        response = self.client.get(f'/official_uploads/patches/vppatch.zip', headers=self.user_headers)
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            log = get_db().execute("SELECT * FROM download_log WHERE file_id = ? AND file_type = 'patch' AND user_id = ?", (self.patch_id_perm, self.testuser_id)).fetchone()
            self.assertIsNotNone(log)

    # --- Link (Uploaded File) Permission Tests ---
    def test_link_view_permission_enforcement(self):
        response = self.client.get('/api/links', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(l['id'] == self.link_id_perm for l in data['links']), "Link visible without permission")

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.link_id_perm, 'link', True, False)
        response = self.client.get('/api/links', headers=self.user_headers)
        data = json.loads(response.data)
        link_found = next((l for l in data['links'] if l['id'] == self.link_id_perm), None)
        self.assertIsNotNone(link_found)
        self.assertFalse(link_found.get('is_downloadable', True))

    def test_link_download_permission_enforcement(self): # Assuming 'vplink.txt' is the stored_filename for link_id_perm
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.link_id_perm, 'link', True, False)
        response = self.client.get(f'/official_uploads/links/vplink.txt', headers=self.user_headers)
        self.assertEqual(response.status_code, 403)

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.link_id_perm, 'link', True, True)
        response = self.client.get(f'/official_uploads/links/vplink.txt', headers=self.user_headers)
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            log = get_db().execute("SELECT * FROM download_log WHERE file_id = ? AND file_type = 'link_file' AND user_id = ?", (self.link_id_perm, self.testuser_id)).fetchone()
            self.assertIsNotNone(log)

    # --- Misc File Permission Tests ---
    def test_misc_file_view_permission_enforcement(self):
        response = self.client.get('/api/misc_files', headers=self.user_headers)
        data = json.loads(response.data)
        self.assertFalse(any(mf['id'] == self.misc_id_perm for mf in data['misc_files']), "Misc file visible without permission")

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.misc_id_perm, 'misc_file', True, False)
        response = self.client.get('/api/misc_files', headers=self.user_headers)
        data = json.loads(response.data)
        misc_found = next((mf for mf in data['misc_files'] if mf['id'] == self.misc_id_perm), None)
        self.assertIsNotNone(misc_found)
        self.assertFalse(misc_found.get('is_downloadable', True))

    def test_misc_file_download_permission_enforcement(self): # Assuming 'viewmisc.txt' is the stored_filename
        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.misc_id_perm, 'misc_file', True, False)
        response = self.client.get(f'/misc_uploads/viewmisc.txt', headers=self.user_headers)
        self.assertEqual(response.status_code, 403)

        with app.app_context(): _set_permission_for_test(get_db(), self.testuser_id, self.misc_id_perm, 'misc_file', True, True)
        response = self.client.get(f'/misc_uploads/viewmisc.txt', headers=self.user_headers)
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            log = get_db().execute("SELECT * FROM download_log WHERE file_id = ? AND file_type = 'misc_file' AND user_id = ?", (self.misc_id_perm, self.testuser_id)).fetchone()
            self.assertIsNotNone(log)

    def test_no_login_access_denied(self):
        # Document
        response_doc_list = self.client.get('/api/documents') # No headers
        data_doc_list = json.loads(response_doc_list.data)
        # If user_id is None in the backend query for permissions, it won't match, so list will be empty of permissioned files
        self.assertFalse(any(doc['id'] == self.doc_id_perm for doc in data_doc_list['documents']))
        response_doc_dl = self.client.get(f'/official_uploads/docs/vpdoc.pdf')
        self.assertEqual(response_doc_dl.status_code, 401) # @jwt_required(optional=True) but then checks user_id
        
        # Patch
        response_patch_list = self.client.get('/api/patches')
        data_patch_list = json.loads(response_patch_list.data)
        self.assertFalse(any(p['id'] == self.patch_id_perm for p in data_patch_list['patches']))
        response_patch_dl = self.client.get(f'/official_uploads/patches/vppatch.zip')
        self.assertEqual(response_patch_dl.status_code, 401)

        # Link
        response_link_list = self.client.get('/api/links')
        data_link_list = json.loads(response_link_list.data)
        self.assertFalse(any(l['id'] == self.link_id_perm for l in data_link_list['links']))
        response_link_dl = self.client.get(f'/official_uploads/links/vplink.txt')
        self.assertEqual(response_link_dl.status_code, 401)

        # Misc File
        response_misc_list = self.client.get('/api/misc_files')
        data_misc_list = json.loads(response_misc_list.data)
        self.assertFalse(any(mf['id'] == self.misc_id_perm for mf in data_misc_list['misc_files']))
        response_misc_dl = self.client.get(f'/misc_uploads/viewmisc.txt')
        self.assertEqual(response_misc_dl.status_code, 401)


if __name__ == '__main__':
    unittest.main()
