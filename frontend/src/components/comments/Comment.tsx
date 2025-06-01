import React from 'react';
import { Comment as CommentType } from '../../services/api';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { MessageSquare, Edit3, Trash2, CornerDownRight } from 'lucide-react';
import { formatToISTLocaleString } from '../../utils'; // Updated import

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
          <span className="font-semibold text-gray-800 dark:text-gray-200">{comment.username}</span>
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
