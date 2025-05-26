import unittest
import json
import os
import tempfile

# Adjust the import path to go up one level to the parent directory where 'app.py' and 'database.py' are located
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

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
            tables = ["documents", "patches", "links", "misc_files", "software", "versions", "misc_categories", "users"]
            for table in tables:
                cursor.execute(f"DELETE FROM {table}")
            db.commit()

            # Sample Users (required for created_by_user_id etc.)
            cursor.execute("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                           (1, 'testadmin', 'hashed_password_admin', 'admin')) # Used for creating items
            cursor.execute("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                           (2, 'testuser', 'hashed_password_user', 'user'))
            cursor.execute("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                           (3, 'superadmin', 'hashed_password_superadmin', 'super_admin'))

            # Sample Software
            self.software1_id = 1
            cursor.execute("INSERT INTO software (id, name, description) VALUES (?, ?, ?)",
                           (self.software1_id, 'TestApp Alpha', 'A test application.'))
            self.software2_id = 2
            cursor.execute("INSERT INTO software (id, name, description) VALUES (?, ?, ?)",
                           (self.software2_id, 'Another Utility Tool', 'Some other tool.'))

            # Sample Versions
            self.version1_id = 1
            cursor.execute("""
                INSERT INTO versions (id, software_id, version_number, changelog, known_bugs, created_by_user_id, updated_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (self.version1_id, self.software1_id, '1.0.0', 'Initial public release.', 'Minor UI glitches.', 1, 1))
            self.version2_id = 2
            cursor.execute("""
                INSERT INTO versions (id, software_id, version_number, changelog, known_bugs, created_by_user_id, updated_by_user_id, release_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
            """, (self.version2_id, self.software1_id, 'Beta v2.1', 'Performance improvements and bug fixes.', 'Crashes sometimes on older hardware.', 1, 1))

            # Sample Documents - will use helper for tests needing specific docs
            self.doc1_id = self._create_test_document(db, self.software1_id, "User Manual Doc", "Content for manual", "PDF", user_id=1, stored_filename="manual.pdf")
            self.doc2_id = self._create_test_document(db, self.software1_id, "API Spec Doc", "API details", "Online", user_id=1, is_external=True, download_link="http://example.com/api")


            # Sample Patches - will use helper
            self.patch1_id = self._create_test_patch(db, self.version1_id, "Hotfix 1.0.1", "Bug fix patch", user_id=1, stored_filename="hotfix.zip")

            # Sample Links - will use helper
            self.link1_id = self._create_test_link(db, self.software1_id, self.version1_id, "TestApp Link", "Homepage link", user_id=1, is_external=True, url="http://example.com/testapp")

            # Sample Misc Categories
            self.misc_category1_id = 1
            cursor.execute("INSERT INTO misc_categories (id, name, description, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?)",
                           (self.misc_category1_id, 'Logos', 'Official company and product logos.', 1, 1))
            
            # Sample Misc Files - will use helper
            self.misc_file1_id = self._create_test_misc_file(db, self.misc_category1_id, user_id=1, title="Main Logo Misc", original_filename="logo.png", stored_filename="misc_logo.png")
            
            db.commit()

            # Store user details for easy access in tests
            self.super_admin_user = {'id': 3, 'username': 'superadmin', 'role': 'super_admin', 'password': 'superadminpassword'} # Add dummy password for token generation
            self.regular_user = {'id': 2, 'username': 'testuser', 'role': 'user', 'password': 'testuserpassword'}
            self.admin_creator_user = {'id': 1, 'username': 'testadmin', 'role': 'admin', 'password': 'testadminpassword'}


    def _get_auth_headers(self, username, password):
        """Helper to get auth headers for a user."""
        # Simulate token generation as done in app.py's login or a conftest fixture
        # For simplicity here, we'll assume a way to get a token.
        # In a real scenario, you'd call the login endpoint or use a fixture.
        # This is a placeholder - actual token generation needed.
        # For now, we'll mock the JWT part or focus on tests not requiring deep auth.
        # Let's assume we have a way to get a token for 'superadmin' and 'testuser'
        
        # Simplified: call login endpoint to get token
        response = self.client.post('/api/auth/login', json={
            'username': username,
            'password': password # This password must match the one used to create the user's hash
        })
        data = json.loads(response.data)
        if 'access_token' not in data:
            raise ValueError(f"Could not log in user {username} to get token. Response: {data}")
        return {'Authorization': f'Bearer {data["access_token"]}'}

    def _create_test_document(self, db, software_id, name, desc, doc_type, user_id, 
                              is_external=False, download_link=None, stored_filename=None, original_filename=None):
        if not is_external and not stored_filename:
            stored_filename = f"{name.replace(' ', '_').lower()}.dat"
        if not is_external and not download_link:
            download_link = f"/official_uploads/docs/{stored_filename}"
        if not original_filename and not is_external:
            original_filename = stored_filename

        cursor = db.execute("""
            INSERT INTO documents (software_id, doc_name, description, doc_type, is_external_link, download_link, 
                                   stored_filename, original_filename_ref, created_by_user_id, updated_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (software_id, name, desc, doc_type, is_external, download_link, 
              stored_filename if not is_external else None, 
              original_filename if not is_external else None, 
              user_id, user_id))
        return cursor.lastrowid

    def _create_test_patch(self, db, version_id, name, desc, user_id, 
                           is_external=False, download_link=None, stored_filename=None, original_filename=None):
        if not is_external and not stored_filename:
            stored_filename = f"{name.replace(' ', '_').lower()}.dat"
        if not is_external and not download_link:
            download_link = f"/official_uploads/patches/{stored_filename}"
        if not original_filename and not is_external:
            original_filename = stored_filename
            
        cursor = db.execute("""
            INSERT INTO patches (version_id, patch_name, description, is_external_link, download_link, 
                                 stored_filename, original_filename_ref, created_by_user_id, updated_by_user_id, release_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))
        """, (version_id, name, desc, is_external, download_link, 
              stored_filename if not is_external else None, 
              original_filename if not is_external else None, 
              user_id, user_id))
        return cursor.lastrowid

    def _create_test_link(self, db, software_id, version_id, title, desc, user_id, 
                          is_external=True, url=None, stored_filename=None, original_filename=None):
        if not url and is_external:
            url = "http://example.com/default_link"
        if not is_external and not stored_filename: # Uploaded file link
            stored_filename = f"{title.replace(' ', '_').lower()}.dat"
            url = f"/official_uploads/links/{stored_filename}" # URL becomes path for uploaded
        if not original_filename and not is_external:
            original_filename = stored_filename

        cursor = db.execute("""
            INSERT INTO links (software_id, version_id, title, description, is_external_link, url, 
                               stored_filename, original_filename_ref, created_by_user_id, updated_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (software_id, version_id, title, desc, is_external, url,
              stored_filename if not is_external else None, 
              original_filename if not is_external else None, 
              user_id, user_id))
        return cursor.lastrowid

    def _create_test_misc_file(self, db, category_id, user_id, title, desc="", original_filename=None, 
                               stored_filename=None, file_path_override=None):
        if not original_filename:
            original_filename = f"{title.replace(' ', '_').lower()}.dat"
        if not stored_filename:
            stored_filename = f"{original_filename}" # Simple for test
        
        file_path = file_path_override if file_path_override else f"/misc_uploads/{stored_filename}"

        cursor = db.execute("""
            INSERT INTO misc_files (misc_category_id, user_id, user_provided_title, user_provided_description, 
                                    original_filename, stored_filename, file_path, created_by_user_id, updated_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (category_id, user_id, title, desc, original_filename, stored_filename, file_path, user_id, user_id))
        return cursor.lastrowid

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

    # --- Permission Management Endpoint Tests (Super Admin) ---

    def test_grant_permission_document_view_only_as_superadmin(self):
        # Requires superadmin to be logged in, and a document and a user to grant permission to.
        # We need to ensure passwords are set for users to use _get_auth_headers
        with app.app_context():
            db = get_db()
            # Hash passwords for login helper (if not already done in setup)
            # This part is tricky without direct bcrypt access or a user creation fixture that returns password
            # For now, we'll assume testadmin and testuser have known passwords "adminpassword" and "userpassword"
            # and superadmin has "superadminpassword"
            # Re-create users with known passwords for token generation
            cursor = db.cursor()
            cursor.execute("DELETE FROM users") # Clear users to re-insert with known passwords
            from flask_bcrypt import Bcrypt
            flask_bcrypt = Bcrypt(app)

            users_data = [
                (self.admin_creator_user['id'], self.admin_creator_user['username'], flask_bcrypt.generate_password_hash(self.admin_creator_user['password']).decode('utf-8'), self.admin_creator_user['role']),
                (self.regular_user['id'], self.regular_user['username'], flask_bcrypt.generate_password_hash(self.regular_user['password']).decode('utf-8'), self.regular_user['role']),
                (self.super_admin_user['id'], self.super_admin_user['username'], flask_bcrypt.generate_password_hash(self.super_admin_user['password']).decode('utf-8'), self.super_admin_user['role'])
            ]
            cursor.executemany("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", users_data)
            db.commit()


        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        
        grant_payload = {
            "user_id": self.regular_user['id'],
            "item_id": self.doc1_id,
            "item_type": "document",
            "can_view": True,
            "can_download": False
        }
        response = self.client.post('/api/superadmin/permissions/grant', 
                                    json=grant_payload, 
                                    headers=super_admin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['user_id'], self.regular_user['id'])
        self.assertEqual(data['item_id'], self.doc1_id)
        self.assertEqual(data['item_type'], "document")
        self.assertTrue(data['can_view'])
        self.assertFalse(data['can_download'])

        # Verify in DB (optional, but good for confidence)
        with app.app_context():
            db = get_db()
            perm = db.execute("SELECT * FROM user_item_permissions WHERE user_id = ? AND item_id = ? AND item_type = ?",
                              (self.regular_user['id'], self.doc1_id, "document")).fetchone()
            self.assertIsNotNone(perm)
            self.assertTrue(perm['can_view'])
            self.assertFalse(perm['can_download'])

    def test_grant_permission_all_types_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        
        item_types_to_test = {
            "patch": self.patch1_id,
            "link": self.link1_id,
            "misc_file": self.misc_file1_id
        }

        for item_type, item_id_val in item_types_to_test.items():
            with self.subTest(item_type=item_type):
                grant_payload = {
                    "user_id": self.regular_user['id'], "item_id": item_id_val, "item_type": item_type,
                    "can_view": False, "can_download": True
                }
                response = self.client.post('/api/superadmin/permissions/grant', json=grant_payload, headers=super_admin_headers)
                self.assertEqual(response.status_code, 200, f"Failed for {item_type}")
                data = json.loads(response.data)
                self.assertFalse(data['can_view'], f"can_view should be False for {item_type}")
                self.assertTrue(data['can_download'], f"can_download should be True for {item_type}")

    def test_grant_permission_update_existing_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        # Initial grant: view only
        grant_payload_initial = {
            "user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document",
            "can_view": True, "can_download": False
        }
        self.client.post('/api/superadmin/permissions/grant', json=grant_payload_initial, headers=super_admin_headers)
        
        # Update: grant download as well
        grant_payload_update = {
            "user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document",
            "can_view": True, "can_download": True
        }
        response = self.client.post('/api/superadmin/permissions/grant', json=grant_payload_update, headers=super_admin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['can_view'])
        self.assertTrue(data['can_download'])

    def test_grant_permission_invalid_data_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        
        invalid_payloads = [
            ({"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "invalid_type", "can_view": True, "can_download": True}, 400), # Invalid item_type
            ({"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document", "can_view": "not_bool", "can_download": True}, 400), # Invalid can_view
            ({"user_id": 999, "item_id": self.doc1_id, "item_type": "document", "can_view": True, "can_download": True}, 404), # Non-existent user_id
            # ({ "user_id": self.regular_user['id'], "item_id": 999, "item_type": "document", "can_view": True, "can_download": True}, 404) # Non-existent item_id (conceptual)
        ]
        for payload, expected_status in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post('/api/superadmin/permissions/grant', json=payload, headers=super_admin_headers)
                self.assertEqual(response.status_code, expected_status)

    def test_revoke_permission_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        # First, grant a permission
        grant_payload = {"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document", "can_view": True, "can_download": True}
        self.client.post('/api/superadmin/permissions/grant', json=grant_payload, headers=super_admin_headers)

        # Then, revoke it
        revoke_payload = {"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document"}
        response = self.client.post('/api/superadmin/permissions/revoke', json=revoke_payload, headers=super_admin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['msg'], "Permission revoked successfully.")

        # Verify in DB
        with app.app_context():
            db = get_db()
            perm = db.execute("SELECT * FROM user_item_permissions WHERE user_id = ? AND item_id = ? AND item_type = ?",
                              (self.regular_user['id'], self.doc1_id, "document")).fetchone()
            self.assertIsNone(perm)

    def test_revoke_non_existent_permission_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        revoke_payload = {"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document"} # Assuming no permission exists yet
        response = self.client.post('/api/superadmin/permissions/revoke', json=revoke_payload, headers=super_admin_headers)
        self.assertEqual(response.status_code, 404) # Should be 404 if not found
        data = json.loads(response.data)
        self.assertIn("not found or already revoked", data['msg'].lower())

    def test_get_permissions_for_item_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        # Grant some permissions
        self.client.post('/api/superadmin/permissions/grant', json={"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document", "can_view": True, "can_download": False}, headers=super_admin_headers)
        self.client.post('/api/superadmin/permissions/grant', json={"user_id": self.admin_creator_user['id'], "item_id": self.doc1_id, "item_type": "document", "can_view": True, "can_download": True}, headers=super_admin_headers)

        response = self.client.get(f'/api/superadmin/permissions/item/document/{self.doc1_id}', headers=super_admin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data), 2)
        
        user_perms = {item['user_id']: item for item in data}
        self.assertTrue(user_perms[self.regular_user['id']]['can_view'])
        self.assertFalse(user_perms[self.regular_user['id']]['can_download'])
        self.assertTrue(user_perms[self.admin_creator_user['id']]['can_view'])
        self.assertTrue(user_perms[self.admin_creator_user['id']]['can_download'])
        self.assertEqual(user_perms[self.regular_user['id']]['username'], self.regular_user['username'])

    def test_get_permissions_for_user_as_superadmin(self):
        super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
        # Grant some permissions for regular_user
        self.client.post('/api/superadmin/permissions/grant', json={"user_id": self.regular_user['id'], "item_id": self.doc1_id, "item_type": "document", "can_view": True, "can_download": False}, headers=super_admin_headers)
        self.client.post('/api/superadmin/permissions/grant', json={"user_id": self.regular_user['id'], "item_id": self.patch1_id, "item_type": "patch", "can_view": False, "can_download": True}, headers=super_admin_headers)

        # Get all permissions for regular_user
        response = self.client.get(f'/api/superadmin/permissions/user/{self.regular_user["id"]}', headers=super_admin_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data), 2)

        # Get only document permissions for regular_user
        response_filtered = self.client.get(f'/api/superadmin/permissions/user/{self.regular_user["id"]}?item_type=document', headers=super_admin_headers)
        self.assertEqual(response_filtered.status_code, 200)
        data_filtered = json.loads(response_filtered.data)
        self.assertEqual(len(data_filtered), 1)
        self.assertEqual(data_filtered[0]['item_type'], 'document')
        self.assertEqual(data_filtered[0]['item_id'], self.doc1_id)
        self.assertTrue(data_filtered[0]['can_view'])
        self.assertFalse(data_filtered[0]['can_download'])

    # --- End Permission Management Endpoint Tests ---

# Separate class for testing item listing with permissions
class TestItemListingPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(INSTANCE_FOLDER_PATH):
            os.makedirs(INSTANCE_FOLDER_PATH)
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
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
            tables = ["user_item_permissions", "documents", "patches", "links", "misc_files", "software", "versions", "misc_categories", "users"]
            for table in tables:
                cursor.execute(f"DELETE FROM {table}")
            db.commit()

            from flask_bcrypt import Bcrypt
            flask_bcrypt = Bcrypt(app)

            # Users for permission testing
            self.super_admin_user = {'id': 1, 'username': 'superadmin_perm', 'password': 'password', 'role': 'super_admin'}
            self.user_A = {'id': 2, 'username': 'userA_perm', 'password': 'passwordA', 'role': 'user'}
            self.user_B = {'id': 3, 'username': 'userB_perm', 'password': 'passwordB', 'role': 'user'}
            
            users_data = [
                (self.super_admin_user['id'], self.super_admin_user['username'], flask_bcrypt.generate_password_hash(self.super_admin_user['password']).decode('utf-8'), self.super_admin_user['role']),
                (self.user_A['id'], self.user_A['username'], flask_bcrypt.generate_password_hash(self.user_A['password']).decode('utf-8'), self.user_A['role']),
                (self.user_B['id'], self.user_B['username'], flask_bcrypt.generate_password_hash(self.user_B['password']).decode('utf-8'), self.user_B['role'])
            ]
            cursor.executemany("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", users_data)
            
            # Common Software and Version for items
            self.software_id = 1
            self.version_id = 1
            cursor.execute("INSERT INTO software (id, name) VALUES (?, ?)", (self.software_id, "PermTest Software"))
            cursor.execute("INSERT INTO versions (id, software_id, version_number, created_by_user_id) VALUES (?, ?, ?, ?)", 
                           (self.version_id, self.software_id, "1.0", self.super_admin_user['id']))
            
            # Create test items
            self.doc_A_id = self._create_item_for_perm_test(db, "document", "Doc A - UserA View", self.super_admin_user['id'], software_id=self.software_id)
            self.doc_B_id = self._create_item_for_perm_test(db, "document", "Doc B - UserA No View", self.super_admin_user['id'], software_id=self.software_id)
            self.doc_C_id = self._create_item_for_perm_test(db, "document", "Doc C - Default", self.super_admin_user['id'], software_id=self.software_id)

            self.patch_A_id = self._create_item_for_perm_test(db, "patch", "Patch A - UserA View", self.super_admin_user['id'], version_id=self.version_id)
            self.patch_B_id = self._create_item_for_perm_test(db, "patch", "Patch B - UserA No View", self.super_admin_user['id'], version_id=self.version_id)
            self.patch_C_id = self._create_item_for_perm_test(db, "patch", "Patch C - Default", self.super_admin_user['id'], version_id=self.version_id)
            
            # For links, ensure version_id and software_id are passed if required by _create_item_for_perm_test
            self.misc_category_id = 1
            cursor.execute("INSERT INTO misc_categories (id, name, created_by_user_id) VALUES (?, ?, ?)", 
                           (self.misc_category_id, "Test Category", self.super_admin_user['id']))

            self.link_A_id = self._create_item_for_perm_test(db, "link", "Link A - UserA View", self.super_admin_user['id'], software_id=self.software_id, version_id=self.version_id)
            self.link_B_id = self._create_item_for_perm_test(db, "link", "Link B - UserA No View", self.super_admin_user['id'], software_id=self.software_id, version_id=self.version_id)
            self.link_C_id = self._create_item_for_perm_test(db, "link", "Link C - Default", self.super_admin_user['id'], software_id=self.software_id, version_id=self.version_id)

            self.misc_file_A_id = self._create_item_for_perm_test(db, "misc_file", "Misc A - UserA View", self.super_admin_user['id'], category_id=self.misc_category_id)
            self.misc_file_B_id = self._create_item_for_perm_test(db, "misc_file", "Misc B - UserA No View", self.super_admin_user['id'], category_id=self.misc_category_id)
            self.misc_file_C_id = self._create_item_for_perm_test(db, "misc_file", "Misc C - Default", self.super_admin_user['id'], category_id=self.misc_category_id)


            # Grant permissions using API (requires logging in super_admin)
            self.super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
            
            # Document Permissions
            self._grant_permission_api(self.user_A['id'], self.doc_A_id, "document", True, True) 
            self._grant_permission_api(self.user_A['id'], self.doc_B_id, "document", False, False)

            # Patch Permissions
            self._grant_permission_api(self.user_A['id'], self.patch_A_id, "patch", True, False) # View only
            self._grant_permission_api(self.user_A['id'], self.patch_B_id, "patch", False, True) # Download only (implies view false)

            # Link Permissions
            self._grant_permission_api(self.user_A['id'], self.link_A_id, "link", True, True)
            self._grant_permission_api(self.user_A['id'], self.link_B_id, "link", False, False)

            # Misc File Permissions
            self._grant_permission_api(self.user_A['id'], self.misc_file_A_id, "misc_file", True, True)
            self._grant_permission_api(self.user_A['id'], self.misc_file_B_id, "misc_file", False, False)

            db.commit()

    def _get_auth_headers(self, username, password):
        response = self.client.post('/api/auth/login', json={'username': username, 'password': password})
        data = json.loads(response.data)
        self.assertIn('access_token', data, f"Login failed for {username}")
        return {'Authorization': f'Bearer {data["access_token"]}'}

    def _create_item_for_perm_test(self, db, item_type, name_prefix, user_id, 
                                   software_id=None, version_id=None, category_id=None,
                                   is_external=False, url=None, stored_filename_override=None):
        # Simplified item creation for permission tests
        # Ensure software_id and version_id are provided if needed by the item type
        if software_id is None: software_id = self.software_id
        if version_id is None: version_id = self.version_id
        if category_id is None and item_type == "misc_file": category_id = self.misc_category_id

        original_filename = f"{name_prefix.replace(' ', '_').lower()}.dat"
        stored_filename = stored_filename_override or original_filename

        if item_type == "document":
            dl_link = url if is_external else f"/official_uploads/docs/{stored_filename}"
            cursor = db.execute("INSERT INTO documents (software_id, doc_name, description, created_by_user_id, is_external_link, download_link, stored_filename, original_filename_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                (software_id, name_prefix, f"Desc for {name_prefix}", user_id, is_external, dl_link, stored_filename if not is_external else None, original_filename if not is_external else None))
        elif item_type == "patch":
            dl_link = url if is_external else f"/official_uploads/patches/{stored_filename}"
            cursor = db.execute("INSERT INTO patches (version_id, patch_name, description, created_by_user_id, is_external_link, download_link, stored_filename, original_filename_ref, release_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))",
                                (version_id, name_prefix, f"Desc for {name_prefix}", user_id, is_external, dl_link, stored_filename if not is_external else None, original_filename if not is_external else None))
        elif item_type == "link":
            # For links, URL is mandatory. If it's an uploaded file, URL is its server path.
            actual_url = url if is_external else (f"/official_uploads/links/{stored_filename}" if not url else url)
            cursor = db.execute("INSERT INTO links (software_id, version_id, title, description, created_by_user_id, is_external_link, url, stored_filename, original_filename_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                (software_id, version_id, name_prefix, f"Desc for {name_prefix}", user_id, is_external, actual_url, stored_filename if not is_external else None, original_filename if not is_external else None))
        elif item_type == "misc_file":
            file_path = f"/misc_uploads/{stored_filename}"
            cursor = db.execute("INSERT INTO misc_files (misc_category_id, user_id, user_provided_title, original_filename, stored_filename, file_path, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                (category_id, user_id, name_prefix, original_filename, stored_filename, file_path, user_id))
        else:
            raise ValueError(f"Unsupported item_type for _create_item_for_perm_test: {item_type}")
        return cursor.lastrowid
    
    def _grant_permission_api(self, user_id, item_id, item_type, can_view, can_download):
        payload = {"user_id": user_id, "item_id": item_id, "item_type": item_type, "can_view": can_view, "can_download": can_download}
        response = self.client.post('/api/superadmin/permissions/grant', json=payload, headers=self.super_admin_headers)
        self.assertEqual(response.status_code, 200, f"Failed to grant permission for item {item_id} to user {user_id}")


    def test_list_documents_permissions_user_a(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get('/api/documents', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        docs_data = data['documents']
        doc_names_returned = [doc['doc_name'] for doc in docs_data]

        self.assertIn("Doc A - UserA View", doc_names_returned, "Doc A should be visible to User A")
        self.assertNotIn("Doc B - UserA No View", doc_names_returned, "Doc B should NOT be visible to User A")
        self.assertIn("Doc C - Default", doc_names_returned, "Doc C should be visible to User A by default")

        for doc in docs_data:
            if doc['id'] == self.doc_A_id:
                self.assertTrue(doc['permissions']['can_view'])
                self.assertTrue(doc['permissions']['can_download']) # As granted
            elif doc['id'] == self.doc_C_id: # Default permissions
                self.assertTrue(doc['permissions']['can_view'])
                self.assertTrue(doc['permissions']['can_download']) 

    def test_list_documents_permissions_user_b_default_access(self):
        user_b_headers = self._get_auth_headers(self.user_B['username'], self.user_B['password'])
        response = self.client.get('/api/documents', headers=user_b_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        docs_data = data['documents']
        doc_names_returned = [doc['doc_name'] for doc in docs_data]

        # User B has no specific rules, so all should be visible by default view policy
        self.assertIn("Doc A - UserA View", doc_names_returned)
        self.assertIn("Doc B - UserA No View", doc_names_returned) # User A's rule for Doc B doesn't affect User B
        self.assertIn("Doc C - Default", doc_names_returned)

        for doc in docs_data: # All should have default view=T, download=T for User B
            self.assertTrue(doc['permissions']['can_view'])
            self.assertTrue(doc['permissions']['can_download'])

    def test_list_documents_permissions_anonymous_default_access(self):
        response = self.client.get('/api/documents') # No headers
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        docs_data = data['documents']
        doc_names_returned = [doc['doc_name'] for doc in docs_data]

        self.assertIn("Doc A - UserA View", doc_names_returned)
        self.assertIn("Doc B - UserA No View", doc_names_returned)
        self.assertIn("Doc C - Default", doc_names_returned)
        
        for doc in docs_data: # All should have default view=T, download=T for anonymous
            self.assertTrue(doc['permissions']['can_view'])
            self.assertTrue(doc['permissions']['can_download'])

    # TODO: Add similar tests for /api/patches, /api/links, /api/misc_files
    def test_list_patches_permissions_user_a(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get('/api/patches', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        patches_data = data['patches']
        patch_names_returned = [p['patch_name'] for p in patches_data]

        self.assertIn("Patch A - UserA View", patch_names_returned)
        self.assertNotIn("Patch B - UserA No View", patch_names_returned) # View is false, even if download is true
        self.assertIn("Patch C - Default", patch_names_returned)

        for p in patches_data:
            if p['id'] == self.patch_A_id:
                self.assertTrue(p['permissions']['can_view'])
                self.assertFalse(p['permissions']['can_download']) # Granted view True, download False
            elif p['id'] == self.patch_C_id:
                self.assertTrue(p['permissions']['can_view'])      # Default
                self.assertTrue(p['permissions']['can_download']) # Default

    def test_list_links_permissions_user_a(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get('/api/links', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        links_data = data['links']
        link_titles_returned = [link['title'] for link in links_data]

        self.assertIn("Link A - UserA View", link_titles_returned)
        self.assertNotIn("Link B - UserA No View", link_titles_returned)
        self.assertIn("Link C - Default", link_titles_returned)
        
        for link in links_data:
            if link['id'] == self.link_A_id:
                self.assertTrue(link['permissions']['can_view'])
                self.assertTrue(link['permissions']['can_download'])
            elif link['id'] == self.link_C_id:
                self.assertTrue(link['permissions']['can_view'])
                self.assertTrue(link['permissions']['can_download'])

    def test_list_misc_files_permissions_user_a(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get('/api/misc_files', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        misc_files_data = data['misc_files']
        misc_titles_returned = [mf['user_provided_title'] for mf in misc_files_data]

        self.assertIn("Misc A - UserA View", misc_titles_returned)
        self.assertNotIn("Misc B - UserA No View", misc_titles_returned)
        self.assertIn("Misc C - Default", misc_titles_returned)

        for mf in misc_files_data:
            if mf['id'] == self.misc_file_A_id:
                self.assertTrue(mf['permissions']['can_view'])
                self.assertTrue(mf['permissions']['can_download'])
            elif mf['id'] == self.misc_file_C_id:
                self.assertTrue(mf['permissions']['can_view'])
                self.assertTrue(mf['permissions']['can_download'])

# Class for File Serving Permission Tests
class TestFileServingPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(INSTANCE_FOLDER_PATH): os.makedirs(INSTANCE_FOLDER_PATH)
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
        # Ensure upload folders exist
        for folder_key in ['DOC_UPLOAD_FOLDER', 'PATCH_UPLOAD_FOLDER', 'LINK_UPLOAD_FOLDER', 'MISC_UPLOAD_FOLDER']:
            folder_path = os.path.join(INSTANCE_FOLDER_PATH, 'official_uploads_test', folder_key.split('_')[0].lower()) # Simplified path
            if not os.path.exists(folder_path): os.makedirs(folder_path)
            app.config[folder_key] = folder_path # Override app config to use test folders

        with app.app_context(): init_db(cls.db_path)

    @classmethod
    def tearDownClass(cls):
        os.close(cls.db_fd)
        os.unlink(cls.db_path)
        # Clean up test upload folders
        for folder_key in ['DOC_UPLOAD_FOLDER', 'PATCH_UPLOAD_FOLDER', 'LINK_UPLOAD_FOLDER', 'MISC_UPLOAD_FOLDER']:
            folder_path = app.config[folder_key]
            if os.path.exists(folder_path): shutil.rmtree(folder_path)


    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db = get_db()
            cursor = db.cursor()
            tables = ["user_item_permissions", "documents", "patches", "links", "misc_files", "software", "versions", "misc_categories", "users"]
            for table in tables: cursor.execute(f"DELETE FROM {table}")
            db.commit()

            from flask_bcrypt import Bcrypt
            flask_bcrypt = Bcrypt(app)

            self.super_admin_user = {'id': 1, 'username': 'superadmin_fileserv', 'password': 'password', 'role': 'super_admin'}
            self.user_A = {'id': 2, 'username': 'userA_fileserv', 'password': 'passwordA', 'role': 'user'}
            self.user_B = {'id': 3, 'username': 'userB_fileserv', 'password': 'passwordB', 'role': 'user'}
            users_data = [
                (self.super_admin_user['id'], self.super_admin_user['username'], flask_bcrypt.generate_password_hash(self.super_admin_user['password']).decode('utf-8'), self.super_admin_user['role']),
                (self.user_A['id'], self.user_A['username'], flask_bcrypt.generate_password_hash(self.user_A['password']).decode('utf-8'), self.user_A['role']),
                (self.user_B['id'], self.user_B['username'], flask_bcrypt.generate_password_hash(self.user_B['password']).decode('utf-8'), self.user_B['role'])
            ]
            cursor.executemany("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", users_data)
            
            self.software_id = 1
            cursor.execute("INSERT INTO software (id, name) VALUES (?, ?)", (self.software_id, "FileServe Software"))
            
            # Create a test document with a physical file
            self.test_doc_filename = "test_document_for_download.txt"
            self.test_doc_content = b"This is a test document for download."
            doc_path = os.path.join(app.config['DOC_UPLOAD_FOLDER'], self.test_doc_filename)
            with open(doc_path, 'wb') as f: f.write(self.test_doc_content)
            
            self.doc_download_id = TestAPISearch()._create_test_document( # Use helper from other class for consistency
                db, self.software_id, "Downloadable Doc", "Test file serving", "TXT", self.super_admin_user['id'],
                stored_filename=self.test_doc_filename, original_filename=self.test_doc_filename
            )
            db.commit()
            self.super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])

    def _get_auth_headers(self, username, password):
        response = self.client.post('/api/auth/login', json={'username': username, 'password': password})
        data = json.loads(response.data)
        self.assertIn('access_token', data, f"Login failed for {username}")
        return {'Authorization': f'Bearer {data["access_token"]}'}

    def _grant_permission_api(self, user_id, item_id, item_type, can_view, can_download):
        payload = {"user_id": user_id, "item_id": item_id, "item_type": item_type, "can_view": can_view, "can_download": can_download}
        response = self.client.post('/api/superadmin/permissions/grant', json=payload, headers=self.super_admin_headers)
        self.assertEqual(response.status_code, 200, f"Failed to grant permission for item {item_id} to user {user_id}")

    def test_serve_document_user_a_can_download(self):
        self._grant_permission_api(self.user_A['id'], self.doc_download_id, "document", True, True)
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get(f"/official_uploads/docs/{self.test_doc_filename}", headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.test_doc_content)

    def test_serve_document_user_a_cannot_download(self):
        self._grant_permission_api(self.user_A['id'], self.doc_download_id, "document", True, False) # Can view, cannot download
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get(f"/official_uploads/docs/{self.test_doc_filename}", headers=user_a_headers)
        self.assertEqual(response.status_code, 403)
        data = json.loads(response.data)
        self.assertIn("You do not have permission", data['msg'])

    def test_serve_document_user_b_default_download(self): # No specific rule for User B
        user_b_headers = self._get_auth_headers(self.user_B['username'], self.user_B['password'])
        response = self.client.get(f"/official_uploads/docs/{self.test_doc_filename}", headers=user_b_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.test_doc_content)
        
    def test_serve_document_anonymous_default_download(self):
        response = self.client.get(f"/official_uploads/docs/{self.test_doc_filename}") # No auth
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, self.test_doc_content)
        
    # TODO: Add similar file serving tests for patches, links (uploaded files), and misc_files
    def _create_physical_file(self, folder_key, filename, content=b"test content"):
        filepath = os.path.join(app.config[folder_key], filename)
        with open(filepath, 'wb') as f:
            f.write(content)
        return filepath

    def test_serve_patch_user_a_can_download(self):
        test_patch_filename = "test_patch.zip"
        self._create_physical_file('PATCH_UPLOAD_FOLDER', test_patch_filename)
        with app.app_context():
            db = get_db()
            patch_id = TestAPISearch()._create_test_patch(db, 1, "Downloadable Patch", "Test patch serving", self.super_admin_user['id'], stored_filename=test_patch_filename) # Assuming version_id 1 exists
            db.commit()
        
        self._grant_permission_api(self.user_A['id'], patch_id, "patch", True, True)
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get(f"/official_uploads/patches/{test_patch_filename}", headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"test content")

    def test_serve_link_file_user_a_cannot_download(self):
        test_link_filename = "test_link_file.pdf"
        self._create_physical_file('LINK_UPLOAD_FOLDER', test_link_filename)
        with app.app_context():
            db = get_db()
            # software_id and version_id are required for links.
            link_id = TestAPISearch()._create_test_link(db, self.software_id, 1, "Non-Downloadable Link File", "Test link file serving", 
                                                        self.super_admin_user['id'], is_external=False, 
                                                        stored_filename=test_link_filename, url=f"/official_uploads/links/{test_link_filename}")
            db.commit()

        self._grant_permission_api(self.user_A['id'], link_id, "link", True, False) # View True, Download False
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get(f"/official_uploads/links/{test_link_filename}", headers=user_a_headers)
        self.assertEqual(response.status_code, 403)
        
    def test_serve_misc_file_anonymous_default_download(self):
        test_misc_filename = "test_misc_file.dat"
        self._create_physical_file('MISC_UPLOAD_FOLDER', test_misc_filename)
        with app.app_context():
            db = get_db()
            # misc_category_id is required. Assuming category 1 exists or create it.
            cursor = db.cursor()
            cursor.execute("INSERT OR IGNORE INTO misc_categories (id, name, created_by_user_id) VALUES (?, ?, ?)", 
                           (1, "Default Test Category", self.super_admin_user['id']))
            misc_file_id = TestAPISearch()._create_test_misc_file(db, 1, self.super_admin_user['id'], "Downloadable Misc File", 
                                                                  original_filename=test_misc_filename, stored_filename=test_misc_filename)
            db.commit()

        response = self.client.get(f"/misc_uploads/{test_misc_filename}") # Anonymous
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"test content")


class TestSearchPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(INSTANCE_FOLDER_PATH): os.makedirs(INSTANCE_FOLDER_PATH)
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix='.db', dir=INSTANCE_FOLDER_PATH)
        app.config['DATABASE'] = cls.db_path
        app.config['TESTING'] = True
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
            tables = ["user_item_permissions", "documents", "patches", "links", "misc_files", "software", "versions", "misc_categories", "users"]
            for table in tables: cursor.execute(f"DELETE FROM {table}")
            db.commit()

            from flask_bcrypt import Bcrypt
            flask_bcrypt = Bcrypt(app)

            self.super_admin_user = {'id': 1, 'username': 'superadmin_search', 'password': 'password', 'role': 'super_admin'}
            self.user_A = {'id': 2, 'username': 'userA_search', 'password': 'passwordA', 'role': 'user'}
            users_data = [
                (self.super_admin_user['id'], self.super_admin_user['username'], flask_bcrypt.generate_password_hash(self.super_admin_user['password']).decode('utf-8'), self.super_admin_user['role']),
                (self.user_A['id'], self.user_A['username'], flask_bcrypt.generate_password_hash(self.user_A['password']).decode('utf-8'), self.user_A['role']),
            ]
            cursor.executemany("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", users_data)
            
            self.software1_id = 1
            cursor.execute("INSERT INTO software (id, name) VALUES (?, ?)", (self.software1_id, "SearchTest Software"))
            self.version1_id = 1
            cursor.execute("INSERT INTO versions (id, software_id, version_number, created_by_user_id) VALUES (?, ?, ?, ?)", 
                           (self.version1_id, self.software1_id, "1.0", self.super_admin_user['id']))
            self.misc_category1_id = 1
            cursor.execute("INSERT INTO misc_categories (id, name, created_by_user_id) VALUES (?, ?, ?)", 
                           (self.misc_category1_id, "Search Category", self.super_admin_user['id']))
            db.commit() # Commit users, software, version, category

            # Use TestAPISearch helpers, need an instance
            api_search_test_instance = TestAPISearch()
            api_search_test_instance.setUpClass() # To set up its own db if it uses a separate one - this is problematic.
                                               # Better to make helpers static or part of a shared base class if they don't rely on instance state.
                                               # For now, let's assume TestAPISearch helpers can be called if we ensure its db setup is compatible or not needed.
                                               # Simplified: calling them directly might work if they only use the db object passed.
            
            # Create items
            self.doc1 = api_search_test_instance._create_test_document(db, self.software1_id, "Alpha Document CommonTerm", "Desc", "PDF", self.super_admin_user['id'])
            self.doc2 = api_search_test_instance._create_test_document(db, self.software1_id, "Beta Document SpecificTerm", "Desc", "PDF", self.super_admin_user['id'])
            self.patch1 = api_search_test_instance._create_test_patch(db, self.version1_id, "Alpha Patch CommonTerm", "Desc", self.super_admin_user['id'])
            self.patch2 = api_search_test_instance._create_test_patch(db, self.version1_id, "Beta Patch Other", "Desc", self.super_admin_user['id'])
            # Links and MiscFiles are not currently part of ALLOWED_ITEM_TYPES for granular permissions, but search might return them.
            # For search, we need to ensure the 'type' field matches what check_item_permission expects if it's an allowed type.

            db.commit()

            self.super_admin_headers = self._get_auth_headers(self.super_admin_user['username'], self.super_admin_user['password'])
            # Grant permissions for User A
            # User A can see Alpha Doc and Alpha Patch, but not Beta Doc.
            self._grant_permission_api(self.user_A['id'], self.doc1, "document", True, True)
            self._grant_permission_api(self.user_A['id'], self.doc2, "document", False, False) # Cannot view Beta Doc
            self._grant_permission_api(self.user_A['id'], self.patch1, "patch", True, False)   # Can view Alpha Patch, no download
            # Patch2 has no specific rule for User A (default access)

    def _get_auth_headers(self, username, password):
        response = self.client.post('/api/auth/login', json={'username': username, 'password': password})
        data = json.loads(response.data)
        self.assertIn('access_token', data, f"Login failed for {username}")
        return {'Authorization': f'Bearer {data["access_token"]}'}

    def _grant_permission_api(self, user_id, item_id, item_type, can_view, can_download):
        payload = {"user_id": user_id, "item_id": item_id, "item_type": item_type, "can_view": can_view, "can_download": can_download}
        response = self.client.post('/api/superadmin/permissions/grant', json=payload, headers=self.super_admin_headers)
        self.assertEqual(response.status_code, 200, f"Failed to grant permission for item {item_id} type {item_type} to user {user_id}")

    def test_search_permissions_user_a(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        response = self.client.get('/api/search?q=CommonTerm', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        returned_names = [item['name'] for item in data]
        self.assertIn("Alpha Document CommonTerm", returned_names)
        self.assertIn("Alpha Patch CommonTerm", returned_names)

        for item in data:
            if item['id'] == self.doc1: # Alpha Document
                self.assertTrue(item['permissions']['can_view'])
                self.assertTrue(item['permissions']['can_download'])
            elif item['id'] == self.patch1: # Alpha Patch
                self.assertTrue(item['permissions']['can_view'])
                self.assertFalse(item['permissions']['can_download'])
            # Beta Document SpecificTerm (if matched by CommonTerm somehow, shouldn't be here due to no view)
            # Beta Patch Other (if matched by CommonTerm, should be here by default)
            # Ensure items User A cannot view are not present, e.g. self.doc2
            self.assertNotIn(self.doc2, [i['id'] for i in data if i['type'] == 'document'], "Doc2 (Beta Document) should not be in results for User A")

    def test_search_permissions_user_b_default_access(self):
        # User B has no specific permissions set up, so relies on default access.
        user_b_headers = self._get_auth_headers(self.user_B['username'], self.user_B['password'])
        response = self.client.get('/api/search?q=CommonTerm', headers=user_b_headers) # Should match doc1 and patch1
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        returned_ids_types = {(item['id'], item['type']) for item in data}
        self.assertIn((self.doc1, "document"), returned_ids_types)
        self.assertIn((self.patch1, "patch"), returned_ids_types)

        for item in data:
            if item['type'] in app.config.get('ALLOWED_ITEM_TYPES', []): # Check if it's a type that has granular perms
                self.assertTrue(item['permissions']['can_view'])
                self.assertTrue(item['permissions']['can_download'])

        # Search for something User A cannot see, User B should see it by default
        response_beta = self.client.get('/api/search?q=Beta Document SpecificTerm', headers=user_b_headers)
        self.assertEqual(response_beta.status_code, 200)
        data_beta = json.loads(response_beta.data)
        found_doc2 = next((item for item in data_beta if item['id'] == self.doc2 and item['type'] == 'document'), None)
        self.assertIsNotNone(found_doc2)
        if found_doc2:
            self.assertTrue(found_doc2['permissions']['can_view'])
            self.assertTrue(found_doc2['permissions']['can_download'])


    def test_search_permissions_anonymous_default_access(self):
        response = self.client.get('/api/search?q=CommonTerm') # No auth headers
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        returned_ids_types = {(item['id'], item['type']) for item in data}
        self.assertIn((self.doc1, "document"), returned_ids_types)
        self.assertIn((self.patch1, "patch"), returned_ids_types)

        for item in data:
            if item['type'] in app.config.get('ALLOWED_ITEM_TYPES', []):
                self.assertTrue(item['permissions']['can_view'])
                self.assertTrue(item['permissions']['can_download'])

        # Search for something User A cannot see, anonymous should see it by default
        response_beta = self.client.get('/api/search?q=Beta Document SpecificTerm')
        self.assertEqual(response_beta.status_code, 200)
        data_beta = json.loads(response_beta.data)
        found_doc2 = next((item for item in data_beta if item['id'] == self.doc2 and item['type'] == 'document'), None)
        self.assertIsNotNone(found_doc2)
        if found_doc2:
            self.assertTrue(found_doc2['permissions']['can_view'])
            self.assertTrue(found_doc2['permissions']['can_download'])

    def test_search_permissions_user_a_term_matches_non_viewable(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        # "SpecificTerm" only matches doc2, which user_A cannot view
        response = self.client.get('/api/search?q=SpecificTerm', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        # Ensure doc2 is NOT in the results
        self.assertFalse(any(item['id'] == self.doc2 and item['type'] == 'document' for item in data))

    # --- End Search Permission Tests ---

    def test_search_permissions_user_b_default_access(self):
        # User B has no specific permissions set up, so relies on default access.
        user_b_headers = self._get_auth_headers(self.user_B['username'], self.user_B['password'])
        response = self.client.get('/api/search?q=CommonTerm', headers=user_b_headers) # Should match doc1 and patch1
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        returned_ids_types = {(item['id'], item['type']) for item in data}
        self.assertIn((self.doc1, "document"), returned_ids_types)
        self.assertIn((self.patch1, "patch"), returned_ids_types)

        for item in data:
            # Default permissions for User B are True/True
            self.assertTrue(item['permissions']['can_view'])
            self.assertTrue(item['permissions']['can_download'])

        # Search for something User A cannot see, User B should see it by default
        response_beta = self.client.get('/api/search?q=Beta Document SpecificTerm', headers=user_b_headers)
        self.assertEqual(response_beta.status_code, 200)
        data_beta = json.loads(response_beta.data)
        self.assertTrue(any(item['id'] == self.doc2 and item['type'] == 'document' for item in data_beta))
        doc2_item = next(item for item in data_beta if item['id'] == self.doc2)
        self.assertTrue(doc2_item['permissions']['can_view'])
        self.assertTrue(doc2_item['permissions']['can_download'])


    def test_search_permissions_anonymous_default_access(self):
        response = self.client.get('/api/search?q=CommonTerm') # No auth headers
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        returned_ids_types = {(item['id'], item['type']) for item in data}
        self.assertIn((self.doc1, "document"), returned_ids_types)
        self.assertIn((self.patch1, "patch"), returned_ids_types)

        for item in data:
            # Default permissions for anonymous are True/True
            self.assertTrue(item['permissions']['can_view'])
            self.assertTrue(item['permissions']['can_download'])

        # Search for something User A cannot see, anonymous should see it by default
        response_beta = self.client.get('/api/search?q=Beta Document SpecificTerm')
        self.assertEqual(response_beta.status_code, 200)
        data_beta = json.loads(response_beta.data)
        self.assertTrue(any(item['id'] == self.doc2 and item['type'] == 'document' for item in data_beta))
        doc2_item = next(item for item in data_beta if item['id'] == self.doc2)
        self.assertTrue(doc2_item['permissions']['can_view'])
        self.assertTrue(doc2_item['permissions']['can_download'])

    def test_search_permissions_user_a_term_matches_non_viewable(self):
        user_a_headers = self._get_auth_headers(self.user_A['username'], self.user_A['password'])
        # "SpecificTerm" only matches doc2, which user_A cannot view
        response = self.client.get('/api/search?q=SpecificTerm', headers=user_a_headers)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        # Ensure doc2 is NOT in the results
        self.assertFalse(any(item['id'] == self.doc2 and item['type'] == 'document' for item in data))


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
        response_misc_orig = self.client.get('/api/search?q=ui_screenshot.jpg')
        self._assert_common_search_response_structure(response_misc_orig)
        data_misc_orig = json.loads(response_misc_orig.data)
        self.assertTrue(any(item.get('original_filename','').lower() == 'ui_screenshot.jpg' and item['type'] == 'misc_file' for item in data_misc_orig), "Case-insensitive search for 'ui_screenshot.jpg' failed in misc_file original_filename.")


if __name__ == '__main__':
    unittest.main()
