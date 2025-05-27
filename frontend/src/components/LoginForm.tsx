// src/components/LoginForm.tsx
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/api';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils';

interface LoginFormProps {
  onAuthSuccess?: (passwordResetRequired: boolean) => void;
  onToggleView?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onAuthSuccess, onToggleView }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // setError is removed, errors will be handled by toasts
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // setError(null) is removed
    setIsLoading(true);

    if (!username || !password) {
      showErrorToast('Username and password are required.');
      setIsLoading(false);
      return;
    }

    try {
      const data = await loginUser({ username, password });
      // TOKEN_EXPIRY_SECONDS should match the expectation in AuthContext.
      // The backend doesn't send expiresIn, so frontend defines it for AuthContext.
      const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
      const requiresReset = auth.login(
        data.access_token, 
        data.username, 
        data.role, 
        data.user_id, // Pass user_id here
        TOKEN_EXPIRY_SECONDS, 
        data.password_reset_required
      ); 
      showSuccessToast("Login successful!"); // Added success toast
      onAuthSuccess?.(requiresReset); 
    } catch (err: any) {
      // Specific handling for maintenance mode
      if (err.response && err.response.status === 503 && err.response.data?.maintenance_mode_active === true) {
        showErrorToast(err.response.data.msg || "System is currently undergoing maintenance. Only super administrators can log in at this time.");
      } else if (err.response && err.response.data && err.response.data.msg) {
        showErrorToast(err.response.data.msg);
      } else {
        showErrorToast('Login failed. Please try again.');
      }
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
      {/* The error display div has been removed */}
      <div>
        <label
          htmlFor="login-username"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" // Added mb-1
        >
          Username
        </label>
        <input
          id="login-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400" // Adjusted padding and focus ring
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" // Added mb-1
        >
          Password
        </label>
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400" // Adjusted padding and focus ring, added pr-10 for icon
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
            disabled={isLoading}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      <div className="pt-2"> {/* Added padding-top for button separation */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-colors" // Enhanced button styling
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
          ) : (
            'Sign in'
          )}
        </button>
      </div>
      {onToggleView && (
        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400"> {/* Adjusted margin-top */}
          Don't have an account?{' '}
          <button 
            type="button" 
            onClick={onToggleView} 
            className="text-indigo-600 hover:text-indigo-500 hover:underline font-medium focus:outline-none" // Enhanced link styling
            disabled={isLoading}
          >
            Sign Up
          </button>
        </p>
      )}
    </form>
  );
};

export default LoginForm;