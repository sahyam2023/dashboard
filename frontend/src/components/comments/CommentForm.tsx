import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Comment as CommentType, UserMentionSuggestion, addComment, updateComment, fetchUserMentionSuggestions } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { showErrorToast, showSuccessToast } from '../../utils/toastUtils';
import { Send, XCircle } from 'lucide-react';

interface CommentFormProps {
  itemId: number;
  itemType: string;
  parentCommentId?: number | null;
  onCommentAddedOrUpdated: (comment: CommentType) => void;
  onCancel?: () => void;
  initialContent?: string;
  isEditMode?: boolean;
  commentIdToEdit?: number;
}

const CommentForm: React.FC<CommentFormProps> = ({
  itemId,
  itemType,
  parentCommentId = null,
  onCommentAddedOrUpdated,
  onCancel,
  initialContent = '',
  isEditMode = false,
  commentIdToEdit,
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>('');
  const [mentionSuggestions, setMentionSuggestions] = useState<UserMentionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);

  const { user } = useAuth();

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newContent.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w+)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setMentionSuggestions([]);
    }
  };

  const fetchSuggestions = useCallback(async () => {
    if (mentionQuery.length > 0) { // Typically, you might want > 1 or > 2 chars
      try {
        const suggestions = await fetchUserMentionSuggestions(mentionQuery);
        setMentionSuggestions(suggestions);
      } catch (error) {
        console.error('Failed to fetch mention suggestions:', error);
        setMentionSuggestions([]);
      }
    } else {
      setMentionSuggestions([]);
    }
  }, [mentionQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (showSuggestions) {
        fetchSuggestions();
      }
    }, 300); // Debounce API calls

    return () => {
      clearTimeout(handler);
    };
  }, [mentionQuery, showSuggestions, fetchSuggestions]);

  const handleSuggestionClick = (suggestion: UserMentionSuggestion) => {
    if (textareaRef.current) {
      const currentContent = textareaRef.current.value;
      const cursorPos = textareaRef.current.selectionStart;
      const textBeforeCursor = currentContent.substring(0, cursorPos);
      
      const lastAt = textBeforeCursor.lastIndexOf('@');
      if (lastAt !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAt + 1);
        const queryToReplace = textAfterAt.match(/^(\w*)/);
        
        if (queryToReplace) {
          const prefix = currentContent.substring(0, lastAt);
          const suffix = currentContent.substring(cursorPos);
          const newContent = `${prefix}@${suggestion.username} ${suffix}`;
          setContent(newContent);
          
          // Move cursor after the inserted mention + space
          const newCursorPos = (prefix + `@${suggestion.username} `).length;
          setTimeout(() => { // Delay to ensure state update and re-render
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
        }
      }
    }
    setShowSuggestions(false);
    setMentionSuggestions([]);
  };
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      showErrorToast('Comment cannot be empty.');
      return;
    }
    if (!user) {
      showErrorToast('You must be logged in to comment.');
      return;
    }

    setIsSubmitting(true);
    try {
      let newOrUpdatedComment: CommentType;
      if (isEditMode && commentIdToEdit) {
        newOrUpdatedComment = await updateComment(commentIdToEdit, { content });
        showSuccessToast('Comment updated successfully!');
      } else {
        newOrUpdatedComment = await addComment(itemType, itemId, {
          content,
          parent_comment_id: parentCommentId,
        });
        showSuccessToast('Comment added successfully!');
      }
      onCommentAddedOrUpdated(newOrUpdatedComment);
      setContent(''); // Reset form
      if (onCancel && isEditMode) onCancel(); // Close edit form
      if (onCancel && parentCommentId) onCancel(); // Close reply form

    } catch (error: any) {
      showErrorToast(error.message || (isEditMode ? 'Failed to update comment.' : 'Failed to add comment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 relative">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleContentChange}
        placeholder={isEditMode ? 'Edit your comment...' : (parentCommentId ? 'Write a reply...' : 'Add a comment...')}
        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
        rows={3}
        disabled={isSubmitting}
      />
      {showSuggestions && mentionSuggestions.length > 0 && (
        <ul ref={suggestionsRef} className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-40 overflow-y-auto mt-1">
          {mentionSuggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              onClick={() => handleSuggestionClick(suggestion)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-800 dark:text-gray-200"
            >
              {suggestion.username}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-end space-x-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md flex items-center"
          >
            <XCircle size={16} className="mr-1" /> Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 rounded-md flex items-center"
        >
          <Send size={16} className="mr-1" /> {isSubmitting ? 'Submitting...' : (isEditMode ? 'Update' : 'Submit')}
        </button>
      </div>
    </form>
  );
};

export default CommentForm;
