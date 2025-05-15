// src/views/LoginPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../components/LoginForm'; // Adjust path if needed

const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          {/* You can add a logo here if you like */}
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
          <LoginForm />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;