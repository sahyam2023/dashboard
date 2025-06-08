import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatInput from '../ChatInput'; // Adjust path as necessary
import { vi } from 'vitest'; // Vitest's mocking utilities

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Smile: (props: any) => <svg data-testid="smile-icon" {...props} />,
    Paperclip: (props: any) => <svg data-testid="paperclip-icon" {...props} />,
  };
});

// Mock emoji-picker-react
const mockOnEmojiClick = vi.fn();
vi.mock('emoji-picker-react', async () => {
  const actual = await vi.importActual('emoji-picker-react');
  return {
    ...actual,
    // @ts-ignore
    default: (props) => { // Assuming Picker is the default export
      mockOnEmojiClick.mockImplementation((emojiData, event) => {
         // Call the passed onEmojiClick with a mock emoji object
        props.onEmojiClick({ emoji: '😀', unified: '1f600' } as any, event);
      });
      return <div data-testid="mock-emoji-picker" onClick={() => mockOnEmojiClick({ emoji: '😀' } as any, {} as any)} />;
    },
    Theme: { AUTO: 'auto' },
    EmojiStyle: { NATIVE: 'native' },
  };
});


// Mock react-dropzone
const mockOpen = vi.fn();
vi.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: any) => {
    // Allow tests to simulate a drop by calling this function
    (global as any).simulateDrop = (files: File[]) => {
      if (onDrop) {
        onDrop(files);
      }
    };
    return {
      getRootProps: (props?: any) => ({ ...props }),
      getInputProps: (props?: any) => ({ ...props }),
      open: mockOpen,
    };
  },
}));


describe('ChatInput', () => {
  const mockOnSendMessage = vi.fn();
  const mockOnSendFile = vi.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
    mockOnSendFile.mockClear();
    mockOpen.mockClear();
    mockOnEmojiClick.mockClear();
    // Clear any global simulateDrop if it was set
    if ((global as any).simulateDrop) delete (global as any).simulateDrop;
  });

  it('renders the message input and send button', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('allows typing in the input field', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello world' } });
    expect(input.value).toBe('Hello world');
  });

  it('calls onSendMessage with the input text when send button is clicked', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    expect((input as HTMLInputElement).value).toBe(''); // Input should clear after sending
  });

  it('calls onSendMessage when Enter key is pressed (without Shift)', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Enter message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13, shiftKey: false });
    expect(mockOnSendMessage).toHaveBeenCalledWith('Enter message');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not call onSendMessage when Enter key is pressed with Shift', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Shift+Enter message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13, shiftKey: true });
    expect(mockOnSendMessage).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Shift+Enter message\n'); // Check if newline is added or input remains
  });


  it('toggles the emoji picker visibility when emoji button is clicked', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const emojiButton = screen.getByLabelText('Toggle emoji picker');

    // Initially, picker is not visible
    expect(screen.queryByTestId('mock-emoji-picker')).not.toBeInTheDocument();

    fireEvent.click(emojiButton);
    // Picker should be visible
    expect(screen.getByTestId('mock-emoji-picker')).toBeInTheDocument();

    fireEvent.click(emojiButton);
    // Picker should be hidden again
    expect(screen.queryByTestId('mock-emoji-picker')).not.toBeInTheDocument();
  });

  it('inserts an emoji into the input field when an emoji is clicked in the picker', async () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    const emojiButton = screen.getByLabelText('Toggle emoji picker');

    // Open picker
    fireEvent.click(emojiButton);
    const picker = screen.getByTestId('mock-emoji-picker');

    // Simulate emoji click (our mock calls onEmojiClick with '😀')
    // The mock implementation of Picker now directly calls the onEmojiClick prop
    // when the mock picker itself is clicked.
    await act(async () => {
       fireEvent.click(picker);
    });

    expect(input.value).toContain('😀');
    // Picker should hide after selection
    expect(screen.queryByTestId('mock-emoji-picker')).not.toBeInTheDocument();
  });


  it('calls the open function from useDropzone when attachment button is clicked', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const attachmentButton = screen.getByLabelText('Attach file');
    fireEvent.click(attachmentButton);
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onSendFile with the selected file when a file is dropped', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);

    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    // Access the simulateDrop function exposed via the global object in the mock
    act(() => {
      (global as any).simulateDrop([file]);
    });

    expect(mockOnSendFile).toHaveBeenCalledWith(file);
    // Input field should be cleared after selecting a file
    const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('disables send button when input is empty or only whitespace', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} />);
    const sendButton = screen.getByRole('button', { name: 'Send' });
    const input = screen.getByPlaceholderText('Type a message...');

    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Not empty' } });
    expect(sendButton).not.toBeDisabled();
  });

  it('disables all interactive elements when disabled prop is true', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} onSendFile={mockOnSendFile} disabled={true} />);

    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByLabelText('Toggle emoji picker')).toBeDisabled(); // Assuming buttons get disabled
    expect(screen.getByLabelText('Attach file')).toBeDisabled(); // Assuming buttons get disabled

    // Attempt to interact
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Test' } });
    expect((input as HTMLInputElement).value).toBe('Test'); // Input onChange still works, but field is disabled

    const sendButton = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendButton);
    expect(mockOnSendMessage).not.toHaveBeenCalled();

    const emojiButton = screen.getByLabelText('Toggle emoji picker');
    fireEvent.click(emojiButton);
    expect(screen.queryByTestId('mock-emoji-picker')).not.toBeInTheDocument(); // Picker should not open

    const attachmentButton = screen.getByLabelText('Attach file');
    fireEvent.click(attachmentButton);
    expect(mockOpen).not.toHaveBeenCalled(); // Dropzone open should not be called
  });

});
