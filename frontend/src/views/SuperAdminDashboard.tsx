import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listUsers, updateUserRole, deactivateUser, activateUser, deleteUser, User, UpdateUserRolePayload, PaginatedUsersResponse } from '../services/api';
import DataTable, { ColumnDef } from '../components/DataTable'; // Import DataTable and ColumnDef

const SuperAdminDashboard: React.FC = () => {
  const auth = useAuth();

  // State for data and table controls
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10); // Default items per page
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  // Sorting state
  const [sortBy, setSortBy] = useState<string>('username'); // Default sort column
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Default sort order

  // Feedback and UI state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingRoleForUser, setEditingRoleForUser] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin' | 'super_admin'>('user');

  const fetchUsers = useCallback(async () => {
    if (auth.isAuthenticated && auth.role === 'super_admin') {
      setIsLoading(true);
      setError(null);
      // Feedback is not reset here to persist across page changes if it's a result of an action
      try {
        const response: PaginatedUsersResponse = await listUsers(currentPage, itemsPerPage, sortBy, sortOrder);
        setUsers(response.users);
        setTotalPages(response.total_pages);
        setTotalUsers(response.total_users);
        setCurrentPage(response.page); // Update current page from backend response
        setItemsPerPage(response.per_page); // Update items per page from backend
      } catch (err: any) {
        setUsers([]); // Add this line
        setError(err.message || 'Failed to fetch users.');
        setFeedback({ type: 'error', message: err.message || 'Failed to fetch users.' });
      } finally {
        setIsLoading(false);
      }
    }
  }, [auth.isAuthenticated, auth.role, currentPage, itemsPerPage, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);


  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (auth.role !== 'super_admin') {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold text-red-600">Unauthorized</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };
  
  const handleRoleChangeInitiate = (user: User) => {
    setEditingRoleForUser(user.id);
    setSelectedRole(user.role);
    setFeedback(null);
  };

  const handleRoleUpdate = async (userId: number) => {
    if (!editingRoleForUser || userId !== editingRoleForUser) return;
    setFeedback(null);
    try {
      const payload: UpdateUserRolePayload = { new_role: selectedRole };
      const updatedUser = await updateUserRole(userId, payload);
      // No direct UI update here, rely on fetchUsers to refresh data after action
      setFeedback({ type: 'success', message: `User ${updatedUser.username}'s role updated to ${updatedUser.role}.` });
      fetchUsers(); // Re-fetch users to show updated data and reflect potential sort/page changes
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update role.' });
    } finally {
      setEditingRoleForUser(null);
    }
  };
  
  const handleDeactivate = async (userId: number, username: string) => {
    if (window.confirm(`Are you sure you want to deactivate user ${username}?`)) {
      setFeedback(null);
      try {
        await deactivateUser(userId);
        setFeedback({ type: 'success', message: `User ${username} deactivated.` });
        fetchUsers(); // Re-fetch
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to deactivate ${username}.` });
      }
    }
  };

  const handleActivate = async (userId: number, username: string) => {
     if (window.confirm(`Are you sure you want to activate user ${username}?`)) {
      setFeedback(null);
      try {
        await activateUser(userId); 
        setFeedback({ type: 'success', message: `User ${username} activated.` });
        fetchUsers(); // Re-fetch
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to activate ${username}.` });
      }
    }
  };

  const handleDelete = async (userId: number, username: string) => {
    if (window.confirm(`Are you sure you want to PERMANENTLY DELETE user ${username}? This action cannot be undone.`)) {
      setFeedback(null);
      try {
        await deleteUser(userId);
        setFeedback({ type: 'success', message: `User ${username} deleted.` });
        // If on the last page and it becomes empty, go to previous page or first page
        if (users.length === 1 && currentPage > 1) {
            setCurrentPage(currentPage - 1); 
        } else {
            fetchUsers(); // Otherwise, just re-fetch
        }
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to delete ${username}.` });
      }
    }
  };
  
  const columns: ColumnDef<User>[] = [
    { key: 'username', header: 'Username', sortable: true },
    { key: 'email', header: 'Email', sortable: true, render: (user) => user.email || 'N/A' },
    { 
      key: 'role', 
      header: 'Role', 
      sortable: true,
      render: (user) => {
        if (editingRoleForUser === user.id) {
          return (
            <div className="flex items-center space-x-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'user' | 'admin' | 'super_admin')}
                className="block w-auto pl-3 pr-10 py-1 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                disabled={auth.username === user.username && users.filter(u => u.role === 'super_admin').length <= 1 && selectedRole !== 'super_admin'}
                onClick={(e) => e.stopPropagation()} // Prevent row click if any
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <button
                onClick={(e) => { e.stopPropagation(); handleRoleUpdate(user.id); }}
                className="px-2 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingRoleForUser(null); }}
                className="px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div className="flex items-center space-x-2">
            <span>{user.role}</span>
            {auth.username !== user.username && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleRoleChangeInitiate(user);}}
                className="text-blue-600 hover:text-blue-800 text-xs"
              >
                Edit
              </button>
            )}
            {auth.username === user.username && user.role === 'super_admin' && users.filter(u => u.role === 'super_admin').length <= 1 && (
              <span className="text-xs text-gray-400 italic">(Cannot change role - only Super Admin)</span>
            )}
          </div>
        );
      }
    },
    { 
      key: 'is_active', 
      header: 'Status', 
      sortable: true, 
      render: (user) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
          user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      ) 
    },
    { key: 'created_at', header: 'Created At', sortable: true, render: (user) => user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A' },
    {
      key: 'actions',
      header: 'Actions',
      render: (user) => (
        <div className="space-x-2">
          {user.is_active ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeactivate(user.id, user.username);}}
              className="text-yellow-600 hover:text-yellow-900 disabled:text-gray-400 text-xs"
              disabled={auth.username === user.username && users.filter(u => u.role === 'super_admin' && u.is_active).length <= 1}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleActivate(user.id, user.username);}}
              className="text-green-600 hover:text-green-900 text-xs"
            >
              Activate
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(user.id, user.username);}}
            className="text-red-600 hover:text-red-900 disabled:text-gray-400 text-xs"
            disabled={auth.username === user.username}
          >
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Super Admin Dashboard - User Management</h1>
      
      {feedback && (
        <div className={`p-3 mb-4 rounded ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {feedback.message}
        </div>
      )}
      {/* Display general error if users array is empty and not loading */}
      {error && users.length === 0 && !isLoading && <div className="text-red-500 bg-red-100 p-3 rounded mb-4">Error: {error}</div>}


      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        itemsPerPage={itemsPerPage}
        totalItems={totalUsers}
        sortColumn={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
      />
    </div>
  );
};

export default SuperAdminDashboard;
