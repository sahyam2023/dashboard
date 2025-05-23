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
                           (1, 'testadmin', 'hashed_password', 'admin'))
            cursor.execute("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
                           (2, 'testuser', 'hashed_password', 'user'))

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
        response_misc_orig = self.client.get('/api/search?q=ui_screenshot.jpg')
        self._assert_common_search_response_structure(response_misc_orig)
        data_misc_orig = json.loads(response_misc_orig.data)
        self.assertTrue(any(item.get('original_filename','').lower() == 'ui_screenshot.jpg' and item['type'] == 'misc_file' for item in data_misc_orig), "Case-insensitive search for 'ui_screenshot.jpg' failed in misc_file original_filename.")


if __name__ == '__main__':
    unittest.main()
