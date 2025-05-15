// src/views/RegisterPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import RegisterForm from '../components/RegisterForm'; // Adjust path if needed

const RegisterPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          {/* You can add a logo here */}
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create a new account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in here
            </Link>
          </p>
        </div>
        <div className="bg-white p-8 shadow rounded-lg">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;