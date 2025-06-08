import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as api from '../api'; // Adjust path as necessary
import { ChatMessage } from '../../components/chat/types'; // Adjust path

// Mock global fetch
global.fetch = vi.fn();

// Mock localStorage for token retrieval
const mockTokenData = { token: 'test-token', user_id: 1, username: 'testuser', role: 'user' };
Storage.prototype.getItem = vi.fn((key) => {
  if (key === 'tokenData') {
    return JSON.stringify(mockTokenData);
  }
  return null;
});

// Mock toast utils to prevent errors during tests if they are called by handleApiError
vi.mock('../../utils/toastUtils', () => ({
  setGlobalOfflineStatus: vi.fn(),
  showErrorToast: vi.fn(),
}));


describe('API Service', () => {
  beforeEach(() => {
    (fetch as any).mockClear();
    (Storage.prototype.getItem as any).mockClear();
  });

  describe('uploadChatFile', () => {
    it('should POST FormData with file and conversation_id, and include auth token', async () => {
      const mockFile = new File(['test content'], 'test.png', { type: 'image/png' });
      const mockConversationId = 123;
      const mockApiResponse = { file_url: 'some/url.png', file_name: 'test.png', file_type: 'image' };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
        text: async () => JSON.stringify(mockApiResponse), // for handleApiError parsing
      });

      const result = await api.uploadChatFile(mockFile, mockConversationId);

      expect(fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (fetch as any).mock.calls[0];
      const url = fetchCall[0];
      const options = fetchCall[1];

      expect(url).toBe(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7000'}/api/chat/upload_file`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${mockTokenData.token}`);

      const formData = options.body as FormData;
      expect(formData.get('file')).toEqual(mockFile);
      expect(formData.get('conversation_id')).toBe(mockConversationId.toString());

      expect(result).toEqual(mockApiResponse);
    });

    it('should throw an error if the upload fails', async () => {
      const mockFile = new File(['test'], 'fail.txt', { type: 'text/plain' });
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ msg: 'Upload failed' }),
        text: async () => JSON.stringify({ msg: 'Upload failed' }),
      });

      await expect(api.uploadChatFile(mockFile, 1))
        .rejects
        .toThrow('Upload failed: 500'); // Error message from handleApiError
    });
  });

  describe('sendMessage', () => {
    const mockConversationId = 1;
    const mockContent = 'Hello, world!';

    it('should send a text message correctly', async () => {
      const mockApiResponse: ChatMessage = {
        id: 1, conversation_id: mockConversationId, sender_id: 1, recipient_id: 2,
        content: mockContent, created_at: new Date().toISOString(), is_read: false
      };
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
        text: async () => JSON.stringify(mockApiResponse),
      });

      const result = await api.sendMessage(mockConversationId, mockContent);

      expect(fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (fetch as any).mock.calls[0];
      const url = fetchCall[0];
      const options = fetchCall[1];
      const body = JSON.parse(options.body);

      expect(url).toBe(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7000'}/api/chat/conversations/${mockConversationId}/messages`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBe(`Bearer ${mockTokenData.token}`);
      expect(body.content).toBe(mockContent);
      expect(body.file_url).toBeUndefined();
      expect(body.file_name).toBeUndefined();
      expect(body.file_type).toBeUndefined();
      expect(result).toEqual(mockApiResponse);
    });

    it('should send a message with file details correctly', async () => {
      const mockFileUrl = 'some/file.jpg';
      const mockFileName = 'image.jpg';
      const mockFileType = 'image';
      const mockApiResponse: ChatMessage = {
        id: 2, conversation_id: mockConversationId, sender_id: 1, recipient_id: 2,
        content: mockContent, // content can be filename or a caption
        file_url: mockFileUrl, file_name: mockFileName, file_type: mockFileType,
        created_at: new Date().toISOString(), is_read: false
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
        text: async () => JSON.stringify(mockApiResponse),
      });

      const result = await api.sendMessage(mockConversationId, mockContent, mockFileUrl, mockFileName, mockFileType);

      expect(fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.content).toBe(mockContent);
      expect(body.file_url).toBe(mockFileUrl);
      expect(body.file_name).toBe(mockFileName);
      expect(body.file_type).toBe(mockFileType);
      expect(result).toEqual(mockApiResponse);
    });

    it('should throw an error if sending message fails', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ msg: 'Send failed' }),
        text: async () => JSON.stringify({ msg: 'Send failed' }),
      });

      await expect(api.sendMessage(mockConversationId, mockContent))
        .rejects
        .toThrow(`Failed to send message to conversation ${mockConversationId}: 500`);
    });
  });
});
