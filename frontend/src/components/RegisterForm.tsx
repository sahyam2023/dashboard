// src/components/RegisterForm.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useAuth } from '../../context/AuthContext'; // Not typically used directly on registration success
import { registerUser } from '../services/api';

const RegisterForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); // Optional email
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  // const auth = useAuth(); // For auto-login after registration if desired

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    if (!username || !password || !confirmPassword) {
      setError('Username, password, and confirm password are required.');
      setIsLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    try {
      await registerUser({ username, password, email }); // Call API
      setSuccessMessage('Registration successful! You can now log in.');
      // Optionally, automatically log the user in and redirect:
      // const loginData = await loginUser({ username, password });
      // auth.login(loginData.access_token, loginData.username);
      // navigate('/');
      setTimeout(() => {
        navigate('/login'); // Redirect to login page after a short delay
      }, 2000);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        setError(err.response.data.msg);
      } else {
        setError('Registration failed. Please try again.');
      }
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}
      {successMessage && (
         <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-md">
           {successMessage}
         </div>
      )}
      <div>
        <label
          htmlFor="register-username"
          className="block text-sm font-medium text-gray-700"
        >
          Username
        </label>
        <input
          id="register-username" type="text" required value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="register-email"
          className="block text-sm font-medium text-gray-700"
        >
          Email (Optional)
        </label>
        <input
          id="register-email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="register-password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>
        <input
          id="register-password" type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={isLoading}
        />
      </div>

       <div>
        <label
          htmlFor="register-confirm-password"
          className="block text-sm font-medium text-gray-700"
        >
          Confirm Password
        </label>
        <input
          id="register-confirm-password" type="password" required value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          disabled={isLoading}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
           {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
          ) : (
            'Register'
          )}
        </button>
      </div>
    </form>
  );
};

export default RegisterForm;