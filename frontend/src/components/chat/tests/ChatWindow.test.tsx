import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatWindow from '../ChatWindow';
import { useAuth } from '../../../context/AuthContext';
import { useNotification } from '../../../context/NotificationContext';
import * as api from '../../../services/api';
import { vi } from 'vitest';
import { Conversation, Message, User as ChatUser } from '../types'; // Assuming types are here

// Mock lucide-react icons (as ChatWindow might indirectly render them via MessageList/Item)
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return { ...actual }; // Use actual icons for now, or mock specific ones if needed
});

// Mock services/api
vi.mock('../../../services/api', () => ({
  getMessages: vi.fn(),
  sendMessage: vi.fn(),
  uploadChatFile: vi.fn(),
  getUserChatStatus: vi.fn(),
}));

// Mock context hooks
vi.mock('../../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../context/NotificationContext', () => ({
  useNotification: vi.fn(),
}));

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
};
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock child components if they become too complex to manage in these tests
vi.mock('../MessageList', () => ({
  __esModule: true,
  default: ({ messages, currentUserId }: { messages: Message[], currentUserId: number | null }) => (
    <div data-testid="mock-message-list">
      {messages.map(msg => (
        <div key={msg.id} data-testid={`message-${msg.id}`}>
          {msg.content}
          {msg.file_name && <span>{msg.file_name}</span>}
        </div>
      ))}
    </div>
  ),
}));

// A more complete mock for ChatInput to allow simulating interactions
const mockChatInputOnSendMessage = vi.fn();
const mockChatInputOnSendFile = vi.fn();
vi.mock('../ChatInput', () => ({
  __esModule: true,
  default: (props: any) => {
    // Store the passed functions so tests can call them
    mockChatInputOnSendMessage.mockImplementation(props.onSendMessage);
    mockChatInputOnSendFile.mockImplementation(props.onSendFile);
    return (
      <div data-testid="mock-chat-input">
        <input
          type="text"
          data-testid="chat-input-text-field"
          onChange={(e) => props.onSendMessage(e.target.value)}
        />
        <button data-testid="chat-input-send-file-button" onClick={() => props.onSendFile(new File(["dummy"], "dummy.png", {type: "image/png"}))}>
          Send File
        </button>
      </div>
    );
  }
}));


const mockSelectedConversation: Conversation = {
  conversation_id: 1,
  other_user_id: 2,
  other_username: 'TestUser',
  other_profile_picture_url: null,
  user1_id: 10, // Assuming current user is 10
  user2_id: 2,
  created_at: new Date().toISOString(),
  unread_messages_count: 0,
};

const mockCurrentUser: ChatUser = {
  id: 10,
  username: 'CurrentUser',
  profile_picture_filename: null,
  is_active: true,
};


describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as any).mockReturnValue({
      tokenData: { token: 'fake-token', user_id: mockCurrentUser.id, username: mockCurrentUser.username },
    });
    (useNotification as any).mockReturnValue({
      showToastNotification: vi.fn(),
    });
    (api.getUserChatStatus as any).mockResolvedValue({ is_online: false, last_seen: null });
  });

  it('renders placeholder when no conversation is selected', () => {
    render(<ChatWindow selectedConversation={null} currentUserId={mockCurrentUser.id} socket={mockSocket as any} />);
    expect(screen.getByText('Select a conversation to start chatting.')).toBeInTheDocument();
  });

  it('fetches and displays messages when a conversation is selected', async () => {
    const messages: Message[] = [
      { id: 1, conversation_id: 1, sender_id: 2, recipient_id: 10, content: 'Hello', created_at: new Date().toISOString(), is_read: true, sender_username: 'TestUser' },
      { id: 2, conversation_id: 1, sender_id: 10, recipient_id: 2, content: 'Hi', created_at: new Date().toISOString(), is_read: true, sender_username: 'CurrentUser' },
    ];
    (api.getMessages as any).mockResolvedValueOnce(messages);

    render(<ChatWindow selectedConversation={mockSelectedConversation} currentUserId={mockCurrentUser.id} socket={mockSocket as any} />);

    await waitFor(() => expect(api.getMessages).toHaveBeenCalledWith(mockSelectedConversation.conversation_id, 50, 0));

    // Check if messages are passed to MessageList (via its mock representation)
    expect(screen.getByTestId('mock-message-list')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument(); // Message content from mock MessageList
    expect(screen.getByText('Hi')).toBeInTheDocument();
  });

  it('calls api.sendMessage when handleSendMessage is triggered from ChatInput for text messages', async () => {
    (api.getMessages as any).mockResolvedValueOnce([]); // Initial load
    (api.sendMessage as any).mockResolvedValueOnce({ id: 3, content: 'Test text', /* ... other fields */ } as Message);

    render(<ChatWindow selectedConversation={mockSelectedConversation} currentUserId={mockCurrentUser.id} socket={mockSocket as any} />);
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled()); // Ensure initial load finishes

    // Simulate ChatInput calling onSendMessage
    // Use the direct mock call instead of interacting with the input field of the mocked ChatInput
    // This tests that ChatWindow correctly passes a functional onSendMessage to ChatInput
    // and that this function behaves as expected.
    await act(async () => {
      mockChatInputOnSendMessage('Test text');
    });

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith(
        mockSelectedConversation.conversation_id,
        'Test text' // Only text, no file params
      );
    });
  });

  it('calls api.uploadChatFile and then api.sendMessage when handleSendFile is triggered from ChatInput', async () => {
    (api.getMessages as any).mockResolvedValueOnce([]); // Initial load
    const mockFile = new File(['dummy'], 'dummy.png', { type: 'image/png' });
    const mockUploadResponse = {
      file_url: '/uploads/dummy.png',
      file_name: 'dummy.png',
      file_type: 'image',
    };
    (api.uploadChatFile as any).mockResolvedValueOnce(mockUploadResponse);
    (api.sendMessage as any).mockResolvedValueOnce({ id: 4, content: 'dummy.png', ...mockUploadResponse } as Message);

    render(<ChatWindow selectedConversation={mockSelectedConversation} currentUserId={mockCurrentUser.id} socket={mockSocket as any} />);
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled()); // Initial load

    // Simulate ChatInput calling onSendFile
    await act(async () => {
      mockChatInputOnSendFile(mockFile);
    });

    await waitFor(() => {
      expect(api.uploadChatFile).toHaveBeenCalledWith(mockFile, mockSelectedConversation.conversation_id);
    });

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith(
        mockSelectedConversation.conversation_id,
        mockFile.name, // content
        mockUploadResponse.file_url,
        mockUploadResponse.file_name,
        mockUploadResponse.file_type
      );
    });
  });

  it('handles new messages received via socket', async () => {
    (api.getMessages as any).mockResolvedValueOnce([]);
    render(<ChatWindow selectedConversation={mockSelectedConversation} currentUserId={mockCurrentUser.id} socket={mockSocket as any} />);
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled());

    const newMessage: Message = {
      id: 100,
      conversation_id: mockSelectedConversation.conversation_id,
      sender_id: mockSelectedConversation.other_user_id,
      recipient_id: mockCurrentUser.id!,
      content: 'Socket message text',
      created_at: new Date().toISOString(),
      is_read: false,
      sender_username: mockSelectedConversation.other_username,
      file_name: 'socket_file.pdf',
      file_url: '/socket/file.pdf',
      file_type: 'pdf',
    };

    // Find the 'new_message' handler passed to socket.on
    const newMessageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'new_message')?.[1];
    expect(newMessageHandler).toBeDefined();

    // Simulate receiving a message
    if (newMessageHandler) {
      await act(async () => {
        newMessageHandler(newMessage);
      });
    }

    // Check if the message is rendered (via mock MessageList)
    await waitFor(() => {
      expect(screen.getByText('Socket message text')).toBeInTheDocument();
      expect(screen.getByText('socket_file.pdf')).toBeInTheDocument(); // Filename also rendered
    });
  });

});
