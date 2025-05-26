import React, { useEffect, useState, useCallback, FormEvent } from 'react'; // Added FormEvent
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  listUsers, updateUserRole, deactivateUser, activateUser, deleteUser, User, 
  UpdateUserRolePayload, PaginatedUsersResponse,
  changeGlobalPassword, ChangeGlobalPasswordPayload,
  forceUserPasswordReset, // Import the new function
  backupDatabase, // Import backup function
  restoreDatabase, // Import restore function
  getMaintenanceModeStatus,
  enableMaintenanceMode,
  disableMaintenanceMode
} from '../services/api';
import DataTable, { ColumnDef } from '../components/DataTable';

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

  // State for Global Password Change
  const [newGlobalPassword, setNewGlobalPassword] = useState<string>('');
  const [confirmNewGlobalPassword, setConfirmNewGlobalPassword] = useState<string>('');
  const [globalPasswordError, setGlobalPasswordError] = useState<string | null>(null);
  const [globalPasswordSuccess, setGlobalPasswordSuccess] = useState<string | null>(null);
  const [isGlobalPasswordLoading, setIsGlobalPasswordLoading] = useState<boolean>(false);

  // State for Database Backup
  const [isBackupLoading, setIsBackupLoading] = useState<boolean>(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // State for Database Restore
  const [isRestoreLoading, setIsRestoreLoading] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);
  const [restoreFileKey, setRestoreFileKey] = useState<number>(Date.now()); // For resetting file input

  // State for Maintenance Mode
  const [isMaintenanceModeActive, setIsMaintenanceModeActive] = useState<boolean>(false);
  const [isMaintenanceLoading, setIsMaintenanceLoading] = useState<boolean>(true); // Start true for initial fetch
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchMaintenanceStatus = async () => {
      if (auth.isAuthenticated && auth.role === 'super_admin') {
        setIsMaintenanceLoading(true);
        setMaintenanceError(null);
        try {
          const response = await getMaintenanceModeStatus();
          setIsMaintenanceModeActive(response.maintenance_mode_enabled);
        } catch (err: any) {
          console.error("Failed to fetch maintenance mode status:", err);
          setMaintenanceError(err.response?.data?.msg || err.message || "Failed to fetch maintenance status.");
          // Feedback is not set here as this is an initial load error, not action feedback
        } finally {
          setIsMaintenanceLoading(false);
        }
      }
    };
    fetchMaintenanceStatus();
  }, [auth.isAuthenticated, auth.role]);


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

  // Password strength validation function (similar to RegisterForm)
  const validateGlobalPasswordStrength = (pwd: string): string => {
    if (pwd.length < 8) {
      return "Password must be at least 8 characters long.";
    }
    if (!/[A-Z]/.test(pwd)) {
      return "Password must include at least one uppercase letter.";
    }
    if (!/[a-z]/.test(pwd)) {
      return "Password must include at least one lowercase letter.";
    }
    if (!/[0-9]/.test(pwd)) {
      return "Password must include at least one digit.";
    }
    // Could add special character requirement: if (!/[!@#$%^&*]/.test(pwd)) return "..."
    return ""; 
  };
  
  const handleGlobalPasswordChangeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGlobalPasswordError(null);
    setGlobalPasswordSuccess(null);

    if (!newGlobalPassword || !confirmNewGlobalPassword) {
      setGlobalPasswordError("Both password fields are required.");
      return;
    }
    if (newGlobalPassword !== confirmNewGlobalPassword) {
      setGlobalPasswordError("New passwords do not match.");
      return;
    }
    const strengthError = validateGlobalPasswordStrength(newGlobalPassword);
    if (strengthError) {
      setGlobalPasswordError(strengthError);
      return;
    }

    setIsGlobalPasswordLoading(true);
    try {
      const payload: ChangeGlobalPasswordPayload = { new_password: newGlobalPassword };
      const response = await changeGlobalPassword(payload);
      setGlobalPasswordSuccess(response.msg || "Global password updated successfully!");
      setNewGlobalPassword('');
      setConfirmNewGlobalPassword('');
    } catch (err: any) {
      setGlobalPasswordError(err.response?.data?.msg || err.message || "Failed to change global password.");
    } finally {
      setIsGlobalPasswordLoading(false);
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

  const handleToggleMaintenanceMode = async () => {
    setIsMaintenanceLoading(true);
    setMaintenanceError(null);
    setFeedback(null); // Clear general feedback

    const action = isMaintenanceModeActive ? disableMaintenanceMode : enableMaintenanceMode;
    const successMessage = isMaintenanceModeActive ? "Maintenance mode disabled." : "Maintenance mode enabled.";
    const errorMessage = isMaintenanceModeActive ? "Failed to disable maintenance mode." : "Failed to enable maintenance mode.";

    try {
      const response = await action();
      setIsMaintenanceModeActive(response.maintenance_mode_enabled);
      setFeedback({ type: 'success', message: successMessage });
    } catch (err: any) {
      const apiError = err.response?.data?.msg || err.message || errorMessage;
      setMaintenanceError(apiError); // Set specific error for the section
      setFeedback({ type: 'error', message: apiError }); // Also set general feedback
    } finally {
      setIsMaintenanceLoading(false);
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
  
  const handleForceResetPassword = async (userId: number, username: string) => {
    if (window.confirm(`Are you sure you want to require user ${username} to reset their password on next login?`)) {
      setFeedback(null);
      try {
        await forceUserPasswordReset(userId);
        setFeedback({ type: 'success', message: `User ${username} will be required to reset their password on next login.` });
        // Optionally, re-fetch users if the backend modifies the user object (e.g., a flag)
        // fetchUsers(); 
      } catch (err: any) {
        setFeedback({ type: 'error', message: err.message || `Failed to force password reset for ${username}.` });
      }
    }
  };

  const handleBackupDatabase = async () => {
    setIsBackupLoading(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const response = await backupDatabase();
      setBackupMessage(response.message + (response.backup_path ? ` Path: ${response.backup_path}` : ''));
    } catch (err: any) {
      setBackupError(err.response?.data?.msg || err.message || "Failed to create backup.");
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedRestoreFile(event.target.files[0]);
      setRestoreError(null); // Clear error when new file is selected
      setRestoreMessage(null);
    } else {
      setSelectedRestoreFile(null);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedRestoreFile) {
      setRestoreError("Please select a .db backup file to restore.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to restore the database? This will overwrite the current data and cannot be undone. " +
      "It is highly recommended to take a fresh backup before restoring."
    );

    if (confirmed) {
      setIsRestoreLoading(true);
      setRestoreMessage(null);
      setRestoreError(null);

      const formData = new FormData();
      formData.append('backup_file', selectedRestoreFile);

      try {
        const response = await restoreDatabase(formData);
        setRestoreMessage(response.message);
        setSelectedRestoreFile(null); // Clear selection
        setRestoreFileKey(Date.now()); // Reset file input
      } catch (err: any) {
        setRestoreError(err.response?.data?.msg || err.message || "Failed to restore database.");
      } finally {
        setIsRestoreLoading(false);
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
        <div className="space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
          {/* Force Password Reset Button */}
          {user.role !== 'super_admin' && auth.username !== user.username && ( // Ensure not targeting super_admins or self
            <button
              onClick={(e) => { e.stopPropagation(); handleForceResetPassword(user.id, user.username);}}
              className="text-purple-600 hover:text-purple-900 text-xs ml-2" // Added margin-left for spacing
            >
              Force Reset
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="container mx-auto p-4 space-y-8"> {/* Added space-y-8 for overall spacing */}
      <div> {/* Wrapper for User Management Section */}
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
          rowClassName="group" // Added group class for row hover effect
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

      {/* Global Site Password Management Section */}
      <div className="mt-12 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Global Site Password Management</h2>
        
        {globalPasswordError && (
          <div className="p-3 mb-4 rounded bg-red-100 text-red-700 text-sm">
            {globalPasswordError}
          </div>
        )}
        {globalPasswordSuccess && (
          <div className="p-3 mb-4 rounded bg-green-100 text-green-700 text-sm">
            {globalPasswordSuccess}
          </div>
        )}

        <form onSubmit={handleGlobalPasswordChangeSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="newGlobalPassword" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              New Global Password
            </label>
            <input
              id="newGlobalPassword"
              type="password"
              value={newGlobalPassword}
              onChange={(e) => {
                setNewGlobalPassword(e.target.value);
                if (globalPasswordError) setGlobalPasswordError(null); // Clear error on change
                if (globalPasswordSuccess) setGlobalPasswordSuccess(null); 
              }}
              className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              disabled={isGlobalPasswordLoading}
            />
          </div>
          <div>
            <label 
              htmlFor="confirmNewGlobalPassword" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm New Global Password
            </label>
            <input
              id="confirmNewGlobalPassword"
              type="password"
              value={confirmNewGlobalPassword}
              onChange={(e) => {
                setConfirmNewGlobalPassword(e.target.value);
                if (globalPasswordError) setGlobalPasswordError(null); // Clear error on change
                 if (globalPasswordSuccess) setGlobalPasswordSuccess(null);
              }}
              className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              disabled={isGlobalPasswordLoading}
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={isGlobalPasswordLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition-colors"
            >
              {isGlobalPasswordLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                'Change Global Password'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Database Backup Section */}
      <div className="mt-12 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Database Backup</h2>
        {backupError && (
          <div className="p-3 mb-4 rounded bg-red-100 text-red-700 text-sm">
            {backupError}
          </div>
        )}
        {backupMessage && (
          <div className="p-3 mb-4 rounded bg-green-100 text-green-700 text-sm">
            {backupMessage}
          </div>
        )}
        <button
          onClick={handleBackupDatabase}
          disabled={isBackupLoading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60 transition-colors"
        >
          {isBackupLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
          ) : (
            'Create Backup'
          )}
        </button>
      </div>

      {/* Database Restore Section */}
      <div className="mt-12 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Database Restore</h2>
        {restoreError && (
          <div className="p-3 mb-4 rounded bg-red-100 text-red-700 text-sm">
            {restoreError}
          </div>
        )}
        {restoreMessage && (
          <div className="p-3 mb-4 rounded bg-green-100 text-green-700 text-sm">
            {restoreMessage}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label 
              htmlFor="restoreFile" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Select .db Backup File
            </label>
            <input
              id="restoreFile"
              key={restoreFileKey} // Used to reset the input
              type="file"
              accept=".db"
              onChange={handleRestoreFileChange}
              className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              disabled={isRestoreLoading}
            />
          </div>
          <button
            onClick={handleRestoreDatabase}
            disabled={isRestoreLoading || !selectedRestoreFile}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 transition-colors"
          >
            {isRestoreLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            ) : (
              'Restore from Backup'
            )}
          </button>
        </div>
      </div>

      {/* System Maintenance Mode Section */}
      <div className="mt-12 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">System Maintenance Mode</h2>
        
        {maintenanceError && (
          <div className="p-3 mb-4 rounded bg-red-100 text-red-700 text-sm">
            Error: {maintenanceError}
          </div>
        )}

        {isMaintenanceLoading && users.length === 0 && !maintenanceError && ( /* Condition for initial loading of status */
          <div className="text-sm text-gray-500">Loading maintenance status...</div>
        )}

        {!isMaintenanceLoading || users.length > 0 || maintenanceError ? ( /* Show toggle once initial load attempt is done or if users loaded (meaning page is generally ready) */
          <>
            <div className="flex items-center space-x-4 mb-2">
              <label htmlFor="maintenanceToggle" className="flex items-center cursor-pointer">
                <div className="relative">
                  <input 
                    type="checkbox" 
                    id="maintenanceToggle" 
                    className="sr-only" 
                    checked={isMaintenanceModeActive}
                    onChange={handleToggleMaintenanceMode}
                    disabled={isMaintenanceLoading} // Disable during any loading (initial or toggle action)
                  />
                  {/* Styling for the toggle switch */}
                  <div className={`block w-14 h-8 rounded-full transition-colors ${isMaintenanceModeActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <div 
                    className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full shadow-md transition-transform duration-300 ease-in-out ${isMaintenanceModeActive ? 'transform translate-x-6' : ''}`}
                  ></div>
                </div>
              </label>
              <span className={`text-sm font-medium ${isMaintenanceModeActive ? 'text-green-700' : 'text-gray-700'}`}>
                Maintenance Mode is {isMaintenanceModeActive ? 'ACTIVATED' : 'DEACTIVATED'}
              </span>
              {isMaintenanceLoading && ( /* Spinner specifically for toggle action */
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When activated, only Super Administrators can log in. All other users, including regular Admins, will be denied access and active sessions (except Super Admins) may be affected on their next API interaction.
            </p>
          </>
        ) : null }
      </div>

    </div>
  );
};

export default SuperAdminDashboard;
