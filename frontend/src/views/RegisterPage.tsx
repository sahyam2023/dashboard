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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-2xl">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Create a new account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in here
            </Link>
          </p>
        </div>
        {/* Removed the inner white card, the outer card now serves this purpose */}
        <RegisterForm onAuthSuccess={handleRegisterSuccess} />
      </div>
    </div>
  );
};

export default RegisterPage;