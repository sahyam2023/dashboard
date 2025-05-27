import React, { useState } from 'react';
import { changePassword, updateEmail } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const UserProfilePage: React.FC = () => {
  const auth = useAuth();

  // State for Change Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null); // General password change errors
  const [newPasswordError, setNewPasswordError] = useState<string>(''); // For new password strength
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // State for Update Email form
  const [newEmail, setNewEmail] = useState('');
  const [confirmPasswordForEmail, setConfirmPasswordForEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const validatePassword = (pwd: string): string => {
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
    return ""; // Empty string means password is valid
  };

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPwd = e.target.value;
    setNewPassword(newPwd);
    const validationError = validatePassword(newPwd);
    setNewPasswordError(validationError);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null); // Clear general errors
    setPasswordSuccess(null);
    
    // Validate new password strength first
    const currentNewPasswordError = validatePassword(newPassword);
    if (currentNewPasswordError) {
      setNewPasswordError(currentNewPasswordError);
      return; // Prevent submission
    } else {
      setNewPasswordError(''); // Clear specific new password error if valid
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    try {
      const response = await changePassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordSuccess(response.msg || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setNewPasswordError(''); // Clear strength error on success
    } catch (error: any) {
      // Check if the backend error is about password strength
      const backendMsg = error.message?.toLowerCase() || '';
      if (backendMsg.includes("password must") || backendMsg.includes("password should")) {
        setNewPasswordError(error.message); // Show backend strength error for new password
      } else {
        setPasswordError(error.message || 'Failed to change password.');
      }
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!newEmail || !confirmPasswordForEmail) {
      setEmailError('Both email and password are required.');
      return;
    }
    // Basic email format validation
    if (!/\S+@\S+\.\S+/.test(newEmail)) {
      setEmailError('Invalid email format.');
      return;
    }

    try {
      const response = await updateEmail({ new_email: newEmail, password: confirmPasswordForEmail });
      setEmailSuccess(response.msg || 'Email updated successfully!');
      setNewEmail('');
      setConfirmPasswordForEmail('');
    } catch (error: any) {
      setEmailError(error.message || 'Failed to update email.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">User Profile</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Change Password Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Change Password</h2>
          {passwordError && <p className="text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 p-3 rounded mb-4">{passwordError}</p>}
          {passwordSuccess && <p className="text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 p-3 rounded mb-4">{passwordSuccess}</p>}
          <form onSubmit={handlePasswordChange}>
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="currentPassword">
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="newPassword">
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={handleNewPasswordChange} // Use new handler
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
              {newPasswordError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{newPasswordError}</p>
              )}
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="confirmNewPassword">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmNewPassword"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 mb-3 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Change Password
            </button>
          </form>
        </div>

        {/* Update Email Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Update Email</h2>
          {emailError && <p className="text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 p-3 rounded mb-4">{emailError}</p>}
          {emailSuccess && <p className="text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 p-3 rounded mb-4">{emailSuccess}</p>}
          <form onSubmit={handleEmailUpdate}>
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="newEmail">
                New Email
              </label>
              <input
                type="email"
                id="newEmail"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="confirmPasswordForEmail">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPasswordForEmail"
                value={confirmPasswordForEmail}
                onChange={(e) => setConfirmPasswordForEmail(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 mb-3 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Update Email
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
