// src/components/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/api';

interface LoginFormProps {
  onAuthSuccess?: (passwordResetRequired: boolean) => void; // Updated prop type
  onToggleView?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onAuthSuccess, onToggleView }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!username || !password) {
      setError('Username and password are required.');
      setIsLoading(false);
      return;
    }

    try {
      const data = await loginUser({ username, password }); 
      const requiresReset = auth.login(data.access_token, data.username, data.role, data.password_reset_required); 
      onAuthSuccess?.(requiresReset); 
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        setError(err.response.data.msg);
      } else {
        setError('Login failed. Please try again.');
      }
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6"> {/* Adjusted spacing */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-600 rounded-md text-sm"> {/* Enhanced error styling */}
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="login-username"
          className="block text-sm font-medium text-gray-700 mb-1" // Added mb-1
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
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" // Adjusted padding and focus ring
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-gray-700 mb-1" // Added mb-1
        >
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" // Adjusted padding and focus ring
          disabled={isLoading}
        />
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
        <p className="mt-6 text-center text-sm text-gray-600"> {/* Adjusted margin-top */}
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