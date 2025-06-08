// frontend/src/components/chat/ChatInput.tsx
import React, { useState, useRef, useCallback } from 'react';
import { Smile, Paperclip } from 'lucide-react'; // Assuming lucide-react for icons
import Picker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { useDropzone, FileWithPath } from 'react-dropzone';

interface ChatInputProps {
  onSendMessage: (messageText: string) => void; // Only text messages
  onSendFile: (file: File) => void;          // For sending files
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onSendFile, disabled = false }) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    if (acceptedFiles.length > 0 && !disabled) { // Also check if disabled
      const file = acceptedFiles[0];
      // console.log('File selected in ChatInput:', { // Optional: keep for debugging if needed
      //   name: file.name,
      //   size: file.size,
      //   type: file.type,
      //   path: file.path,
      // });
      onSendFile(file); // Use the new handler for files
      setMessage('');   // Clear text input when a file is selected for sending
    }
  }, [onSendFile, disabled]);

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    multiple: false, // Allow only single file upload for now
    noClick: true, // We'll use a custom button to trigger open
    noKeyboard: true,
  });

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prevMessage => prevMessage + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) {
      event.preventDefault();
    }
    if (message.trim() && !disabled) {
      onSendMessage(message.trim()); // Send as text
      setMessage('');
    }
    // If a file was just sent via onDrop, message would be empty, so this won't run.
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevent new line in input on Enter
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} {...getRootProps({ onClick: e => e.stopPropagation() })} className="relative p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-750">
      <input {...getInputProps()} />
      {showEmojiPicker && (
        <div className="absolute bottom-full mb-2 z-10">
          <Picker
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            theme={Theme.AUTO}
            emojiStyle={EmojiStyle.NATIVE}
            lazyLoadEmojis={true}
            // Ensure picker width fits if needed, or use default
            // width="350px" 
            // height="450px"
          />
        </div>
      )}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Emoji Picker Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle emoji picker"
        >
          <Smile size={24} />
        </button>

        {/* File Attachment Button */}
        <button
          type="button"
          onClick={open} // react-dropzone's open function
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Attach file"
        >
          <Paperclip size={24} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          disabled={disabled}
          className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:bg-gray-200 dark:disabled:bg-gray-600 transition-colors"
          aria-label="Chat message input"
        />
        <button
          type="submit"
          disabled={disabled || !message.trim()}
          className="px-4 sm:px-6 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
