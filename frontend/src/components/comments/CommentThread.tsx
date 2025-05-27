import React from 'react';
import { Comment as CommentType } from '../../services/api';
import Comment from './Comment'; // Assuming Comment.tsx is in the same directory

interface CommentThreadProps {
  comments: CommentType[];
  onEditComment: (comment: CommentType) => void;
  onDeleteComment: (commentId: number) => void;
  onReplyToComment: (comment: CommentType) => void;
  currentUserId: number | null;
  replyingToCommentId?: number | null; // ID of the comment currently being replied to
  editingCommentId?: number | null; // ID of the comment currently being edited
  renderReplyForm?: (comment: CommentType) => React.ReactNode; // Function to render reply form
  renderEditForm?: (comment: CommentType) => React.ReactNode; // Function to render edit form
}

const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  onEditComment,
  onDeleteComment,
  onReplyToComment,
  currentUserId,
  replyingToCommentId,
  editingCommentId,
  renderReplyForm,
  renderEditForm,
}) => {
  if (!comments || comments.length === 0) {
    return null; // Or some placeholder like <p>No comments yet.</p> if it's the top-level call
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="comment-item">
          {editingCommentId === comment.id && renderEditForm ? (
            renderEditForm(comment)
          ) : (
            <Comment
              comment={comment}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              onReply={onReplyToComment}
              currentUserId={currentUserId}
            />
          )}

          {replyingToCommentId === comment.id && renderReplyForm && (
            <div className="ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
              {renderReplyForm(comment)}
            </div>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <div className="ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700 mt-2">
              <CommentThread
                comments={comment.replies}
                onEditComment={onEditComment}
                onDeleteComment={onDeleteComment}
                onReplyToComment={onReplyToComment}
                currentUserId={currentUserId}
                replyingToCommentId={replyingToCommentId}
                editingCommentId={editingCommentId}
                renderReplyForm={renderReplyForm}
                renderEditForm={renderEditForm}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CommentThread;
