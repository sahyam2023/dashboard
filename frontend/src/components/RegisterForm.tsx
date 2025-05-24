// src/components/RegisterForm.tsx
import React, { useState } from 'react';
import { registerUser } from '../services/api';

interface RegisterFormProps {
  onAuthSuccess?: () => void;
  onToggleView?: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onAuthSuccess, onToggleView }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string>(''); 
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    return ""; 
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    const validationError = validatePassword(newPassword);
    setPasswordError(validationError);
    if (validationError) { // Clear general error if user is fixing password
        setError(null);
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (password !== e.target.value && passwordError === 'Passwords do not match.') {
        setPasswordError(''); // Clear "passwords do not match" if user is correcting confirm password
    } else if (password !== e.target.value && error === 'Passwords do not match.') {
        setError(null); // Clear general error if it was "passwords do not match"
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); 
    setSuccessMessage(null);
    
    const currentPasswordValidationError = validatePassword(password);
    if (currentPasswordValidationError) {
      setPasswordError(currentPasswordValidationError);
      setIsLoading(false);
      return;
    } else {
      setPasswordError(''); 
    }

    if (!username || !password || !confirmPassword) {
      setError('Username, password, and confirm password are required.');
      setIsLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.'); // Use general error for this
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true); 

    try {
      await registerUser({ username, password, email }); 
      setSuccessMessage('Registration successful! You can now log in.');
      if (onAuthSuccess) {
        setTimeout(() => {
            onAuthSuccess(); 
            // if (onToggleView) { // Optionally switch to login view after success
            //     onToggleView(); 
            // }
        }, 1500); 
      }
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        const backendMsg = err.response.data.msg.toLowerCase();
        if (backendMsg.includes("password")) {
          setPasswordError(err.response.data.msg); // Show password-specific errors in password field
        } else {
          setError(err.response.data.msg); // Show other errors generally
        }
      } else {
        setError('Registration failed. Please try again.');
      }
      console.error('Registration error:', err);
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
      {successMessage && (
         <div className="p-3 bg-green-50 border border-green-300 text-green-600 rounded-md text-sm"> {/* Enhanced success styling */}
           {successMessage}
         </div>
      )}
      <div>
        <label
          htmlFor="register-username"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Username
        </label>
        <input
          id="register-username" type="text" required value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage}
        />
      </div>

      <div>
        <label
          htmlFor="register-email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Email (Optional)
        </label>
        <input
          id="register-email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage}
        />
      </div>

      <div>
        <label
          htmlFor="register-password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Password
        </label>
        <input
          id="register-password" type="password" required value={password}
          onChange={handlePasswordChange} 
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage}
        />
        {passwordError && (
          <p className="mt-1.5 text-xs text-red-600">{passwordError}</p> 
        )}
      </div>

       <div>
        <label
          htmlFor="register-confirm-password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Confirm Password
        </label>
        <input
          id="register-confirm-password" type="password" required value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage}
        />
      </div>

      <div className="pt-2"> {/* Added padding-top for button separation */}
        <button
          type="submit"
          disabled={isLoading || !!successMessage} 
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-colors"
        >
           {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
          ) : (
            'Register'
          )}
        </button>
      </div>
      {onToggleView && !successMessage && ( 
        <p className="mt-6 text-center text-sm text-gray-600"> 
          Already have an account?{' '}
          <button 
            type="button" 
            onClick={onToggleView} 
            className="text-indigo-600 hover:text-indigo-500 hover:underline font-medium focus:outline-none"
            disabled={isLoading}
          >
            Login
          </button>
        </p>
      )}
    </form>
  );
};

export default RegisterForm;