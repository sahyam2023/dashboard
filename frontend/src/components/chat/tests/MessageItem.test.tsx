import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageItem from '../MessageItem'; // Adjust path as necessary
import { Message } from '../types'; // Adjust path
import { vi } from 'vitest';

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    FileText: (props: any) => <svg data-testid="filetext-icon" {...props} />,
    Download: (props: any) => <svg data-testid="download-icon" {...props} />,
    Image: (props: any) => <svg data-testid="image-icon" {...props} />, // Note: MessageItem uses <img> directly for type: 'image'
    Video: (props: any) => <svg data-testid="video-icon" {...props} />, // Note: MessageItem uses <video> directly for type: 'video'
    Music: (props: any) => <svg data-testid="audio-icon" {...props} />, // Note: MessageItem uses <audio> directly for type: 'audio'
    ShieldQuestion: (props: any) => <svg data-testid="shieldquestion-icon" {...props} />,
  };
});

const currentUserId = 1;
const otherUserId = 2;

const baseMessage: Omit<Message, 'id' | 'conversation_id' | 'content' | 'created_at'> = {
  sender_id: otherUserId,
  recipient_id: currentUserId,
  is_read: false,
  sender_username: 'OtherUser',
};

describe('MessageItem', () => {
  it('renders a text message correctly from another user', () => {
    const message: Message = {
      ...baseMessage,
      id: 1,
      conversation_id: 1,
      content: 'Hello, this is a text message.',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('Hello, this is a text message.')).toBeInTheDocument();
    expect(screen.getByText('OtherUser')).toBeInTheDocument(); // Sender username
    // Check for timestamp (format might vary, check for presence)
    expect(screen.getByText(/(\d{1,2}:\d{2}\s*(AM|PM)?)/i)).toBeInTheDocument();
  });

  it('renders a text message correctly from the current user', () => {
    const message: Message = {
      ...baseMessage,
      id: 2,
      conversation_id: 1,
      sender_id: currentUserId, // Current user is sender
      sender_username: 'CurrentUser',
      content: 'I sent this.',
      created_at: new Date().toISOString(),
      is_read: true,
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('I sent this.')).toBeInTheDocument();
    // Sender username should not be shown for current user's messages
    expect(screen.queryByText('CurrentUser')).not.toBeInTheDocument();
    // Check for read status (simple checkmark SVG, mock it or check for its presence if not mocked by default)
    // For now, assume the SVG path for read status is identifiable if needed, or test via class/structure.
    // Vitest doesn't automatically mock SVGs unless configured.
    // Let's assume the read status SVG has a known path or is mocked elsewhere if complex.
    // Here, we'll just check the timestamp is present.
    expect(screen.getByText(/(\d{1,2}:\d{2}\s*(AM|PM)?)/i)).toBeInTheDocument();
  });

  it('renders an image message with an img tag', () => {
    const message: Message = {
      ...baseMessage,
      id: 3,
      conversation_id: 1,
      content: 'Image file', // Fallback content if image doesn't load, or filename
      file_name: 'mountain.jpg',
      file_url: '/uploads/mountain.jpg',
      file_type: 'image',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    const imgElement = screen.getByAltText('mountain.jpg');
    expect(imgElement).toBeInTheDocument();
    expect(imgElement).toHaveAttribute('src', '/uploads/mountain.jpg');
  });

  it('renders a video message with a video tag and controls', () => {
    const message: Message = {
      ...baseMessage,
      id: 4,
      conversation_id: 1,
      content: 'Video file',
      file_name: 'epic_movie.mp4',
      file_url: '/uploads/epic_movie.mp4',
      file_type: 'video',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    const videoElement = screen.getByRole('region').querySelector('video'); // More robust query
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('src', '/uploads/epic_movie.mp4');
    expect(videoElement).toHaveAttribute('controls');
  });

  it('renders an audio message with an audio tag and controls', () => {
    const message: Message = {
      ...baseMessage,
      id: 5,
      conversation_id: 1,
      content: 'Audio file',
      file_name: 'cool_song.mp3',
      file_url: '/uploads/cool_song.mp3',
      file_type: 'audio',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    const audioElement = screen.getByRole('group').querySelector('audio'); // More robust query
    expect(audioElement).toBeInTheDocument();
    expect(audioElement).toHaveAttribute('src', '/uploads/cool_song.mp3');
    expect(audioElement).toHaveAttribute('controls');
    expect(screen.getByText(`Download cool_song.mp3`)).toBeInTheDocument();
  });

  it('renders a PDF file message with a download link and FileText icon', () => {
    const message: Message = {
      ...baseMessage,
      id: 6,
      conversation_id: 1,
      content: 'document.pdf', // Filename as content
      file_name: 'document.pdf',
      file_url: '/uploads/document.pdf',
      file_type: 'pdf',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: /Download/i });
    expect(downloadLink).toHaveAttribute('href', '/uploads/document.pdf');
    expect(downloadLink).toHaveAttribute('download', 'document.pdf');
    expect(screen.getByTestId('filetext-icon')).toBeInTheDocument(); // Mocked icon
  });

  it('renders a generic binary file message with a download link and ShieldQuestion icon', () => {
    const message: Message = {
      ...baseMessage,
      id: 7,
      conversation_id: 1,
      content: 'archive.zip', // Filename as content
      file_name: 'archive.zip',
      file_url: '/uploads/archive.zip',
      file_type: 'binary', // Or 'archive' if specific handling
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('archive.zip')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: /Download/i });
    expect(downloadLink).toHaveAttribute('href', '/uploads/archive.zip');
    expect(downloadLink).toHaveAttribute('download', 'archive.zip');
    expect(screen.getByTestId('shieldquestion-icon')).toBeInTheDocument(); // Mocked icon for binary/default
  });

  it('renders an archive file message with a download link and FileText icon', () => {
    const message: Message = {
      ...baseMessage,
      id: 8,
      conversation_id: 1,
      content: 'my_stuff.zip',
      file_name: 'my_stuff.zip',
      file_url: '/uploads/my_stuff.zip',
      file_type: 'archive',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('my_stuff.zip')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: /Download/i });
    expect(downloadLink).toHaveAttribute('href', '/uploads/my_stuff.zip');
    expect(downloadLink).toHaveAttribute('download', 'my_stuff.zip');
    expect(screen.getByTestId('filetext-icon')).toBeInTheDocument(); // FileText for archive
  });

  it('renders a doc file message with a download link and FileText icon', () => {
    const message: Message = {
      ...baseMessage,
      id: 9,
      conversation_id: 1,
      content: 'report.docx',
      file_name: 'report.docx',
      file_url: '/uploads/report.docx',
      file_type: 'doc',
      created_at: new Date().toISOString(),
    };
    render(<MessageItem message={message} currentUserId={currentUserId} />);
    expect(screen.getByText('report.docx')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: /Download/i });
    expect(downloadLink).toHaveAttribute('href', '/uploads/report.docx');
    expect(downloadLink).toHaveAttribute('download', 'report.docx');
    expect(screen.getByTestId('filetext-icon')).toBeInTheDocument(); // FileText for doc
  });

});
