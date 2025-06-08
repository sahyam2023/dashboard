import pytest
import os
import tempfile
from app import app as flask_app # Assuming your Flask app instance is named 'app' in 'app.py'
from app import- show quoted text -
from database import init_db, get_db_connection # Assuming these are in 'database.py'

@pytest.fixture(scope='session')
def app():
    """Session-wide test Flask application."""

    # Create a temporary file for the SQLite DB
    db_fd, db_path = tempfile.mkstemp(suffix='.db')

    flask_app.config.update({
        "TESTING": True,
        "DATABASE": db_path,
        "JWT_SECRET_KEY": "test-jwt-secret-key", # Ensure this is set for testing
        "SECRET_KEY": "test-secret-key",
        # Add any other necessary test configurations
        "CHAT_UPLOAD_FOLDER": os.path.join(tempfile.gettempdir(), "pytest_chat_uploads"),
        "INSTANCE_FOLDER_PATH": os.path.join(tempfile.gettempdir(), "pytest_instance"),
    })

    # Ensure necessary folders exist
    if not os.path.exists(flask_app.config["CHAT_UPLOAD_FOLDER"]):
        os.makedirs(flask_app.config["CHAT_UPLOAD_FOLDER"], exist_ok=True)
    if not os.path.exists(flask_app.config["INSTANCE_FOLDER_PATH"]):
        os.makedirs(flask_app.config["INSTANCE_FOLDER_PATH"], exist_ok=True)

    with flask_app.app_context():
        init_db(db_path) # Initialize the database schema

    yield flask_app

    # Clean up: close and remove the temporary database file
    os.close(db_fd)
    os.unlink(db_path)
    # Clean up temporary upload folders
    if os.path.exists(flask_app.config["CHAT_UPLOAD_FOLDER"]):
        # Be careful with rmtree, ensure it's a test-specific folder
        import shutil
        shutil.rmtree(flask_app.config["CHAT_UPLOAD_FOLDER"])
    if os.path.exists(flask_app.config["INSTANCE_FOLDER_PATH"]):
        import shutil
        shutil.rmtree(flask_app.config["INSTANCE_FOLDER_PATH"])


@pytest.fixture()
def client(app):
    """A test client for the app."""
    return app.test_client()

@pytest.fixture()
def db(app):
    """Provides the database connection for tests, ensuring it's within app context."""
    with app.app_context():
        # Get the db connection using your app's configured method (e.g. from g or a direct call)
        # This assumes your get_db_connection can be called to get a new connection
        # or that your app.get_db() correctly handles context.
        # For simplicity, let's assume database.get_db_connection gives what we need
        # and we'll handle its setup/teardown if flask_app.app_context() isn't enough.
        # Typically, get_db() in Flask uses g, which is tied to app_context.

        # The init_db in the app fixture already creates the schema.
        # This fixture is more for providing access to the connection for test setup/assertions.
        # Using flask_app.config['DATABASE'] which was set in the app fixture.
        conn = get_db_connection(flask_app.config['DATABASE'])
        conn.row_factory = sqlite3.Row # Optional: if you want dict-like rows in tests
        yield conn
        conn.close() # Ensure connection is closed after test.

@pytest.fixture
def auth_client(client, app):
    """A test client that is pre-authenticated as a regular user."""
    # This is a simplified example. You'll need user creation and token generation.
    # Assume you have a helper function `create_test_user_and_token(app, username, password, role)`
    # For now, this will be a placeholder.
    # You would typically:
    # 1. Create a user in the database.
    # 2. Generate a JWT token for that user.
    # 3. Set the Authorization header on the client.

    # Placeholder for actual token generation logic
    # from flask_jwt_extended import create_access_token
    # with app.app_context():
    #     # Create user in DB if not exists (e.g. using app.create_user_in_db or similar)
    #     # For now, assume user ID 1 exists or is created by init_db for simplicity
    #     access_token = create_access_token(identity="1") # Assuming user ID 1
    # client.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {access_token}'
    # return client

    # This needs proper implementation based on your app's user creation and auth.

    # For now, let's implement a basic user creation and token generation here.
    # This assumes your app has `bcrypt` and `create_user_in_db` function.
    # And that `find_user_by_username` is available.
    from app import bcrypt # Assuming bcrypt is initialized in your app
    from database import create_user_in_db, find_user_by_username
    from flask_jwt_extended import create_access_token

    TEST_USER_USERNAME = "testuser_auth"
    TEST_USER_PASSWORD = "Password123!"

    with app.app_context():
        db_conn = get_db_connection(app.config['DATABASE'])
        user = find_user_by_username(TEST_USER_USERNAME) # Check if user exists
        if not user:
            # Role is 'user' by default in create_user_in_db if not specified
            user_id, _ = create_user_in_db(TEST_USER_USERNAME, TEST_USER_PASSWORD, email=f"{TEST_USER_USERNAME}@example.com")
            if not user_id:
                raise RuntimeError(f"Failed to create test user '{TEST_USER_USERNAME}' for auth_client fixture.")
            user = {"id": user_id, "username": TEST_USER_USERNAME, "role": "user"} # Simplified dict for token

        # Ensure user_id for token is string, as per JWT best practices for 'sub'
        access_token = create_access_token(identity=str(user['id']))
        db_conn.close()

    client.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {access_token}'

    # Add user object to client for tests to access if needed
    client.user = user
    return client


@pytest.fixture
def create_user(db, app):
    """Fixture to create a user in the database and return their details and password."""
    from database import create_user_in_db, find_user_by_id

    def _create_user_func(username, password, role='user', email_suffix="@example.com"):
        with app.app_context(): # Ensure DB operations are within app context
            email_to_use = f"{username}{email_suffix}"
            user_id, created_role = create_user_in_db(username, password, email_to_use, role)
            if not user_id:
                raise ValueError(f"Test user creation failed for {username}")

            # Fetch the created user to get all details (like ID)
            # Assuming find_user_by_id returns a dict-like object (e.g. sqlite3.Row)
            created_user_details_row = find_user_by_id(user_id)
            if not created_user_details_row:
                 raise ValueError(f"Failed to fetch created test user {username} by ID {user_id}")

            # Convert sqlite3.Row to a standard dict if necessary for consistent use
            created_user_details = dict(created_user_details_row)

            return {"id": user_id, "username": username, "password": password, "role": created_role, "details": created_user_details}
    return _create_user_func

@pytest.fixture
def create_conversation(db, app):
    """Fixture to create a conversation between two users."""
    from database import create_conversation as db_create_conversation
    from database import get_conversation_by_id as db_get_conversation_by_id

    def _create_conversation_func(user1_id, user2_id):
        with app.app_context():
            conversation_row = db_create_conversation(db, user1_id, user2_id)
            if not conversation_row:
                raise ValueError(f"Failed to create conversation between {user1_id} and {user2_id}")
            # Ensure the returned object is a dict
            return dict(conversation_row)
    return _create_conversation_func

@pytest.fixture
def get_auth_headers(app):
    """Fixture to generate auth headers for a given user ID."""
    from flask_jwt_extended import create_access_token
    def _get_auth_headers_func(user_id):
        with app.app_context():
            access_token = create_access_token(identity=str(user_id))
        return {'Authorization': f'Bearer {access_token}'}
    return _get_auth_headers_func
