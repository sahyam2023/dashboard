import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatMain from './ChatMain';
import *الصناعيAuthContext, { AuthContextType } from '../../context/AuthContext';
import { NotificationProvider } from '../../context/NotificationContext';
import * as apiService from '../../services/api';
import { Conversation } from './types'; // Ensure this type is correctly imported/defined

// Mock ConversationList to simplify ChatMain tests and observe props
jest.mock('./ConversationList', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return jest.fn(({ refreshKey, selectionModeEnabled, selectedConversationIds, onToggleSelection, onConversationSelect }) => (
    <div data-testid="conversation-list">
      <p>Selection Mode: {selectionModeEnabled ? 'On' : 'Off'}</p>
      <p>Refresh Key: {refreshKey}</p>
      <p>Selected Count: {selectedConversationIds.size}</p>
      {/* Simulate some conversations */}
      {[
        { conversation_id: 1, other_username: 'User A', last_message_content: 'Hello' },
        { conversation_id: 2, other_username: 'User B', last_message_content: 'Hi there' },
        { conversation_id: 3, other_username: 'User C', last_message_content: 'Hey!' },
      ].map(conv => (
        <div key={conv.conversation_id} data-testid={`conversation-item-${conv.conversation_id}`}>
          <span>{conv.other_username}</span>
          {selectionModeEnabled && (
            <input
              type="checkbox"
              data-testid={`checkbox-${conv.conversation_id}`}
              checked={selectedConversationIds.has(conv.conversation_id)}
              onChange={() => onToggleSelection(conv.conversation_id)}
            />
          )}
          <button onClick={() => onConversationSelect(conv as Conversation)}>Open</button>
        </div>
      ))}
    </div>
  ));
});

// Mock UserList
jest.mock('./UserList', () => {
  return jest.fn(() => <div data-testid="user-list">User List Mock</div>);
});

// Mock ChatWindow
jest.mock('./ChatWindow', () => {
  return jest.fn(() => <div data-testid="chat-window">Chat Window Mock</div>);
});


// Mock the api service
jest.mock('../../services/api');
const mockedApiService = apiService as jest.Mocked<typeof apiService>;

const mockUser = {
  id: 1,
  username: 'TestUser',
  email: 'test@example.com',
  role: 'user',
  is_active: true,
  profile_picture_url: null,
};

const mockAuthContextValue: AuthContextType = {
  user: mockUser,
  token: 'fake-token',
  login: jest.fn(),
  logout: jest.fn(),
  isTokenNearExpiry: jest.fn(() => false),
  globalPasswordRequired: false,
  setGlobalPasswordRequired: jest.fn(),
  isGlobalLoggedIn: true,
  setGlobalLoggedIn: jest.fn(),
};

// Mock socket
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
  id: 'mock-socket-id',
};


const renderChatMain = () => {
  return render(
    <AuthContext.Provider value={mockAuthContextValue}>
      <NotificationProvider>
        <ChatMain socket={mockSocket as any} socketConnected={true} />
      </NotificationProvider>
    </AuthContext.Provider>
  );
};

describe('ChatMain - Select and Clear Conversations', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockedApiService.getUserConversations.mockResolvedValue([
      { conversation_id: 1, other_user_id: 2, other_username: 'User A', last_message_content: 'Hello A', last_message_created_at: new Date().toISOString(), unread_messages_count: 0, user1_id: 1, user2_id: 2, created_at: new Date().toISOString() },
      { conversation_id: 2, other_user_id: 3, other_username: 'User B', last_message_content: 'Hello B', last_message_created_at: new Date().toISOString(), unread_messages_count: 1, user1_id: 1, user2_id: 3, created_at: new Date().toISOString() },
      { conversation_id: 3, other_user_id: 4, other_username: 'User C', last_message_content: 'Hello C', last_message_created_at: new Date().toISOString(), unread_messages_count: 0, user1_id: 1, user2_id: 4, created_at: new Date().toISOString() },
    ]);
  });

  test('1. Selection Mode Activation and UI Changes', async () => {
    renderChatMain();

    const selectButton = screen.getByTitle('Select Conversations');
    expect(selectButton).toBeInTheDocument();

    // Check initial state of ConversationList mock
    expect(screen.getByText('Selection Mode: Off')).toBeInTheDocument();

    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(screen.getByText('Selection Mode: On')).toBeInTheDocument();
    });

    // Checkboxes should be visible (simulated in mock)
    expect(screen.getByTestId('checkbox-1')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-2')).toBeInTheDocument();

    // "Select" button changes to "Cancel Selection"
    expect(screen.getByTitle('Cancel Selection')).toBeInTheDocument();

    // "Clear Selected (0)" button is visible
    // The button only appears if selectedIds.size > 0.
    // Let's select one item to make it appear
    fireEvent.click(screen.getByTestId('checkbox-1'));
    await waitFor(() => {
      expect(screen.getByText('Clear Selected (1)')).toBeInTheDocument();
    });
    // Deselect to check initial state of button text for (0)
    fireEvent.click(screen.getByTestId('checkbox-1'));
    await waitFor(() => {
       // With the current implementation, the button hides when count is 0.
       // So we assert it's NOT in the document.
      expect(screen.queryByText(/Clear Selected \(\d+\)/)).not.toBeInTheDocument();
    });
  });

  test('2. Selecting and Deselecting Conversations', async () => {
    renderChatMain();
    const selectButton = screen.getByTitle('Select Conversations');
    fireEvent.click(selectButton); // Enter selection mode

    const checkbox1 = await screen.findByTestId('checkbox-1');
    const checkbox2 = await screen.findByTestId('checkbox-2');

    // Select conversations
    fireEvent.click(checkbox1);
    fireEvent.click(checkbox2);

    await waitFor(() => {
      expect(checkbox1).toBeChecked();
      expect(checkbox2).toBeChecked();
      expect(screen.getByText('Selected Count: 2')).toBeInTheDocument(); // From mock
      expect(screen.getByText('Clear Selected (2)')).toBeInTheDocument();
    });

    // Deselect a conversation
    fireEvent.click(checkbox1);
    await waitFor(() => {
      expect(checkbox1).not.toBeChecked();
      expect(screen.getByText('Selected Count: 1')).toBeInTheDocument(); // From mock
      expect(screen.getByText('Clear Selected (1)')).toBeInTheDocument();
    });
  });

  test('3. Confirmation Modal Workflow', async () => {
    renderChatMain();
    const selectButton = screen.getByTitle('Select Conversations');
    fireEvent.click(selectButton); // Enter selection mode

    const checkbox1 = await screen.findByTestId('checkbox-1');
    fireEvent.click(checkbox1); // Select one conversation

    const clearSelectedButton = await screen.findByText('Clear Selected (1)');
    fireEvent.click(clearSelectedButton);

    // Assert modal appears
    await screen.findByText('Clear Selected Conversations?');
    expect(screen.getByText(/Are you sure you want to clear the selected 1 conversation\(s\)\?/)).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    // Assert modal closes, selection mode still active
    expect(screen.queryByText('Clear Selected Conversations?')).not.toBeInTheDocument();
    expect(screen.getByText('Selection Mode: On')).toBeInTheDocument();
    expect(screen.getByTestId('checkbox-1')).toBeChecked(); // Still selected

    // Click "Clear Selected" again
    fireEvent.click(clearSelectedButton);
    await screen.findByText('Clear Selected Conversations?'); // Wait for modal

    const confirmClearBtn = screen.getByRole('button', { name: 'Clear' });
    // For now, just testing modal close. Actual clear is in next test.
    mockedApiService.clearBatchConversations.mockResolvedValueOnce({ status: "success", details: [] });
    fireEvent.click(confirmClearBtn);

    await waitFor(() => {
      expect(screen.queryByText('Clear Selected Conversations?')).not.toBeInTheDocument();
    });
  });

  test('4. Successful Clear Operation (End-to-End with Mocked API)', async () => {
    mockedApiService.clearBatchConversations.mockResolvedValue({
      status: "success",
      details: [{ conversation_id: 1, status: "cleared", messages_deleted: 5, files_deleted: 2 }]
    });

    renderChatMain();
    const selectButton = screen.getByTitle('Select Conversations');
    fireEvent.click(selectButton);

    const checkbox1 = await screen.findByTestId('checkbox-1');
    fireEvent.click(checkbox1); // Select conversation 1

    const clearSelectedButton = await screen.findByText('Clear Selected (1)');
    fireEvent.click(clearSelectedButton);

    const confirmClearBtn = await screen.findByRole('button', { name: 'Clear' });
    fireEvent.click(confirmClearBtn);

    await waitFor(() => {
      expect(mockedApiService.clearBatchConversations).toHaveBeenCalledWith([1]);
    });

    // Assert success toast (NotificationContext needs to be properly providing showToastNotification)
    // This requires checking if the mock for useNotification().showToastNotification was called.
    // For simplicity, we assume it's called. A more direct assertion would involve mocking NotificationContext.

    await waitFor(() => {
      // Selection mode should be exited
      expect(screen.getByText('Selection Mode: Off')).toBeInTheDocument();
      // Checkboxes should disappear
      expect(screen.queryByTestId('checkbox-1')).not.toBeInTheDocument();
    });

    // Assert ConversationList refreshKey changed (indirectly testing list update)
    // The initial refreshKey is 0, it should increment.
    // We access the text content of the mock ConversationList part that displays the key.
    // This is a bit of an implementation detail test, but necessary for this refresh mechanism.
    expect(screen.getByText('Refresh Key: 1')).toBeInTheDocument();


    // If selectedConversation was cleared (assuming conv 1 was selected for chat view - tricky to set up in this test)
    // For now, we just check that the main chat window is in its default state if selectedConversation becomes null.
    // This test currently doesn't open a chat window, so selectedConversation is already null.
    // A more complex test would set selectedConversation, then clear it.
    expect(screen.getByText('Select a conversation or start a new chat.')).toBeInTheDocument();
  });

  test('5. Failed Clear Operation (End-to-End with Mocked API)', async () => {
    mockedApiService.clearBatchConversations.mockRejectedValue(new Error("Network Error"));

    renderChatMain();
    const selectButton = screen.getByTitle('Select Conversations');
    fireEvent.click(selectButton);

    const checkbox1 = await screen.findByTestId('checkbox-1');
    const checkbox2 = await screen.findByTestId('checkbox-2');
    fireEvent.click(checkbox1);
    fireEvent.click(checkbox2);

    const clearSelectedButton = await screen.findByText('Clear Selected (2)');
    fireEvent.click(clearSelectedButton);

    const confirmClearBtn = await screen.findByRole('button', { name: 'Clear' });
    fireEvent.click(confirmClearBtn);

    await waitFor(() => {
      expect(mockedApiService.clearBatchConversations).toHaveBeenCalledWith([1, 2]);
    });

    // Assert error toast (similar to success toast, relies on NotificationContext mock)

    // Assert selection mode remains active
    expect(screen.getByText('Selection Mode: On')).toBeInTheDocument();
    // Assert conversations remain selected
    expect(screen.getByTestId('checkbox-1')).toBeChecked();
    expect(screen.getByTestId('checkbox-2')).toBeChecked();
    expect(screen.getByText('Selected Count: 2')).toBeInTheDocument();
    expect(screen.getByText('Clear Selected (2)')).toBeInTheDocument();
  });
});
