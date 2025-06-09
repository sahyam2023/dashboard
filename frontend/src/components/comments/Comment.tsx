import React from 'react';
import { Comment as CommentType, User } from '../../services/api'; // User type imported from api.ts
import { formatDistanceToNow, parseISO } from 'date-fns';
import { MessageSquare, Edit3, Trash2, CornerDownRight, Send } from 'lucide-react'; // Added Send icon
import { formatToISTLocaleString } from '../../utils'; // Updated import
import { showErrorToast } from '../../utils/toastUtils'; // Import showErrorToast
// It's good practice to import the type for the conversation if available
// import { Conversation as ChatConversation } from '../chat/types'; // Assuming path

interface CommentProps {
  comment: CommentType;
  onEdit: (comment: CommentType) => void;
  onDelete: (commentId: number) => void;
  onReply: (comment: CommentType) => void;
  currentUserId: number | null;
}

const Comment: React.FC<CommentProps> = ({ comment, onEdit, onDelete, onReply, currentUserId }) => {
  const highlightMentions = (text: string) => {
    return text.replace(/@(\w+)/g, (match, username) => {
      return `<strong class="text-blue-500 font-semibold">${match}</strong>`;
    });
  };

  const formattedTimestamp = () => {
    try {
      return formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true });
    } catch (error) {
      console.error('Error formatting date:', error);
      return formatToISTLocaleString(comment.created_at); // Fallback to raw date, now formatted
    }
  };

  return (
    <div className="p-4 my-2 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
          <span className="relative inline-block group">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {comment.username}
            </span>
            <button
              onClick={async () => {
                if (currentUserId && currentUserId !== comment.user_id) {
                  try {
                    const userToChatWith: User = {
                      id: comment.user_id,
                      username: comment.username,
                      email: null, 
                      role: 'user', 
                      is_active: true, 
                    };
                    
                    if ((window as any).triggerOpenChat) {
                      (window as any).triggerOpenChat(userToChatWith);
                    } else {
                      showErrorToast("Chat functionality is currently unavailable.");
                      console.error("window.triggerOpenChat is not defined.");
                    }
                  } catch (error) {
                    console.error('Failed to prepare data for chat:', error);
                    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                    showErrorToast(`Could not start chat: ${errorMessage}`);
                  }
                } else if (currentUserId === comment.user_id) {
                  showErrorToast("You cannot start a chat with yourself.");
                } else {
                  showErrorToast("You must be logged in to start a chat.");
                }
              }}
              className="absolute -right-6 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-blue-500 dark:text-blue-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150 hover:bg-gray-200 dark:hover:bg-gray-600"
              aria-label={`Start chat with ${comment.username}`}
            >
              <Send size={14} />
            </button>
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{formattedTimestamp()}</span>
        </div>
        <div className="flex items-center space-x-2">
          {currentUserId === comment.user_id && (
            <>
              <button
                onClick={() => onEdit(comment)}
                className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                aria-label="Edit comment"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                aria-label="Delete comment"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button
            onClick={() => onReply(comment)}
            className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Reply to comment"
          >
            <CornerDownRight size={16} /> <span className="ml-1 text-xs">Reply</span>
          </button>
        </div>
      </div>
      <div
        className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: highlightMentions(comment.content) }}
      />
    </div>
  );
};

export default Comment;
