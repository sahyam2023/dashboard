import React, { useState, useEffect } from 'react';
import { changePassword, updateEmail, uploadUserProfilePicture, updateUsername } from '../services/api'; // Added updateUsername
import { useAuth } from '../context/AuthContext';
import Modal from '../components/shared/Modal'; // Import Modal
import { useWatch } from '../context/WatchContext'; // Import useWatch
import { Navigate } from 'react-router-dom';
import { Camera, PlusCircle, CheckCircle, MessageCircleQuestion } from 'lucide-react'; // For icon // Added MessageCircleQuestion 
import { showSuccessToast, showErrorToast } from '../utils/toastUtils'; 
import { submitUserFeedback } from '../services/api'; // Added for feedback


const UserProfilePage: React.FC = () => {
  const auth = useAuth();
  const { 
    watchPreferences: contextWatchPreferences,
    isLoading: isLoadingContextWatchPreferences,
    updatePreference, 
    isWatching 
  } = useWatch();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7000';
  // State for Profile Picture
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isWatchModalOpen, setIsWatchModalOpen] = useState(false);
  // const [uploadError, setUploadError] = useState<string | null>(null); // Replaced by toast
  // const [uploadSuccess, setUploadSuccess] = useState<string | null>(null); // Replaced by toast


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

  // State for Update Username form
  const [newUsername, setNewUsername] = useState('');
  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  // State for Feedback Modal
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feedback'>('feedback');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // State for Watch Preferences
  // Using imported types
  // type WatchPreferenceFromType = import('../types').WatchPreference;
  // type UpdateWatchPreferencePayloadFromType = import('../types').UpdateWatchPreferencePayload;

  // Configuration for watchable content types and categories
  const CONTENT_WATCH_CONFIG = {
    documents: { displayName: 'Documents', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    patches: { displayName: 'Patches', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    links: { displayName: 'Links', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    misc: { displayName: 'Miscellaneous', categories: null }, // No specific subcategories for misc
  };
  type ContentTypeKey = keyof typeof CONTENT_WATCH_CONFIG;

  const handleWatchToggle = async (contentType: ContentTypeKey, category: string | undefined, currentlyWatching: boolean) => {
    // isSavingWatchPreferences is now isLoadingContextWatchPreferences from context
    // No need to manually set it here as updatePreference in context will handle its loading state.
    await updatePreference(contentType, category ?? null, !currentlyWatching);
    // The context will handle updating its own watchPreferences state,
    // which will cause this component to re-render with the new state.
    // Toasts for success/failure are handled by updatePreference in context or can be added here if specific messages are needed.
  };

  const handleUsernameChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(null);

    if (!newUsername || !currentPasswordForUsername) {
      setUsernameError('New username and current password are required.');
      return;
    }
    if (newUsername.length < 3) { 
      setUsernameError('New username must be at least 3 characters long.');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const response = await updateUsername({ new_username: newUsername, current_password: currentPasswordForUsername });
      showSuccessToast(response.msg || 'Username updated successfully!');
      setUsernameSuccess(response.msg || 'Username updated successfully!');
      
      if (auth && auth.updateAuthUsername) { 
        auth.updateAuthUsername(response.new_username);
      } else {
        console.warn("AuthContext does not have updateAuthUsername method. UI might not reflect new username immediately.");
      }
      setNewUsername(''); 
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to update username.');
      setUsernameError(error.message || 'Failed to update username.');
    } finally {
      setCurrentPasswordForUsername(''); 
      setIsUpdatingUsername(false);
    }
  };

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
    
    const currentNewPasswordError = validatePassword(newPassword);
    if (currentNewPasswordError) {
      setNewPasswordError(currentNewPasswordError);
      return; 
    } else {
      setNewPasswordError(''); 
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
      showSuccessToast(response.msg || 'Password changed successfully!'); // Use toast
      setPasswordSuccess(response.msg || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setNewPasswordError(''); 
    } catch (error: any) {
      const backendMsg = error.message?.toLowerCase() || '';
      if (backendMsg.includes("password must") || backendMsg.includes("password should")) {
        setNewPasswordError(error.message); 
      } else {
        setPasswordError(error.message || 'Failed to change password.');
      }
      showErrorToast(error.message || 'Failed to change password.'); // Use toast
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
    if (!/\S+@\S+\.\S+/.test(newEmail)) {
      setEmailError('Invalid email format.');
      return;
    }

    try {
      const response = await updateEmail({ new_email: newEmail, password: confirmPasswordForEmail });
      showSuccessToast(response.msg || 'Email updated successfully!'); // Use toast
      setEmailSuccess(response.msg || 'Email updated successfully!');
      setNewEmail('');
      setConfirmPasswordForEmail('');
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to update email.'); // Use toast
      setEmailError(error.message || 'Failed to update email.');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      // setUploadError(null); // Clear previous errors - handled by toast
      // setUploadSuccess(null); // - handled by toast
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  const handlePictureUpload = async () => {
    if (!selectedFile) {
      showErrorToast("Please select a file first."); 
      return;
    }
    setIsUploading(true);

    const formData = new FormData();
    formData.append('profile_picture', selectedFile);

    try {
      const response = await uploadUserProfilePicture(formData);
      showSuccessToast(response.msg || "Profile picture updated successfully!"); 
      if (auth.user && response.profile_picture_url) {
        auth.updateUserProfilePictureUrl(response.profile_picture_url);
      }
      setSelectedFile(null);
      setPreviewUrl(null); 
    } catch (error: any) {
      showErrorToast(error.message || "Failed to upload profile picture."); 
      console.error("Profile picture upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      showErrorToast("Feedback message cannot be empty.");
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      await submitUserFeedback({ message_content: feedbackMessage, type: feedbackType });
      showSuccessToast("Feedback submitted successfully!");
      setIsFeedbackModalOpen(false);
      setFeedbackMessage('');
      setFeedbackType('feedback');
    } catch (error: any) {
      showErrorToast(error.message || "Failed to submit feedback.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };
  
  useEffect(() => {
    if (auth.user?.profile_picture_url && !previewUrl && !selectedFile) {
      // This effect could potentially set previewUrl if needed,
      // but current logic displays auth.user.profile_picture_url directly in img src.
    }
  }, [auth.user?.profile_picture_url, previewUrl, selectedFile]);


  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">User Profile</h1>

      {/* Profile Picture Section */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Profile Picture</h2>
        <div className="flex items-center space-x-6">
          <div className="shrink-0">
            <img 
              className="h-24 w-24 object-cover rounded-full" 
              src={previewUrl || (auth.user?.profile_picture_url ? `${API_BASE_URL}${auth.user.profile_picture_url}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(auth.user?.username || 'User')}&background=random&size=128`)}
              alt="Profile" 
            />
          </div>
          <label htmlFor="profile-picture-upload" className="block">
            <span className="sr-only">Choose profile photo</span>
            <input 
              type="file" 
              id="profile-picture-upload"
              accept="image/png, image/jpeg, image/gif"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0
                         file:text-sm file:font-semibold
                         file:bg-indigo-50 dark:file:bg-indigo-800 file:text-indigo-600 dark:file:text-indigo-300
                         hover:file:bg-indigo-100 dark:hover:file:bg-indigo-700
                         disabled:opacity-50"
              disabled={isUploading}
            />
          </label>
        </div>
        {selectedFile && (
          <div className="mt-4">
            <button
              onClick={handlePictureUpload}
              disabled={isUploading || !selectedFile}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isUploading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
              ) : (
                <Camera size={16} className="mr-2" />
              )}
              Upload New Picture
            </button>
          </div>
        )}
      </div>

      {/* Watch Preferences Section */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Watch Preferences</h2>
        <button
          onClick={() => setIsWatchModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Manage Watch Preferences
        </button>
        {/* Toggle rendering logic is now moved to the modal */}
      </div>

      {/* Feedback Section */}
      <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Support</h2>
        <button
          onClick={() => setIsFeedbackModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <MessageCircleQuestion size={16} className="mr-2" />
          Report Bug / Give Feedback
        </button>
      </div>


      {/* ... other profile sections ... */}

      {/* The new Modal for Watch Preferences */}
      {isWatchModalOpen && (
        <Modal
          isOpen={isWatchModalOpen}
          onClose={() => setIsWatchModalOpen(false)}
          title="Manage Watch Preferences"
        >
          {/* Modal content starts here, Modal.tsx will provide its own padding */}
          {isLoadingContextWatchPreferences && (!contextWatchPreferences || contextWatchPreferences.length === 0) ? ( // Show loading only if there are no prefs yet
            <p className="text-gray-700 dark:text-gray-300 text-center py-4">Loading watch preferences...</p>
          ) : (
            <div className="space-y-6"> {/* This div provides spacing between content type sections */}
              {Object.entries(CONTENT_WATCH_CONFIG).map(([contentTypeKey, config]) => (
                <div key={contentTypeKey}>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200 mb-2">{config.displayName}</h3>
                  {config.categories ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {config.categories.map((category) => {
                        const isCurrentlySelected = isWatching(contentTypeKey as ContentTypeKey, category);
                        return (
                          <button
                            key={category}
                            onClick={() => handleWatchToggle(contentTypeKey as ContentTypeKey, category, isCurrentlySelected)}
                            className={`w-full flex items-center justify-center px-3 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1
                                          ${isCurrentlySelected
                                            ? 'bg-green-600 hover:bg-green-700 text-white border-transparent focus:ring-green-500'
                                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-500 focus:ring-indigo-500'
                                          } transition-colors duration-150 ease-in-out`}
                            disabled={isLoadingContextWatchPreferences}
                          >
                            {isCurrentlySelected ? <CheckCircle size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
                            {isCurrentlySelected ? 'Watching' : 'Watch'} <span className="ml-1 font-normal hidden sm:inline">- {category}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    // For 'misc' or other types with no subcategories
                    <button
                      onClick={() => {
                        const isCurrentlyWatchingMisc = isWatching(contentTypeKey as ContentTypeKey, undefined);
                        handleWatchToggle(contentTypeKey as ContentTypeKey, undefined, isCurrentlyWatchingMisc);
                      }}
                      className={`w-auto flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1
                                    ${isWatching(contentTypeKey as ContentTypeKey, undefined)
                                      ? 'bg-green-600 hover:bg-green-700 text-white border-transparent focus:ring-green-500'
                                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-500 focus:ring-indigo-500'
                                    } transition-colors duration-150 ease-in-out`}
                      disabled={isLoadingContextWatchPreferences}
                    >
                      {isWatching(contentTypeKey as ContentTypeKey, undefined) ? <CheckCircle size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
                      {isWatching(contentTypeKey as ContentTypeKey, undefined) ? 'Watching' : 'Watch General'}
                    </button>
                  )}
                </div>
              ))}
              {isLoadingContextWatchPreferences && contextWatchPreferences && contextWatchPreferences.length > 0 && ( 
                  // Show saving indicator only if we are already displaying preferences
                  <div className="mt-4 flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-500 mr-2"></div>
                    Saving preferences...
                  </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <Modal
          isOpen={isFeedbackModalOpen}
          onClose={() => setIsFeedbackModalOpen(false)}
          title="Submit Feedback or Report Bug"
        >
          <form onSubmit={handleFeedbackSubmit}>
            <div className="mb-4">
              <label htmlFor="feedbackType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Type
              </label>
              <select
                id="feedbackType"
                name="feedbackType"
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value as 'bug' | 'feedback')}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="feedback">General Feedback</option>
                <option value="bug">Bug Report</option>
              </select>
            </div>
            <div className="mb-4">
              <label htmlFor="feedbackMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message
              </label>
              <textarea
                id="feedbackMessage"
                name="feedbackMessage"
                rows={4}
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Please provide details..."
              />
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsFeedbackModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isSubmittingFeedback ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2 inline-block"></div>
                ) : null}
                Submit
              </button>
            </div>
          </form>
        </Modal>
      )}


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
                onChange={handleNewPasswordChange} 
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

        {/* Update Username Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Change Username</h2>
          {usernameError && <p className="text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 p-3 rounded mb-4">{usernameError}</p>}
          {usernameSuccess && <p className="text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 p-3 rounded mb-4">{usernameSuccess}</p>}
          <form onSubmit={handleUsernameChangeSubmit}>
            <div className="mb-4">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="newUsername">
                New Username
              </label>
              <input
                type="text"
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="currentPasswordForUsername">
                Current Password
              </label>
              <input
                type="password"
                id="currentPasswordForUsername"
                value={currentPasswordForUsername}
                onChange={(e) => setCurrentPasswordForUsername(e.target.value)}
                className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 mb-3 leading-tight focus:outline-none focus:shadow-outline bg-white dark:bg-gray-700"
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingUsername}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
            >
              {isUpdatingUsername ? 'Changing...' : 'Change Username'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
// Removed the mistakenly placed showErrorToast function from here
// function showErrorToast(arg0: any) {
//   throw new Error('Function not implemented.');
// }
