// frontend/src/components/chat/UserList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { User, PaginatedUsersResponse } from './types'; // Ensure PaginatedUsersResponse is defined in types.ts
import * as api from '../../services/api'; // Import your API service

interface UserListProps {
  onUserSelect: (user: User) => void;
}

const UserList: React.FC<UserListProps> = ({ onUserSelect }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const usersPerPage = 20; // Define how many users per page

  // Placeholder fetchUsers function is removed, will use api.getUsers

  const loadUsers = useCallback(async (page: number, search: string) => {
    setLoading(true);
    setError(null);
    try {
      // Use the imported api.getUsers function
      const data: ChatPaginatedUsersResponse = await api.getUsers(page, usersPerPage, search);
      setUsers(data.users);
      setCurrentPage(data.page);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred fetching users');
    } finally {
      setLoading(false);
    }
  }, [usersPerPage]); // usersPerPage is a dependency if it can change, otherwise not strictly needed if constant

  useEffect(() => {
    // Load users when component mounts or when searchTerm changes
    // When searchTerm changes, reset to page 1
    loadUsers(1, searchTerm);
  }, [searchTerm, loadUsers]);


  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    // The useEffect above will trigger loadUsers with page 1 due to searchTerm change
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadUsers(newPage, searchTerm);
    }
  };

  return (
    // Removed outer border/shadow, assuming ChatMain provides container style
    <div className="flex flex-col h-full p-3 bg-gray-50 dark:bg-gray-800">
      {/* Header/Title is now part of ChatMain's "Back to Conversations" button area */}
      {/* <h2 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">Find Users</h2> */}
      <input
        type="text"
        placeholder="Search users..."
        value={searchTerm}
        onChange={handleSearchChange}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />
      {loading && <p className="text-center text-gray-500 dark:text-gray-400 py-4">Loading users...</p>}
      {error && <p className="text-center text-red-500 dark:text-red-400 py-4">Error: {error}</p>}

      {!loading && !error && users.length === 0 && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-4">No users found.</p>
      )}

      <ul className="space-y-1 flex-1 overflow-y-auto"> {/* Changed space-y-2 to space-y-1 for tighter packing */}
        {users.map((user) => (
          <li
            key={user.id}
            onClick={() => onUserSelect(user)}
            className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors duration-150 ease-in-out"
          >
            <img
              src={user.profile_picture_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random&size=36&color=fff`} // Slightly smaller avatar
              alt={user.username}
              className="w-9 h-9 rounded-full mr-3 object-cover flex-shrink-0" // Adjusted size
            />
            <span className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">{user.username}</span>
          </li>
        ))}
      </ul>

      {/* Pagination Controls */}
      {!loading && !error && users.length > 0 && totalPages > 1 && (
        <div className="pt-3 mt-auto border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default UserList;
