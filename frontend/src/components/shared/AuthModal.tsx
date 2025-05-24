import React, { useState, useEffect } from 'react';
import LoginForm from '../LoginForm'; 
import RegisterForm from '../RegisterForm'; 

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView: 'login' | 'register';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialView }) => {
  const [currentView, setCurrentView] = useState<'login' | 'register'>(initialView);

  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView, isOpen]); 

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleToggleView = () => {
    setCurrentView(prev => prev === 'login' ? 'register' : 'login');
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-center z-50 transition-opacity duration-300 ease-in-out" // Enhanced overlay
      onClick={onClose} 
    >
      <div 
        className="bg-white p-6 sm:p-8 rounded-lg shadow-2xl relative max-w-sm sm:max-w-md w-full mx-4 transform transition-all duration-300 ease-in-out scale-95 group-hover:scale-100" // Enhanced container with transition
        onClick={(e) => e.stopPropagation()} 
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 text-gray-400 hover:text-gray-600 text-3xl leading-none font-semibold hover:bg-gray-100 rounded-full p-1 transition-colors"
          aria-label="Close modal"
        >
          &times;
        </button>

        {currentView === 'login' ? (
          <>
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center text-gray-800">Login</h2>
            <LoginForm onAuthSuccess={onClose} onToggleView={handleToggleView} />
          </>
        ) : (
          <>
            <h2 className="text-xl sm:text-2xl font-bold mb-6 text-center text-gray-800">Create Account</h2>
            <RegisterForm onAuthSuccess={onClose} onToggleView={handleToggleView} />
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
