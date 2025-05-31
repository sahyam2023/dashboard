import React, { useEffect, useState, useCallback, FormEvent } from 'react'; // Added FormEvent
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  listUsers, updateUserRole, deactivateUser, activateUser, deleteUser, User,
  UpdateUserRolePayload, PaginatedUsersResponse,
  changeGlobalPassword, ChangeGlobalPasswordPayload,
  forceUserPasswordReset,
  backupDatabase,
  restoreDatabase,
  getMaintenanceModeStatus,
  enableMaintenanceMode,
  disableMaintenanceMode,
  // Permissions related imports
  getUserFilePermissions,
  updateUserFilePermissions,
  fetchDocuments, // To get list of documents
  PaginatedDocumentsResponse
} from '../services/api';
import { FilePermission, FilePermissionUpdatePayload, UpdateUserFilePermissionsResponse, Document as DocumentType } from '../types';


import DataTable, { ColumnDef } from '../components/DataTable';
import Modal from '../components/shared/Modal';
import ConfirmationModal from '../components/shared/ConfirmationModal'; // Added this import
import SuperAdminCreateUserForm from '../components/admin/SuperAdminCreateUserForm'; // Import the new form

// Define a type for the files we'll list for permission editing
interface PermissibleFile {
  id: number;
  name: string;
  type: 'document'; // Initially only documents
}

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

  // State for Create User Form
  const [showCreateUserForm, setShowCreateUserForm] = useState<boolean>(false);


  // Callback for when a user is created by the form
  const handleUserCreated = () => {
    setShowCreateUserForm(false);
    fetchUsers(); // Refresh the user list
    // Optionally, set a success message on the main dashboard
    setFeedback({ type: 'success', message: 'New user created successfully!' });
  };

  // Sorting state
  const [sortBy, setSortBy] = useState<string>('username'); // Default sort column
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Default sort order

  // Feedback and UI state - Main page feedback
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
  const [backupMessage, setBackupMessage] = useState<string | null>(null); // Specific for backup section
  const [backupError, setBackupError] = useState<string | null>(null); // Specific for backup section

  // State for Database Restore
  const [isRestoreLoading, setIsRestoreLoading] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null); // Specific for restore section
  const [restoreError, setRestoreError] = useState<string | null>(null); // Specific for restore section
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);
  const [restoreFileKey, setRestoreFileKey] = useState<number>(Date.now()); // For resetting file input

  // State for Maintenance Mode
  const [isMaintenanceModeActive, setIsMaintenanceModeActive] = useState<boolean>(false);
  const [isMaintenanceLoading, setIsMaintenanceLoading] = useState<boolean>(true); // Start true for initial fetch
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null); // Specific for maintenance section

  // State for Database Reset
  const [resetStep, setResetStep] = useState<number>(0); // 0: idle, 1: warning1, 2: warning2, 3: warning3, 4: reason form, 5: awaitingPassword confirmation
  const [resetReason, setResetReason] = useState<string>('');
  const [resetProcessPassword, setResetProcessPassword] = useState<string>('');
  const [resetProcessConfirmText, setResetProcessConfirmText] = useState<string>('');
  const [isResettingDatabase, setIsResettingDatabase] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null); // For errors displayed within modals
  const [resetFeedback, setResetFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null); // For feedback on main page


  // --- State for File Permissions Management ---
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<User | null>(null);
  const [userFilePermissions, setUserFilePermissions] = useState<FilePermission[]>([]);
  const [allFilesForPermissions, setAllFilesForPermissions] = useState<PermissibleFile[]>([]);
  const [permissionsToUpdate, setPermissionsToUpdate] = useState<FilePermissionUpdatePayload[]>([]);
  
  const [isPermissionsLoading, setIsPermissionsLoading] = useState<boolean>(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [permissionsFeedback, setPermissionsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [permissionSearchTerm, setPermissionSearchTerm] = useState<string>(''); // State for search term
  // --- End State for File Permissions Management ---

  const handlePermissionChange = (fileId: number, fileType: 'document', permissionType: 'can_view' | 'can_download', value: boolean) => {
    setPermissionsToUpdate(prev => {
      let updatedItem;
      const existingIndex = prev.findIndex(p => p.file_id === fileId && p.file_type === fileType);
      if (existingIndex > -1) {
        // Update existing permission
        const newState = prev.map((p, index) => {
          if (index === existingIndex) {
            updatedItem = { ...p, [permissionType]: value };
            return updatedItem;
          }
          return p;
        });
        return newState;
      } else {
        const fileInfo = allFilesForPermissions.find(f => f.id === fileId && f.type === fileType);
        if (fileInfo) {
            updatedItem = {
                file_id: fileInfo.id,
                file_type: fileInfo.type as 'document',
                can_view: true, 
                can_download: true,
            };
            updatedItem[permissionType] = value;
            return [...prev, updatedItem];
        }
      }
      return prev; 
    });
    // Clear feedback when user starts making changes
    if (permissionsFeedback) setPermissionsFeedback(null); // Clear modal-specific feedback
    if (permissionsError) setPermissionsError(null); // Clear modal-specific error
  };

  const handleSavePermissions = async () => {
    if (!selectedUserForPermissions) {
      setPermissionsFeedback({ type: 'error', message: "No user selected." }); // Use modal-specific feedback
      return;
    }
    setIsPermissionsLoading(true);
    setPermissionsError(null);
    setPermissionsFeedback(null);

    // Ensure all items have boolean values for can_view and can_download
    const validatedPayload = permissionsToUpdate.map(p => ({
      ...p,
      can_view: typeof p.can_view === 'boolean' ? p.can_view : false, // Default to false if not boolean
      can_download: typeof p.can_download === 'boolean' ? p.can_download : false, // Default to false if not boolean
    }));


    try {
      const response = await updateUserFilePermissions(selectedUserForPermissions.id, validatedPayload);
      setPermissionsFeedback({ type: 'success', message: response.msg || "Permissions updated successfully!" });
      
      // Refresh userFilePermissions with the newly saved data from the response
      const backendPermissions = response.permissions || [];
      setUserFilePermissions(backendPermissions);
      
      // Re-initialize permissionsToUpdate based on the *newly saved* permissions and allFilesForPermissions
      // This ensures the UI checkboxes correctly reflect the actual persisted state.
      const updatedPermissionsToDisplay = allFilesForPermissions.map(file => {
        const savedPerm = backendPermissions.find(p => p.file_id === file.id && p.file_type === file.type);
        const newPermEntry = {
          file_id: file.id,
          file_type: file.type as 'document', 
          can_view: savedPerm ? Boolean(savedPerm.can_view) : true, 
          can_download: savedPerm ? Boolean(savedPerm.can_download) : true,
        };
        return newPermEntry;
      });
      setPermissionsToUpdate(updatedPermissionsToDisplay);

    } catch (err: any) {
      console.error("Error saving permissions:", err);
      const errMsg = err.response?.data?.msg || err.message || "Failed to save permissions.";
      setPermissionsError(errMsg);  // Use modal-specific error
      setPermissionsFeedback({ type: 'error', message: errMsg }); // Use modal-specific feedback
    } finally {
      setIsPermissionsLoading(false);
    }
  };

  const closePermissionsSection = () => {
    setSelectedUserForPermissions(null);
    setUserFilePermissions([]);
    setAllFilesForPermissions([]);
    setPermissionsToUpdate([]);
    setPermissionsError(null); // Clear modal-specific error
    setPermissionsFeedback(null); // Clear modal-specific feedback
    setPermissionSearchTerm(''); // Clear search term on close
  };

  const fetchUsers = useCallback(async () => {
    if (auth.isAuthenticated && auth.user?.role === 'super_admin') { 
      setIsLoading(true);
      setError(null); // Clear general error related to user fetching
      // Main page feedback is not reset here to persist across page changes if it's a result of an action on the main list
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
  }, [auth.isAuthenticated, auth.user?.role, currentPage, itemsPerPage, sortBy, sortOrder]); // Updated

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const fetchMaintenanceStatus = async () => {
      if (auth.isAuthenticated && auth.user?.role === 'super_admin') { // Updated
        setIsMaintenanceLoading(true);
        setMaintenanceError(null);
        try {
          const response = await getMaintenanceModeStatus();
          setIsMaintenanceModeActive(response.maintenance_mode_enabled);
        } catch (err: any) {
          console.error("Failed to fetch maintenance mode status:", err);
        const apiError = err.response?.data?.msg || err.message || "Failed to fetch maintenance status.";
        setMaintenanceError(apiError); // Set specific error for the section
        // Main page feedback could also be set if this is considered a critical initial load failure
        // setFeedback({ type: 'error', message: apiError }); 
        } finally {
          setIsMaintenanceLoading(false);
        }
      }
    };
    fetchMaintenanceStatus();
  }, [auth.isAuthenticated, auth.user?.role]); // Updated

  // Effect to fetch documents and user permissions when a user is selected for permission editing
  useEffect(() => {
    if (selectedUserForPermissions) {
      const fetchDataForPermissions = async () => {
        if (!auth.isAuthenticated || auth.user?.role !== 'super_admin') {
          setPermissionsError("User not authorized for this action."); // Use modal-specific error
          setIsPermissionsLoading(false);
          return;
        }
        setIsPermissionsLoading(true);
        setPermissionsError(null); // Clear modal-specific error
        setPermissionsFeedback(null); // Clear modal-specific feedback
        setUserFilePermissions([]); 
        setAllFilesForPermissions([]);
        setPermissionsToUpdate([]);

        try {
          const docsResponse: PaginatedDocumentsResponse = await fetchDocuments(undefined, 1, 100); 
          const documentsAsPermissibleFiles: PermissibleFile[] = docsResponse.documents.map(doc => ({
            id: doc.id,
            name: doc.doc_name,
            type: 'document',
          }));
          setAllFilesForPermissions(documentsAsPermissibleFiles);

          const fetchedPermissions = await getUserFilePermissions(selectedUserForPermissions.id);
          setUserFilePermissions(fetchedPermissions);
          
          const initialUpdates: FilePermissionUpdatePayload[] = documentsAsPermissibleFiles.map(file => {
            const existingPerm = fetchedPermissions.find(p => p.file_id === file.id && p.file_type === file.type);
            const canView = existingPerm ? Boolean(existingPerm.can_view) : true; // Default to true (permissive)
            const canDownload = existingPerm ? Boolean(existingPerm.can_download) : true; // Default to true
            return {
              file_id: file.id,
              file_type: file.type,
              can_view: canView,
              can_download: canDownload,
            };
          });
          setPermissionsToUpdate(initialUpdates);

        } catch (err: any) {
          console.error("Error fetching data for permissions:", err);
          const errMsg = err.message || "Failed to fetch data for permissions.";
          setPermissionsError(errMsg); // Use modal-specific error
          setPermissionsFeedback({ type: 'error', message: errMsg }); // Use modal-specific feedback
        } finally {
          setIsPermissionsLoading(false);
        }
      };
      fetchDataForPermissions();
    }
  }, [selectedUserForPermissions, auth.isAuthenticated, auth.user?.role]);


  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (auth.user?.role !== 'super_admin') { // Updated
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

  // --- Database Reset Handlers ---
  const handleResetSubmitReason = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetReason.trim() === '') {
      setResetError("Reason cannot be empty."); // Show error in modal
      return;
    }
    setIsResettingDatabase(true);
    setResetError(null); // Clear error in modal
    setResetFeedback(null); // Clear main page feedback

    try {
      const response = await startDatabaseReset(resetReason);
      setResetFeedback({ type: 'success', message: response.message || "Database reset process initiated. Backup created." });
      setResetStep(5); // Advance to awaitingPassword confirmation step
      setResetReason(''); // Clear reason after successful submission
      setResetError(null); // Clear any modal errors
    } catch (err: any) {
      const errorMessage = err.response?.data?.msg || err.message || "Failed to start database reset process.";
      setResetError(errorMessage); // Show error in the reason modal
      setResetFeedback({ type: 'error', message: errorMessage }); // Also show on main page if preferred
    } finally {
      setIsResettingDatabase(false);
    }
  };

  const handleFinalResetConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetProcessPassword.trim() === '' || resetProcessConfirmText.trim() === '') {
      setResetError("Password and confirmation text are required."); // Show error in final confirm modal
      return;
    }
    setIsResettingDatabase(true);
    setResetError(null); // Clear modal error
    setResetFeedback(null); // Clear main page feedback

    try {
      const response = await confirmDatabaseReset(resetProcessPassword, resetProcessConfirmText);
      setResetFeedback({ type: 'success', message: response.message || "Database has been successfully reset." });
      setResetStep(0); // Reset to idle/initial state
      setResetReason('');
      setResetProcessPassword('');
      setResetProcessConfirmText('');
      setResetError(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.msg || err.message || "Failed to confirm database reset.";
      setResetError(errorMessage); // Show error in final confirm modal
      setResetFeedback({ type: 'error', message: errorMessage}); // Also show on main page
    } finally {
      setIsResettingDatabase(false);
    }
  };
  // --- End Database Reset Handlers ---

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
                className="block w-auto pl-3 pr-10 py-1.5 text-sm border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                disabled={auth.user?.username === user.username && users.filter(u => u.role === 'super_admin').length <= 1 && selectedRole !== 'super_admin'}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <button
                onClick={(e) => { e.stopPropagation(); handleRoleUpdate(user.id); }}
                className="px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingRoleForUser(null); }}
                className="px-3 py-1 border border-gray-300 dark:border-gray-500 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 shadow-sm"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div className="flex items-center space-x-2">
            <span>{user.role}</span>
            {auth.user?.username !== user.username && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleRoleChangeInitiate(user);}}
                className="text-blue-600 hover:text-blue-700 text-xs font-medium"
              >
                Edit
              </button>
            )}
            {auth.user?.username === user.username && user.role === 'super_admin' && users.filter(u => u.role === 'super_admin').length <= 1 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">(Cannot change role - only Super Admin)</span>
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
        <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${
          user.is_active ? 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100' : 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-100'
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
        <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {user.is_active ? (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeactivate(user.id, user.username);}}
              className="text-yellow-600 hover:text-yellow-700 disabled:text-gray-400 dark:disabled:text-gray-500 text-xs font-medium"
              disabled={auth.user?.username === user.username && users.filter(u => u.role === 'super_admin' && u.is_active).length <= 1}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleActivate(user.id, user.username);}}
              className="text-green-600 hover:text-green-700 text-xs font-medium"
            >
              Activate
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(user.id, user.username);}}
            className="text-red-600 hover:text-red-700 disabled:text-gray-400 dark:disabled:text-gray-500 text-xs font-medium"
            disabled={auth.user?.username === user.username}
          >
            Delete
          </button>
          {user.role !== 'super_admin' && auth.user?.username !== user.username && (
            <button
              onClick={(e) => { e.stopPropagation(); handleForceResetPassword(user.id, user.username);}}
              className="text-purple-600 hover:text-purple-700 text-xs font-medium"
            >
              Force Reset
            </button>
          )}
           <button
              onClick={(e) => { e.stopPropagation(); setSelectedUserForPermissions(user); }}
              className="text-teal-600 hover:text-teal-700 text-xs font-medium"
            >
              Permissions
            </button>
        </div>
      )
    }
  ];

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-10 md:space-y-12">
      {/* User Management Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">User Management</h1>
          <button
            onClick={() => setShowCreateUserForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition ease-in-out duration-150"
          >
            Create User
          </button>
        </div>
        
        {feedback && (
          <div className={`p-4 mb-6 rounded-lg text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 border border-green-200 dark:border-green-700' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 border border-red-200 dark:border-red-700'}`}>
            {feedback.message}
          </div>
        )}
        {error && users.length === 0 && !isLoading && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-200 p-4 rounded-lg mb-6 text-sm">Error: {error}</div>}

        <DataTable
          columns={columns}
          data={users}
          rowClassName="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" 
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
      </section>

      {/* Global Site Password Management Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Global Site Password</h2>
        
        {globalPasswordError && (
          <div className="p-3 mb-4 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">
            {globalPasswordError}
          </div>
        )}
        {globalPasswordSuccess && (
          <div className="p-3 mb-4 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-700 text-sm">
            {globalPasswordSuccess}
          </div>
        )}

        <form onSubmit={handleGlobalPasswordChangeSubmit} className="space-y-4">
          <div>
            <label htmlFor="newGlobalPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Global Password</label>
            <input
              id="newGlobalPassword"
              type="password"
              value={newGlobalPassword}
              onChange={(e) => {
                setNewGlobalPassword(e.target.value);
                if (globalPasswordError) setGlobalPasswordError(null); 
                if (globalPasswordSuccess) setGlobalPasswordSuccess(null); 
              }}
              className="block w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              required
              disabled={isGlobalPasswordLoading}
            />
          </div>
          <div>
            <label htmlFor="confirmNewGlobalPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Global Password</label>
            <input
              id="confirmNewGlobalPassword"
              type="password"
              value={confirmNewGlobalPassword}
              onChange={(e) => {
                setConfirmNewGlobalPassword(e.target.value);
                if (globalPasswordError) setGlobalPasswordError(null);
                 if (globalPasswordSuccess) setGlobalPasswordSuccess(null);
              }}
              className="block w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
              required
              disabled={isGlobalPasswordLoading}
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={isGlobalPasswordLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 transition-colors"
            >
              {isGlobalPasswordLoading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : 'Change Global Password'}
            </button>
          </div>
        </form>
      </section>

      {/* Database Backup Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Database Backup</h2>
        {backupError && <div className="p-3 mb-4 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">{backupError}</div>}
        {backupMessage && <div className="p-3 mb-4 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-700 text-sm">{backupMessage}</div>}
        <button
          onClick={handleBackupDatabase}
          disabled={isBackupLoading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60 transition-colors"
        >
          {isBackupLoading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : 'Create Backup'}
        </button>
      </section>

      {/* Database Restore Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Database Restore</h2>
        {restoreError && <div className="p-3 mb-4 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">{restoreError}</div>}
        {restoreMessage && <div className="p-3 mb-4 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-700 text-sm">{restoreMessage}</div>}
        <div className="space-y-4">
          <div>
            <label htmlFor="restoreFile" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select .db Backup File</label>
            <input
              id="restoreFile"
              key={restoreFileKey}
              type="file"
              accept=".db"
              onChange={handleRestoreFileChange}
              className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-gray-600 file:text-blue-700 dark:file:text-gray-200 hover:file:bg-blue-100 dark:hover:file:bg-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700"
              disabled={isRestoreLoading}
            />
          </div>
          <button
            onClick={handleRestoreDatabase}
            disabled={isRestoreLoading || !selectedRestoreFile}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 transition-colors"
          >
            {isRestoreLoading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : 'Restore from Backup'}
          </button>
        </div>
      </section>

      {/* Database Reset Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">Reset Database</h2>
        {resetFeedback && (
          <div className={`p-3 mb-4 rounded-md text-sm ${resetFeedback.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
            {resetFeedback.message}
          </div>
        )}
        <button
          onClick={() => {
            setResetFeedback(null); // Clear previous feedback
            setResetError(null); // Clear previous modal error
            setResetStep(1);
          }}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-60 transition-colors"
          disabled={isResettingDatabase || resetStep !== 0} // Disable if already in a reset step
        >
          {isResettingDatabase ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : 'Reset Database'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          This action will permanently delete all data in the database. This process involves multiple confirmation steps.
        </p>
      </section>

      {/* System Maintenance Mode Section */}
      <section className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-gray-100">System Maintenance Mode</h2>
        
        {maintenanceError && <div className="p-3 mb-4 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">Error: {maintenanceError}</div>}

        {isMaintenanceLoading && !users.length && !maintenanceError && <div className="text-sm text-gray-500 dark:text-gray-400">Loading maintenance status...</div>}

        {(!isMaintenanceLoading || users.length > 0 || maintenanceError) && (
          <>
            <div className="flex items-center space-x-4 mb-3">
              <label htmlFor="maintenanceToggle" className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" id="maintenanceToggle" className="sr-only" checked={isMaintenanceModeActive} onChange={handleToggleMaintenanceMode} disabled={isMaintenanceLoading} />
                  <div className={`block w-14 h-8 rounded-full transition-colors ${isMaintenanceModeActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white dark:bg-gray-300 w-6 h-6 rounded-full shadow-md transition-transform duration-300 ease-in-out ${isMaintenanceModeActive ? 'transform translate-x-6' : ''}`}></div>
                </div>
              </label>
              <span className={`text-sm font-medium ${isMaintenanceModeActive ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                Maintenance Mode is {isMaintenanceModeActive ? 'ACTIVATED' : 'DEACTIVATED'}
              </span>
              {isMaintenanceLoading && <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              When activated, only Super Administrators can log in. Other users will be denied access.
            </p>
          </>
        )}
      </section>

      {/* Permissions Management Section - Modal */}
      <Modal
        isOpen={selectedUserForPermissions !== null}
        onClose={closePermissionsSection}
        title={selectedUserForPermissions ? `File Permissions: ${selectedUserForPermissions.username}` : ''}
      >
        <div className="mt-4">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search files..."
              value={permissionSearchTerm}
              onChange={(e) => setPermissionSearchTerm(e.target.value)}
              className="block w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {isPermissionsLoading && <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Loading permissions...</div>}
          {permissionsError && <div className="p-3 mb-4 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">{permissionsError}</div>}
          {permissionsFeedback && (
            <div className={`p-3 mb-4 rounded-md text-sm ${permissionsFeedback.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
              {permissionsFeedback.message}
            </div>
          )}

          {!isPermissionsLoading && !permissionsError && allFilesForPermissions.length > 0 && (
            <form onSubmit={(e) => { e.preventDefault(); handleSavePermissions(); }} className="space-y-4">
              <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-1 bg-gray-50 dark:bg-gray-800/50">
                {allFilesForPermissions.filter(file => 
                  file.name.toLowerCase().includes(permissionSearchTerm.toLowerCase())
                ).map((file) => {
                  const currentPermission = permissionsToUpdate.find(p => p.file_id === file.id && p.file_type === file.type);
                  return (
                    <div key={`${file.type}-${file.id}`} className="p-3 border-b border-gray-200 dark:border-gray-600 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors duration-150 bg-white dark:bg-gray-700 shadow-sm my-1">
                      <h4 className="font-medium text-gray-800 dark:text-gray-100 truncate" title={file.name}>{file.name} <span className="text-xs text-gray-500 dark:text-gray-400">({file.type.replace('_', ' ')})</span></h4>
                      <div className="flex items-center space-x-6 mt-2.5">
                        <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-600 checked:bg-blue-600 dark:checked:bg-blue-500"
                            checked={currentPermission?.can_view ?? true} // Default to true if undefined
                            onChange={(e) => handlePermissionChange(file.id, file.type, 'can_view', e.target.checked)}
                          />
                          <span>View</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-600 checked:bg-blue-600 dark:checked:bg-blue-500"
                            checked={currentPermission?.can_download ?? true} // Default to true if undefined
                            onChange={(e) => handlePermissionChange(file.id, file.type, 'can_download', e.target.checked)}
                          />
                          <span>Download</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-3"> 
                <button
                  type="submit"
                  disabled={isPermissionsLoading}
                  className="px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isPermissionsLoading ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </form>
          )}
           {!isPermissionsLoading && !permissionsError && allFilesForPermissions.filter(file => file.name.toLowerCase().includes(permissionSearchTerm.toLowerCase())).length === 0 && allFilesForPermissions.length > 0 && (
             <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No files match your search term.</p>
           )}
          {!isPermissionsLoading && !permissionsError && allFilesForPermissions.length === 0 && (
             <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No documents found to set permissions for. Ensure documents are uploaded.</p>
           )}
        </div>
      </Modal>

      {/* Modal for Creating New User */}
      <Modal
        isOpen={showCreateUserForm}
        onClose={() => setShowCreateUserForm(false)}
        title="Create New User"
      >
        <SuperAdminCreateUserForm
          onUserCreated={handleUserCreated}
          onCancel={() => setShowCreateUserForm(false)}
        />
      </Modal>

      {/* Database Reset Modals */}
      {resetStep === 1 && (
        <ConfirmationModal
          isOpen={resetStep === 1}
          title="Confirm Database Reset - Step 1/3"
          message={<span className="text-red-700 dark:text-red-300 font-semibold">This will delete EVERYTHING in the database. Are you sure you want to proceed?</span>}
          onConfirm={() => setResetStep(2)}
          onCancel={() => { setResetStep(0); setResetFeedback(null); }}
          confirmButtonText="Yes, I'm sure"
          cancelButtonText="No, cancel"
          confirmButtonVariant="danger"
        />
      )}
      {resetStep === 2 && (
        <ConfirmationModal
          isOpen={resetStep === 2}
          title="Confirm Database Reset - Step 2/3"
          message={<span className="text-red-700 dark:text-red-300 font-semibold">This action is IRREVERSIBLE. Once the database is reset, the data cannot be recovered. Are you absolutely sure?</span>}
          onConfirm={() => setResetStep(3)}
          onCancel={() => { setResetStep(0); setResetFeedback(null); }}
          confirmButtonText="Yes, I understand the risk"
          cancelButtonText="No, cancel"
          confirmButtonVariant="danger"
        />
      )}
      {resetStep === 3 && (
        <ConfirmationModal
          isOpen={resetStep === 3}
          title="Confirm Database Reset - Step 3/3"
          message={<span className="text-yellow-600 dark:text-yellow-400 font-semibold">FINAL WARNING: Proceeding will open a form for you to state your reason before the reset. This is your last chance to cancel.</span>}
          onConfirm={() => { setResetStep(4); setResetError(null); }} // Proceed to reason form & clear previous errors
          onCancel={() => { setResetStep(0); setResetFeedback(null); }}
          confirmButtonText="Yes, proceed to reason form"
          cancelButtonText="No, cancel"
          confirmButtonVariant="warning" // Changed to warning for the last confirmation
        />
      )}

      {resetStep === 4 && (
        <Modal
          isOpen={resetStep === 4}
          onClose={() => { // This will be triggered by the Modal's default close if showCloseButton were true
            setResetStep(0);
            setResetReason('');
            setResetError(null);
            setResetFeedback(null);
          }}
          title="Reason for Database Reset"
          showCloseButton={false} // Using custom buttons in the form
        >
          <form
            onSubmit={handleResetSubmitReason} // Updated to call the new handler
            className="space-y-4"
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              For security and auditing purposes, please provide a reason for resetting the database. This reason will be logged.
              Your action will be recorded along with this reason. This is a critical operation.
            </p>
            <div>
              <label htmlFor="resetReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason for Reset <span className="text-red-500">*</span>
              </label>
              <textarea
                id="resetReason"
                value={resetReason}
                onChange={(e) => {
                    setResetReason(e.target.value);
                    if(resetError && e.target.value.trim() !== '') setResetError(null);
                }}
                rows={4}
                className={`block w-full px-3 py-2 border ${resetError && resetReason.trim() === '' ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500`}
                required
                disabled={isResettingDatabase}
                aria-describedby={resetError && resetReason.trim() === '' ? "resetReason-error" : undefined}
              />
               {resetError && resetReason.trim() === '' && <p id="resetReason-error" className="text-red-500 text-xs mt-1">{resetError}</p>}
            </div>
            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-3 border-t border-gray-200 dark:border-gray-700 mt-5">
              <button
                type="button"
                onClick={() => {
                  setResetStep(0);
                  setResetReason('');
                  setResetError(null);
                  setResetFeedback({type: 'error', message: 'Database reset cancelled.'});
                }}
                disabled={isResettingDatabase}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 dark:border-gray-500"
              >
                Cancel Reset Process
              </button>
              <button
                type="submit"
                disabled={isResettingDatabase || !resetReason.trim()}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-300 dark:disabled:bg-red-400 transition-opacity"
              >
                {isResettingDatabase ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Processing...
                  </span>
                ) : 'Submit and Reset Database'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Step 5: Final Confirmation with Password */}
      {resetStep === 5 && (
        <Modal
          isOpen={resetStep === 5}
          onClose={() => { /* No direct close, only via buttons */ }}
          title="Final Database Reset Confirmation"
          showCloseButton={false}
        >
          <form onSubmit={handleFinalResetConfirm} className="space-y-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              This is the final step. The database backup has been created.
              To proceed with the reset, please enter the confirmation password and text.
            </p>

            {resetError && <div className="p-3 rounded-md bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-700 text-sm">{resetError}</div>}

            <div>
              <label htmlFor="resetProcessPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirmation Password
              </label>
              <input
                id="resetProcessPassword"
                type="password"
                value={resetProcessPassword}
                onChange={(e) => {
                  setResetProcessPassword(e.target.value);
                  if (resetError) setResetError(null);
                }}
                className={`block w-full px-3 py-2 border ${!resetProcessPassword.trim() && resetError ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500`}
                required
                disabled={isResettingDatabase}
              />
            </div>

            <div>
              <label htmlFor="resetProcessConfirmText" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type "CONFIRM DELETE"
              </label>
              <input
                id="resetProcessConfirmText"
                type="text"
                value={resetProcessConfirmText}
                onChange={(e) => {
                  setResetProcessConfirmText(e.target.value);
                   if (resetError) setResetError(null);
                }}
                className={`block w-full px-3 py-2 border ${!resetProcessConfirmText.trim() && resetError ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500`}
                required
                disabled={isResettingDatabase}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-3 border-t border-gray-200 dark:border-gray-700 mt-5">
              <button
                type="button"
                onClick={() => {
                  setResetStep(0); // Go back to idle
                  setResetReason('');
                  setResetProcessPassword('');
                  setResetProcessConfirmText('');
                  setResetError(null);
                  setResetFeedback({ type: 'error', message: 'Database reset process cancelled by user at final confirmation.' });
                }}
                disabled={isResettingDatabase}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 dark:border-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResettingDatabase || !resetProcessPassword.trim() || !resetProcessConfirmText.trim()}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400 dark:disabled:bg-red-500 transition-opacity"
              >
                {isResettingDatabase ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Resetting...
                  </span>
                ) : 'Confirm and Reset Database Now'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
