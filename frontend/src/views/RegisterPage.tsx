// src/views/RegisterPage.tsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Import useNavigate
import RegisterForm from '../components/RegisterForm'; 

const RegisterPage: React.FC = () => {
  const navigate = useNavigate(); // Get navigate function

  // Define the success handler for registration
  const handleRegisterSuccess = (passwordResetRequired: boolean) => {
    if (!passwordResetRequired) {
      navigate('/documents'); 
    }
    // If passwordResetRequired is true, App.tsx will handle the redirect
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
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
          {/* Pass the handler to RegisterForm */}
          <RegisterForm onAuthSuccess={handleRegisterSuccess} />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;