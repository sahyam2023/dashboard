import React, { useState, useEffect, useCallback } from 'react';
import {
  Comment as CommentType,
  PaginatedCommentsResponse,
  fetchComments,
  deleteComment,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import CommentThread from './CommentThread';
import CommentForm from './CommentForm';
import { showErrorToast, showSuccessToast } from '../../utils/toastUtils';
import { Loader2, RefreshCw, MessageCircle } from 'lucide-react';

interface CommentSectionProps {
  itemId: number;
  itemType: string;
  onCommentAction?: () => void; // New optional callback
}

const CommentSection: React.FC<CommentSectionProps> = ({ itemId, itemType, onCommentAction }) => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [comments, setComments] = useState<CommentType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalComments, setTotalComments] = useState<number>(0);

  const [replyingToComment, setReplyingToComment] = useState<CommentType | null>(null);
  const [editingComment, setEditingComment] = useState<CommentType | null>(null);

  const loadComments = useCallback(async (page: number = 1, keepExisting: boolean = false) => {
    if (!itemId || !itemType) return;
    setIsLoading(true);
    setError(null);
    try {
      const data: PaginatedCommentsResponse = await fetchComments(itemType, itemId, page, 20); // Assuming perPage is 20
      setComments(prevComments => keepExisting ? [...prevComments, ...data.comments] : data.comments);
      setCurrentPage(data.page);
      setTotalPages(data.total_pages);
      setTotalComments(data.total_top_level_comments);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch comments.');
      showErrorToast(err.message || 'Failed to fetch comments.');
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [itemId, itemType]);

  useEffect(() => {
    setIsInitialLoading(true); // Reset for item changes
    setComments([]); // Clear old comments when item changes
    setCurrentPage(1); // Reset page
    setTotalPages(0);
    setTotalComments(0);
    loadComments(1);
  }, [itemId, itemType, loadComments]); // loadComments added as dependency

  const handleCommentAddedOrUpdated = (newOrUpdatedComment: CommentType) => {
    // For simplicity, re-fetch the current page of comments to get the latest state.
    // More sophisticated updates (optimistic or targeted) could be implemented.
    loadComments(currentPage); 
    setReplyingToComment(null); // Close reply form
    setEditingComment(null); // Close edit form
    if (onCommentAction) { // Call the callback
      onCommentAction();
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      try {
        await deleteComment(commentId);
        showSuccessToast('Comment deleted successfully.');
        // Refresh comments: remove the deleted comment and its replies from state or re-fetch
        // Simplified to just re-fetch or call parent to re-fetch all data which includes comments
        // The local state update for comments might still be useful for immediate UI feedback
        // but the parent re-fetch will ensure comment counts are accurate.
        // Consider if loadComments(currentPage) is needed here if parent re-fetches everything.
        // For now, we'll rely on onCommentAction for the parent to refresh.
        // Local immediate update can still be:
        setComments(prevComments => 
          prevComments.reduce((acc, comment) => {
            if (comment.id === commentId) {
              // Assuming totalComments state is managed correctly by loadComments after parent refresh
              return acc;
            }
            if (comment.replies) {
              comment.replies = comment.replies.filter(reply => reply.id !== commentId);
            }
            acc.push(comment);
            return acc;
          }, [] as CommentType[])
        );

        if (onCommentAction) { // Call the callback
          onCommentAction();
        } else {
          // Fallback to local reload if no callback provided, though the goal is parent refresh
          loadComments(currentPage);
        }
      } catch (err: any) {
        showErrorToast(err.message || 'Failed to delete comment.');
      }
    }
  };

  const handleSetReplyToComment = (comment: CommentType | null) => {
    setReplyingToComment(comment);
    setEditingComment(null); // Ensure not editing and replying at the same time
  };

  const handleSetEditingComment = (comment: CommentType | null) => {
    setEditingComment(comment);
    setReplyingToComment(null); // Ensure not editing and replying at the same time
  };

  const renderReplyFormForComment = (comment: CommentType) => {
    return (
      <CommentForm
        itemId={itemId}
        itemType={itemType}
        parentCommentId={comment.id}
        onCommentAddedOrUpdated={handleCommentAddedOrUpdated}
        onCancel={() => handleSetReplyToComment(null)}
      />
    );
  };
  
  const renderEditFormForComment = (comment: CommentType) => {
    return (
      <CommentForm
        itemId={itemId}
        itemType={itemType}
        initialContent={comment.content}
        isEditMode={true}
        commentIdToEdit={comment.id}
        onCommentAddedOrUpdated={handleCommentAddedOrUpdated}
        onCancel={() => handleSetEditingComment(null)}
      />
    );
  };

  if (isInitialLoading) {
    return (
      <div className="flex justify-center items-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading comments...</span>
      </div>
    );
  }

  if (error && comments.length === 0) { // Show error only if no comments are loaded
    return (
      <div className="p-6 text-center text-red-500 dark:text-red-400">
        <p>{error}</p>
        <button
          onClick={() => loadComments(1)}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center mx-auto"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <RefreshCw className="h-5 w-5 mr-2" />}
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg shadow-inner">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center">
        <MessageCircle className="mr-2 h-6 w-6 text-blue-500" />
        Comments ({totalComments})
      </h3>

      {/* Top-level comment form */}
      {user && (
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-1">Add a new comment</h4>
          <CommentForm
            itemId={itemId}
            itemType={itemType}
            onCommentAddedOrUpdated={handleCommentAddedOrUpdated}
          />
        </div>
      )}
      {!user && <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">You need to be logged in to add comments.</p>}


      {comments.length > 0 ? (
        <CommentThread
          comments={comments}
          onEditComment={handleSetEditingComment}
          onDeleteComment={handleDeleteComment}
          onReplyToComment={handleSetReplyToComment}
          currentUserId={currentUserId}
          replyingToCommentId={replyingToComment?.id}
          editingCommentId={editingComment?.id}
          renderReplyForm={renderReplyFormForComment}
          renderEditForm={renderEditFormForComment}
        />
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet. Be the first to comment!</p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center space-x-2">
          <button
            onClick={() => loadComments(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => loadComments(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
       {isLoading && !isInitialLoading && ( // Show non-initial loading indicator (e.g. for pagination)
        <div className="flex justify-center items-center mt-4">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading more comments...</span>
        </div>
      )}
    </div>
  );
};

export default CommentSection;
