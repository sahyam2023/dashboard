// src/views/LoginPage.tsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Import useNavigate
import LoginForm from '../components/LoginForm';

const LoginPage: React.FC = () => {
  const navigate = useNavigate(); // Get navigate function

  // Define the success handler
  const handleLoginSuccess = (passwordResetRequired: boolean) => {
    if (!passwordResetRequired) {
      navigate('/documents'); 
    }
    // If passwordResetRequired is true, App.tsx will handle the redirect to /force-change-password
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
          </p>
        </div>
        <div className="bg-white p-8 shadow rounded-lg">
          {/* Pass the handler to LoginForm */}
          <LoginForm onAuthSuccess={handleLoginSuccess} /> 
          <div className="mt-4 text-center text-sm">
            <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
              Forgot Password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;