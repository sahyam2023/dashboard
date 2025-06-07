import React, { useState, useEffect } from 'react';
import { changePassword, updateEmail, uploadUserProfilePicture, updateUsername } from '../services/api'; // Added updateUsername
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Camera, PlusCircle, CheckCircle } from 'lucide-react'; // For icon
import { showSuccessToast, showErrorToast } from '../utils/toastUtils'; 

// Placeholder API functions (to be replaced by actual api.ts functions)
const getUserWatchPreferences = async (): Promise<Array<{ content_type: string; category?: string }>> => {
  console.log('API CALL: getUserWatchPreferences');
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  // Return mock data for now, or an empty array
  // return [{ content_type: 'documents', category: 'VMS' }, { content_type: 'misc' }];
  return [];
};

const updateUserWatchPreferences = async (preferences: Array<{ content_type: string; category?: string; watch: boolean }>): Promise<any> => {
  console.log('API CALL: updateUserWatchPreferences with data:', preferences);
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  // Simulate success
  return { message: 'Preferences updated successfully', updated_preferences: preferences.filter(p => p.watch).map(({ watch, ...rest}) => rest) }; 
  // Simulate error:
  // throw new Error("Failed to update preferences due to a network issue.");
};


const UserProfilePage: React.FC = () => {
  const auth = useAuth();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7000';
  // State for Profile Picture
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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

  // State for Watch Preferences
  // Using imported types
  type WatchPreferenceFromType = import('../types').WatchPreference;
  // type UpdateWatchPreferencePayloadFromType = import('../types').UpdateWatchPreferencePayload;

  const [watchPreferences, setWatchPreferences] = useState<WatchPreferenceFromType[]>([]);
  const [isLoadingWatchPreferences, setIsLoadingWatchPreferences] = useState(true);
  const [isSavingWatchPreferences, setIsSavingWatchPreferences] = useState(false);

  // Configuration for watchable content types and categories
  const CONTENT_WATCH_CONFIG = {
    documents: { displayName: 'Documents', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    patches: { displayName: 'Patches', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    links: { displayName: 'Links', categories: ['VA', 'VMS', 'ICCC', 'Analytic Manager', 'ITMS'] },
    misc: { displayName: 'Miscellaneous', categories: null }, // No specific subcategories for misc
  };
  type ContentTypeKey = keyof typeof CONTENT_WATCH_CONFIG;


  useEffect(() => {
    const fetchPreferences = async () => {
      setIsLoadingWatchPreferences(true);
      try {
        const prefs = await getUserWatchPreferences();
        setWatchPreferences(prefs);
      } catch (error: any) {
        showErrorToast(error.message || 'Failed to load watch preferences.');
      } finally {
        setIsLoadingWatchPreferences(false);
      }
    };
    fetchPreferences();
  }, []);

  const handleWatchToggle = async (contentType: ContentTypeKey, category: string | undefined, currentlyWatching: boolean) => {
    setIsSavingWatchPreferences(true);
    const newStatus = !currentlyWatching;

    // Optimistic UI update
    let updatedPrefsOptimistic: WatchPreferenceFromType[];
    if (newStatus) { // User wants to watch
      updatedPrefsOptimistic = [...watchPreferences, { content_type: contentType, category }];
    } else { // User wants to unwatch
      updatedPrefsOptimistic = watchPreferences.filter(
        p => !(p.content_type === contentType && p.category === category)
      );
    }
    setWatchPreferences(updatedPrefsOptimistic);

    // Prepare payload for the API - send all intended preferences
    // The API expects a list of { content_type, category, watch: true/false }
    // For this specific toggle, we find the item in the original list or add it, then set its 'watch' status.
    // A simpler approach for the API might be to just send the *changed* preference.
    // However, the requirement states "payload should represent the full desired state ... or the specific change".
    // Let's send only the changed preference for now, assuming the backend can handle it or we refine later.
    // Based on the problem description, the backend expects a list of preferences to set.
    // So, we construct the full list of preferences with their new watch status.
    
    const allPossiblePreferencesPayload: { content_type: string; category?: string; watch: boolean }[] = Object.entries(CONTENT_WATCH_CONFIG).flatMap(([ctKey, conf]) => {
      if (conf.categories) {
        return conf.categories.map(cat => ({
          content_type: ctKey as ContentTypeKey,
          category: cat,
          watch: updatedPrefsOptimistic.some(p => p.content_type === ctKey && p.category === cat)
        }));
      } else {
        // For 'misc' or types with no categories, category should be undefined (not null).
        return [{
          content_type: ctKey as ContentTypeKey,
          // Do not include category if it's undefined
          watch: updatedPrefsOptimistic.some(p => p.content_type === ctKey && !p.category)
        }];
      }
    });
    
    try {
      // Ensure the response from updateUserWatchPreferences matches what setWatchPreferences expects,
      // or adapt it. WatchPreferenceFromType expects category to be optional string or null.
      const apiResponse = await updateUserWatchPreferences(allPossiblePreferencesPayload);
      
      // Assuming apiResponse.updated_preferences is Array<{ content_type: string; category?: string | null }>
      // If the API returns category as empty string for nulls, it needs normalization here if WatchPreferenceFromType expects null/undefined.
      // For now, assume backend returns category as string or null, which is compatible.
      setWatchPreferences(apiResponse.updated_preferences || updatedPrefsOptimistic);
      showSuccessToast(apiResponse.message || 'Watch preferences updated.');
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to update watch preferences.');
      // Revert optimistic update on error
      setWatchPreferences(watchPreferences); // Revert to original state before this toggle
    } finally {
      setIsSavingWatchPreferences(false);
    }
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
        {isLoadingWatchPreferences ? (
          <p className="text-gray-700 dark:text-gray-300">Loading watch preferences...</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(CONTENT_WATCH_CONFIG).map(([contentTypeKey, config]) => (
              <div key={contentTypeKey}>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200 mb-2">{config.displayName}</h3>
                {config.categories ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {config.categories.map((category) => {
                      const isWatching = watchPreferences.some(
                        (p) => p.content_type === contentTypeKey && p.category === category
                      );
                      return (
                        <button
                          key={category}
                          onClick={() => handleWatchToggle(contentTypeKey as ContentTypeKey, category, isWatching)}
                          className={`w-full flex items-center justify-center px-3 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1
                                        ${isWatching
                                          ? 'bg-green-600 hover:bg-green-700 text-white border-transparent focus:ring-green-500'
                                          : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-500 focus:ring-indigo-500'
                                        } transition-colors duration-150 ease-in-out`}
                          disabled={isSavingWatchPreferences}
                        >
                          {isWatching ? <CheckCircle size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
                          {isWatching ? 'Watching' : 'Watch'} <span className="ml-1 font-normal hidden sm:inline">- {category}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // For 'misc' or other types with no subcategories
                  <button
                    onClick={() => {
                      const isCurrentlyWatchingMisc = watchPreferences.some(p => p.content_type === contentTypeKey && !p.category);
                      handleWatchToggle(contentTypeKey as ContentTypeKey, undefined, isCurrentlyWatchingMisc);
                    }}
                    className={`w-auto flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1
                                  ${watchPreferences.some(p => p.content_type === contentTypeKey && !p.category)
                                    ? 'bg-green-600 hover:bg-green-700 text-white border-transparent focus:ring-green-500'
                                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-500 focus:ring-indigo-500'
                                  } transition-colors duration-150 ease-in-out`}
                    disabled={isSavingWatchPreferences}
                  >
                    {watchPreferences.some(p => p.content_type === contentTypeKey && !p.category) ? <CheckCircle size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
                    {watchPreferences.some(p => p.content_type === contentTypeKey && !p.category) ? 'Watching' : 'Watch General'}
                  </button>
                )}
              </div>
            ))}
             {isSavingWatchPreferences && (
                <div className="mt-4 flex items-center text-sm text-gray-600 dark:text-gray-300">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-500 mr-2"></div>
                  Saving preferences...
                </div>
              )}
          </div>
        )}
      </div>


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
