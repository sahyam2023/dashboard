import pytest
import json
import io
import os
from flask import Flask # For type hinting with app fixture
from werkzeug.datastructures import FileStorage # For proper file type in test client

# Assuming your app's config for CHAT_UPLOAD_FOLDER is accessible via app.config
# and that conftest.py sets it to a temporary directory.

def test_upload_chat_file_success(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test successful file upload to a conversation."""
    # 1. Create users and a conversation
    user1_data = create_user("user1_chat_upload", "Password123!")
    user2_data = create_user("user2_chat_upload", "Password123!")

    # Ensure users were created
    assert user1_data and user1_data.get("id"), "Failed to create user1"
    assert user2_data and user2_data.get("id"), "Failed to create user2"

    conversation = create_conversation(user1_data["id"], user2_data["id"])
    assert conversation and conversation.get("id"), "Failed to create conversation"
    conversation_id = conversation["id"]

    # 2. Get auth headers for user1
    auth_headers = get_auth_headers(user1_data["id"])

    # 3. Prepare file data for upload
    file_content = b"this is a test file content for chat."
    file_name = "chat_test_file.txt"
    data = {
        'file': (io.BytesIO(file_content), file_name),
        'conversation_id': str(conversation_id) # Form data is typically string
    }

    # 4. Make the POST request
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers, content_type='multipart/form-data')

    # 5. Assertions
    assert response.status_code == 201, f"Expected 201, got {response.status_code}. Response: {response.data.decode()}"
    response_json = response.get_json()
    assert response_json is not None, "Response is not JSON"

    assert "file_url" in response_json
    assert "file_name" in response_json
    assert "file_type" in response_json

    assert response_json["file_name"] == file_name
    assert response_json["file_type"] == "text/plain" # Based on .txt, or mime type detection on backend

    # Check if file_url seems correct (structure)
    expected_file_url_part = f"/files/chat_uploads/{conversation_id}/"
    assert expected_file_url_part in response_json["file_url"]
    assert response_json["file_url"].endswith(file_name) # Backend uses <uuid>_filename, so this might need adjustment

    # 6. Verify file was "saved" (mocked or check temp dir)
    # The CHAT_UPLOAD_FOLDER is set to a temp dir in conftest.py
    # Example: app.config['CHAT_UPLOAD_FOLDER'] / str(conversation_id) / unique_filename
    # The unique_filename is part of response_json["file_url"]

    # Extract the unique filename from the file_url
    # Assuming file_url is like "/files/chat_uploads/1/uuid_chat_test_file.txt"
    unique_filename_from_url = response_json["file_url"].split('/')[-1]

    expected_file_path = os.path.join(app.config['CHAT_UPLOAD_FOLDER'], str(conversation_id), unique_filename_from_url)
    assert os.path.exists(expected_file_path), f"File not found at {expected_file_path}"

    with open(expected_file_path, 'rb') as f:
        saved_content = f.read()
        assert saved_content == file_content

def test_upload_chat_file_unauthorized_no_token(client):
    """Test file upload without authentication token."""
    data = {
        'file': (io.BytesIO(b"test"), "test.txt"),
        'conversation_id': '1'
    }
    response = client.post('/api/chat/upload_file', data=data, content_type='multipart/form-data')
    assert response.status_code == 401 # Expect Unauthorized

def test_upload_chat_file_user_not_in_conversation(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test file upload by user not part of the conversation."""
    user1_data = create_user("user1_chat_unauth", "Password123!")
    user2_data = create_user("user2_chat_unauth", "Password123!")
    user3_data = create_user("user3_chat_unauth", "Password123!") # The uploader

    conversation = create_conversation(user1_data["id"], user2_data["id"])
    conversation_id = conversation["id"]

    auth_headers_user3 = get_auth_headers(user3_data["id"])

    data = {
        'file': (io.BytesIO(b"test content"), "test.txt"),
        'conversation_id': str(conversation_id)
    }
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers_user3, content_type='multipart/form-data')
    assert response.status_code == 403 # Expect Forbidden
    response_json = response.get_json()
    assert response_json["msg"] == "You are not authorized to upload files to this conversation."

def test_upload_chat_file_missing_file(client, auth_client, create_conversation, create_user, get_auth_headers):
    """Test file upload request missing the file part."""
    # auth_client provides an authenticated user (user ID 1 as per current conftest)
    # Let's use the main user from auth_client for this test
    main_user_id = auth_client.user["id"] # Assuming auth_client has 'user' attribute
    other_user = create_user("other_chat_user_missing_file", "Password123!")

    conversation = create_conversation(main_user_id, other_user["id"])
    conversation_id = conversation["id"]

    # Get headers for the main_user_id from auth_client
    # This re-uses the token generation logic if auth_client sets it directly,
    # or uses get_auth_headers if auth_client doesn't modify client headers itself.
    # For simplicity, directly use get_auth_headers with the known ID.
    auth_headers = get_auth_headers(main_user_id)

    data = {
        'conversation_id': str(conversation_id)
        # Missing 'file'
    }
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers, content_type='multipart/form-data')
    assert response.status_code == 400
    response_json = response.get_json()
    assert "No file part" in response_json["msg"]


def test_upload_chat_file_missing_conversation_id(client, auth_client, get_auth_headers):
    """Test file upload request missing conversation_id."""
    main_user_id = auth_client.user["id"]
    auth_headers = get_auth_headers(main_user_id)

    data = {
        'file': (io.BytesIO(b"test content"), "test.txt")
        # Missing 'conversation_id'
    }
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers, content_type='multipart/form-data')
    assert response.status_code == 400
    response_json = response.get_json()
    assert "conversation_id is required" in response_json["msg"]

def test_upload_chat_file_invalid_conversation_id_format(client, auth_client, get_auth_headers):
    """Test file upload with invalid conversation_id format."""
    main_user_id = auth_client.user["id"]
    auth_headers = get_auth_headers(main_user_id)
    data = {
        'file': (io.BytesIO(b"test content"), "test.txt"),
        'conversation_id': 'not-an-integer'
    }
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers, content_type='multipart/form-data')
    assert response.status_code == 400
    response_json = response.get_json()
    assert "Invalid conversation_id format" in response_json["msg"]

def test_upload_chat_file_nonexistent_conversation(client, auth_client, get_auth_headers):
    """Test file upload to a non-existent conversation."""
    main_user_id = auth_client.user["id"]
    auth_headers = get_auth_headers(main_user_id)
    non_existent_conversation_id = 99999
    data = {
        'file': (io.BytesIO(b"test content"), "test.txt"),
        'conversation_id': str(non_existent_conversation_id)
    }
    response = client.post('/api/chat/upload_file', data=data, headers=auth_headers, content_type='multipart/form-data')
    assert response.status_code == 404 # Expect Not Found for conversation
    response_json = response.get_json()
    assert "Conversation not found" in response_json["msg"]

# --- Tests for File Serving Endpoint ---

def test_serve_chat_file_success(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test successful serving of an uploaded chat file."""
    user1 = create_user("user1_serve", "Password123!")
    user2 = create_user("user2_serve", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    conversation_id = conversation["id"]
    auth_headers_user1 = get_auth_headers(user1["id"])

    # 1. Upload a file first
    file_content = b"serve this content"
    file_name = "serve_me.txt"
    upload_data = {
        'file': (io.BytesIO(file_content), file_name),
        'conversation_id': str(conversation_id)
    }
    upload_response = client.post('/api/chat/upload_file', data=upload_data, headers=auth_headers_user1, content_type='multipart/form-data')
    assert upload_response.status_code == 201
    upload_json = upload_response.get_json()
    uploaded_file_url = upload_json["file_url"] # e.g., /files/chat_uploads/1/uuid_serve_me.txt

    # 2. Attempt to serve the file
    serve_response = client.get(uploaded_file_url, headers=auth_headers_user1)
    assert serve_response.status_code == 200
    assert serve_response.data == file_content
    # Check content-disposition to ensure it's not forcing download for common inline types like text
    # Default for send_from_directory is inline if browser supports, as_attachment=False
    # For .txt, it should typically be inline.
    # This depends on how send_from_directory and browser interpret it.
    # For now, just checking content. Could add Content-Disposition check if specific behavior is required.

def test_serve_chat_file_unauthorized_no_token(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test serving file without authentication."""
    user1 = create_user("user1_serve_noauth", "Password123!")
    user2 = create_user("user2_serve_noauth", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    auth_headers_user1 = get_auth_headers(user1["id"])

    # Upload a file
    upload_response = client.post('/api/chat/upload_file',
                                  data={'file': (io.BytesIO(b"test"), "test.txt"), 'conversation_id': str(conversation["id"])},
                                  headers=auth_headers_user1, content_type='multipart/form-data')
    assert upload_response.status_code == 201
    uploaded_file_url = upload_response.get_json()["file_url"]

    # Attempt to serve without token
    serve_response = client.get(uploaded_file_url) # No auth_headers
    assert serve_response.status_code == 401 # Expect Unauthorized

def test_serve_chat_file_user_not_in_conversation(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test serving file by user not part of the conversation."""
    user1 = create_user("user1_serve_notinconv", "Password123!")
    user2 = create_user("user2_serve_notinconv", "Password123!")
    user3 = create_user("user3_serve_notinconv", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    auth_headers_user1 = get_auth_headers(user1["id"])
    auth_headers_user3 = get_auth_headers(user3["id"])

    # User1 uploads a file
    upload_response = client.post('/api/chat/upload_file',
                                  data={'file': (io.BytesIO(b"test"), "secret.txt"), 'conversation_id': str(conversation["id"])},
                                  headers=auth_headers_user1, content_type='multipart/form-data')
    assert upload_response.status_code == 201
    uploaded_file_url = upload_response.get_json()["file_url"]

    # User3 (not in conversation) tries to access it
    serve_response = client.get(uploaded_file_url, headers=auth_headers_user3)
    assert serve_response.status_code == 403 # Expect Forbidden
    assert "not authorized to access files" in serve_response.get_json()["msg"]

def test_serve_chat_file_non_existent_file(client, app: Flask, create_user, create_conversation, get_auth_headers):
    """Test serving a non-existent chat file."""
    user1 = create_user("user1_serve_nofile", "Password123!")
    conversation = create_conversation(user1["id"], create_user("user2_serve_nofile", "Password123!")["id"])
    auth_headers_user1 = get_auth_headers(user1["id"])

    serve_url = f"/files/chat_uploads/{conversation['id']}/non_existent_file.txt"
    serve_response = client.get(serve_url, headers=auth_headers_user1)
    assert serve_response.status_code == 404 # Expect Not Found as file doesn't exist on disk

def test_serve_chat_file_non_existent_conversation_dir(client, auth_client, get_auth_headers):
    """Test serving a file from a non-existent conversation directory."""
    # auth_client's user (ID 1)
    main_user_id = auth_client.user["id"]
    auth_headers = get_auth_headers(main_user_id)
    non_existent_conversation_id = 88888

    serve_url = f"/files/chat_uploads/{non_existent_conversation_id}/some_file.txt"
    # Backend first checks if conversation exists and user is part of it.
    # If conversation doesn't exist, it's a 404 from get_conversation_by_id.
    serve_response = client.get(serve_url, headers=auth_headers)
    assert serve_response.status_code == 404
    assert "Conversation not found" in serve_response.get_json()["msg"]

# --- Tests for Message Sending with Files ---

def test_send_message_with_file_attachment(client, app: Flask, create_user, create_conversation, get_auth_headers, db):
    """Test sending a message that includes file attachment details."""
    user1 = create_user("user1_msg_file", "Password123!")
    user2 = create_user("user2_msg_file", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    conversation_id = conversation["id"]
    auth_headers_user1 = get_auth_headers(user1["id"])

    message_payload = {
        "content": "Check out this cool file!", # Optional caption
        "file_name": "data_report.pdf",
        "file_url": f"/files/chat_uploads/{conversation_id}/some_uuid_data_report.pdf",
        "file_type": "pdf"
    }

    response = client.post(f'/api/chat/conversations/{conversation_id}/messages',
                           json=message_payload,
                           headers=auth_headers_user1)

    assert response.status_code == 201
    response_json = response.get_json()
    assert response_json is not None
    assert response_json["content"] == message_payload["content"]
    assert response_json["file_name"] == message_payload["file_name"]
    assert response_json["file_url"] == message_payload["file_url"]
    assert response_json["file_type"] == message_payload["file_type"]
    assert response_json["sender_id"] == user1["id"]
    new_message_id = response_json["id"]

    # Verify in DB
    cursor = db.execute("SELECT * FROM messages WHERE id = ?", (new_message_id,))
    msg_from_db = cursor.fetchone()
    assert msg_from_db is not None
    assert msg_from_db["content"] == message_payload["content"]
    assert msg_from_db["file_name"] == message_payload["file_name"]
    assert msg_from_db["file_url"] == message_payload["file_url"]
    assert msg_from_db["file_type"] == message_payload["file_type"]

def test_send_text_only_message_after_file_changes(client, app: Flask, create_user, create_conversation, get_auth_headers, db):
    """Test sending a text-only message to ensure file fields are handled as null/empty."""
    user1 = create_user("user1_msg_text", "Password123!")
    user2 = create_user("user2_msg_text", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    conversation_id = conversation["id"]
    auth_headers_user1 = get_auth_headers(user1["id"])

    message_payload = {
        "content": "This is a plain text message."
        # No file_name, file_url, file_type
    }

    response = client.post(f'/api/chat/conversations/{conversation_id}/messages',
                           json=message_payload,
                           headers=auth_headers_user1)

    assert response.status_code == 201
    response_json = response.get_json()
    assert response_json["content"] == message_payload["content"]
    assert response_json["file_name"] is None
    assert response_json["file_url"] is None
    assert response_json["file_type"] is None
    new_message_id = response_json["id"]

    # Verify in DB
    cursor = db.execute("SELECT file_name, file_url, file_type FROM messages WHERE id = ?", (new_message_id,))
    msg_from_db = cursor.fetchone()
    assert msg_from_db is not None
    assert msg_from_db["file_name"] is None
    assert msg_from_db["file_url"] is None
    assert msg_from_db["file_type"] is None


# --- Tests for Message Retrieval with Files ---

def test_get_messages_with_file_attachments(client, app: Flask, create_user, create_conversation, get_auth_headers, db):
    """Test retrieving messages, ensuring file attachment details are present."""
    user1 = create_user("user1_get_msg_file", "Password123!")
    user2 = create_user("user2_get_msg_file", "Password123!")
    conversation = create_conversation(user1["id"], user2["id"])
    conversation_id = conversation["id"]
    auth_headers_user1 = get_auth_headers(user1["id"])

    # Manually insert a message with file details into DB for testing retrieval
    mock_file_details = {
        "content": "A message with a file for retrieval.",
        "file_name": "retrieved_doc.docx",
        "file_url": f"/files/chat_uploads/{conversation_id}/some_uuid_retrieved_doc.docx",
        "file_type": "doc",
        "sender_id": user1["id"],
        "recipient_id": user2["id"],
        "conversation_id": conversation_id
    }
    db.execute(
        """INSERT INTO messages (conversation_id, sender_id, recipient_id, content, file_name, file_url, file_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (conversation_id, user1["id"], user2["id"], mock_file_details["content"],
         mock_file_details["file_name"], mock_file_details["file_url"], mock_file_details["file_type"])
    )
    db.commit()

    response = client.get(f'/api/chat/conversations/{conversation_id}/messages', headers=auth_headers_user1)
    assert response.status_code == 200
    messages_json = response.get_json()
    assert messages_json is not None
    assert len(messages_json) > 0

    retrieved_message_with_file = None
    for msg in messages_json:
        if msg["file_name"] == mock_file_details["file_name"]:
            retrieved_message_with_file = msg
            break

    assert retrieved_message_with_file is not None, "Message with file attachment not found in retrieval"
    assert retrieved_message_with_file["content"] == mock_file_details["content"]
    assert retrieved_message_with_file["file_url"] == mock_file_details["file_url"]
    assert retrieved_message_with_file["file_type"] == mock_file_details["file_type"]
    assert retrieved_message_with_file["sender_id"] == user1["id"]


# More tests can be added for file types, size limits (if implemented), etc.
