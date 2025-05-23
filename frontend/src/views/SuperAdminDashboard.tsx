import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { listUsers, updateUserRole, deactivateUser, deleteUser, User, UpdateUserRolePayload } from '../services/api'; 
// activateUser will be added to api.ts later

const SuperAdminDashboard: React.FC = () => {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State for managing role editing
  const [editingRoleForUser, setEditingRoleForUser] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin' | 'super_admin'>('user');

  useEffect(() => {
    if (auth.isAuthenticated && auth.userRole === 'super_admin') {
      fetchUsers();
    }
  }, [auth.isAuthenticated, auth.userRole]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const fetchedUsers = await listUsers();
      setUsers(fetchedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users.');
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch users.' });
    } finally {
      setLoading(false);
    }
  };

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (auth.userRole !== 'super_admin') {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold text-red-600">Unauthorized</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

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
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, role: updatedUser.role } : u));
      setFeedback({ type: 'success', message: `User ${updatedUser.username}'s role updated to ${updatedUser.role}.` });
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
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, is_active: false } : u));
        setFeedback({ type: 'success', message: `User ${username} deactivated.` });
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to deactivate ${username}.` });
      }
    }
  };

  // Placeholder for activateUser - will be implemented in api.ts later
  const handleActivate = async (userId: number, username: string) => {
     if (window.confirm(`Are you sure you want to activate user ${username}?`)) {
      setFeedback(null);
      try {
        // Call the actual activateUser function from api.ts
        await activateUser(userId); 
        setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, is_active: true } : u));
        setFeedback({ type: 'success', message: `User ${username} activated.` });
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
        setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
        setFeedback({ type: 'success', message: `User ${username} deleted.` });
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to delete ${username}.` });
      }
    }
  };

  if (loading) return <div className="container mx-auto p-4">Loading users...</div>;
  if (error && users.length === 0) return <div className="container mx-auto p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Super Admin Dashboard - User Management</h1>
      
      {feedback && (
        <div className={`p-3 mb-4 rounded ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {feedback.message}
        </div>
      )}

      {error && users.length > 0 && <p className="text-red-500 bg-red-100 p-3 rounded mb-4">Error fetching updates: {error}</p>}

      <div className="overflow-x-auto bg-white shadow rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {editingRoleForUser === user.id ? (
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as 'user' | 'admin' | 'super_admin')}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        disabled={auth.currentUser?.id === user.id && users.filter(u => u.role === 'super_admin').length <= 1 && selectedRole !== 'super_admin'}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                      <button
                        onClick={() => handleRoleUpdate(user.id)}
                        className="px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingRoleForUser(null)}
                        className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span>{user.role}</span>
                      {auth.currentUser?.id !== user.id && ( // Prevent super admin from easily changing own role here
                         <button 
                            onClick={() => handleRoleChangeInitiate(user)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                            disabled={auth.currentUser?.id === user.id} // Cannot change own role this way
                          >
                           Edit
                          </button>
                      )}
                       {auth.currentUser?.id === user.id && user.role === 'super_admin' && users.filter(u => u.role === 'super_admin').length <= 1 && (
                        <span className="text-xs text-gray-400 italic">(Cannot change role - only Super Admin)</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  {user.is_active ? (
                    <button
                      onClick={() => handleDeactivate(user.id, user.username)}
                      className="text-yellow-600 hover:text-yellow-900 disabled:text-gray-400"
                      disabled={auth.currentUser?.id === user.id && users.filter(u => u.role === 'super_admin' && u.is_active).length <= 1}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(user.id, user.username)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(user.id, user.username)}
                    className="text-red-600 hover:text-red-900 disabled:text-gray-400"
                    disabled={auth.currentUser?.id === user.id} // Cannot delete self
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
