// src/components/RegisterForm.tsx
import React, { useState, useEffect, FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { registerUser, fetchSecurityQuestions, SecurityQuestion } from '../services/api';
import { SecurityAnswerPayload, RegisterRequest, RegisterResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { showErrorToast, showSuccessToast, showInfoToast } from '../utils/toastUtils'; // Updated imports

interface RegisterFormProps {
  onAuthSuccess?: (passwordResetRequired: boolean) => void;
  onToggleView?: () => void;
}

interface SelectedAnswerState {
  question_id: string; // Store as string from select, convert to number on submit
  answer: string;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onAuthSuccess, onToggleView }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [allSecurityQuestions, setAllSecurityQuestions] = useState<SecurityQuestion[]>([]);
  const initialSelectedAnswers: SelectedAnswerState[] = [
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
  ];
  const [selectedSecurityAnswers, setSelectedSecurityAnswers] = useState<SelectedAnswerState[]>(initialSelectedAnswers);
  // securityQuestionsError will be handled by toast
  
  // error and passwordError states are removed, will use toasts
  // successMessage state is removed, will use toasts
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [profilePicture, setProfilePicture] = useState<FileList | null>(null); // Added state for profile picture
  const auth = useAuth();

  useEffect(() => {
    const loadSecurityQuestions = async () => {
      setIsLoadingQuestions(true);
      // setSecurityQuestionsError(null) is removed
      try {
        const questions = await fetchSecurityQuestions();
        setAllSecurityQuestions(questions);
      } catch (err) {
        showErrorToast('Failed to load security questions. Please try refreshing the page.');
        console.error(err);
      } finally {
        setIsLoadingQuestions(false);
      }
    };
    loadSecurityQuestions();
  }, []);

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
    // Live validation error display can be handled differently if needed,
    // for now, validation errors will show on submit.
    // const validationError = validatePassword(newPassword);
    // setPasswordError(validationError); 
    // if (validationError) {
    //     setError(null);
    // }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    // if (password !== e.target.value && passwordError === 'Passwords do not match.') {
    //     setPasswordError('');
    // } else if (password !== e.target.value && error === 'Passwords do not match.') {
    //     setError(null);
    // }
  };

  const handleSecurityQuestionChange = (index: number, questionId: string) => {
    const updatedAnswers = [...selectedSecurityAnswers];
    updatedAnswers[index] = { ...updatedAnswers[index], question_id: questionId };
    setSelectedSecurityAnswers(updatedAnswers);
  };

  const handleSecurityAnswerChange = (index: number, answerText: string) => {
    const updatedAnswers = [...selectedSecurityAnswers];
    updatedAnswers[index] = { ...updatedAnswers[index], answer: answerText };
    setSelectedSecurityAnswers(updatedAnswers);
  };

  const getAvailableQuestions = (currentIndex: number): SecurityQuestion[] => {
    const selectedIds = selectedSecurityAnswers
      .map((sa, i) => (i !== currentIndex ? parseInt(sa.question_id, 10) : null))
      .filter((id): id is number => id !== null && !isNaN(id));
    return allSecurityQuestions.filter(q => !selectedIds.includes(q.id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // setError(null) and setSuccessMessage(null) are removed
    
    const currentPasswordValidationError = validatePassword(password);
    if (currentPasswordValidationError) {
      showErrorToast(currentPasswordValidationError);
      setIsLoading(false);
      return;
    }
    // setPasswordError('') is removed

    if (!username || !password || !confirmPassword) {
      showErrorToast('Username, password, and confirm password are required.');
      setIsLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      showErrorToast('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    // Security Questions Validation
    const filledAnswers = selectedSecurityAnswers.filter(sa => sa.question_id && sa.answer.trim());
    if (filledAnswers.length !== 3) {
      showErrorToast('Please select and answer all three security questions.');
      setIsLoading(false);
      return;
    }
    const questionIds = filledAnswers.map(sa => sa.question_id);
    if (new Set(questionIds).size !== 3) {
      showErrorToast('Please select three different security questions.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const securityAnswersPayload: SecurityAnswerPayload[] = selectedSecurityAnswers.map(sa => ({
      question_id: parseInt(sa.question_id, 10),
      answer: sa.answer.trim(),
    }));

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    if (email) {
      formData.append('email', email);
    }
    formData.append('security_answers', JSON.stringify(securityAnswersPayload));

    if (profilePicture && profilePicture.length > 0) {
      formData.append('profile_picture', profilePicture[0]);
    }

    try {
      // registerUser now expects FormData
      const regData: RegisterResponse = await registerUser(formData); 
      
      // The backend response now includes profile_picture_url
      const requiresReset = auth.login(
        regData.access_token, 
        regData.username, 
        regData.role, 
        regData.user_id, 
        900, // expires_in_seconds placeholder, as it was removed from RegisterResponse type
        regData.password_reset_required || false,
        regData.profile_picture_url // Pass to auth context
      ); 
      
      console.log('[RegisterForm] After auth.login - requiresReset:', requiresReset);
      console.log('[RegisterForm] Auth context state after login:', JSON.stringify(auth.user)); // Log updated user state
      
      showSuccessToast('Registration successful! Logging you in...');
      
      if (onAuthSuccess) {
        onAuthSuccess(requiresReset);
      }
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        showErrorToast(err.response.data.msg);
      } else {
        showErrorToast('Registration failed. Please try again.');
      }
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
      {/* Error and success message divs are removed */}
      <div>
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Username</label>
        <input id="register-username" type="text" autoComplete="off" required value={username} onChange={(e) => setUsername(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          disabled={isLoading} />
      </div>

      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email (Optional)</label>
        <input id="register-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          disabled={isLoading} />
      </div>

      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Password</label>
        <div className="relative">
          <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={handlePasswordChange}
            className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
            disabled={isLoading} />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
            disabled={isLoading}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {/* passwordError p tag is removed */}
      </div>

       <div>
        <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Confirm Password</label>
        <div className="relative">
          <input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={handleConfirmPasswordChange}
            className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
            disabled={isLoading} />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
            disabled={isLoading}
          >
            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      {/* Security Questions Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-md font-medium text-gray-700 dark:text-white">Security Questions</h3>
        <p className="text-xs text-gray-500 dark:text-gray-300">Select three different questions and provide answers. These will be used for account recovery.</p>
        {isLoadingQuestions && <p className="text-sm text-gray-500 dark:text-gray-400">Loading security questions...</p>}
        {/* securityQuestionsError display div is removed */}
        {!isLoadingQuestions && allSecurityQuestions.length > 0 && selectedSecurityAnswers.map((_, index) => (
          <div key={index} className="space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-3 first:border-t-0 first:pt-0">
            <label htmlFor={`question-${index}`} className="block text-xs font-medium text-gray-600 dark:text-gray-200">
               Question {index + 1}
             </label>
            <select
              id={`question-${index}`}
              value={selectedSecurityAnswers[index].question_id}
              onChange={(e) => handleSecurityQuestionChange(index, e.target.value)}
              className="appearance-none block w-full px-2.5 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600"
              disabled={isLoading || isLoadingQuestions}
              required
            >
              <option value="">Select a question</option>
              {getAvailableQuestions(index).map((q) => (
                <option key={q.id} value={q.id.toString()}>
                  {q.question_text}
                </option>
              ))}
            </select>
            <label htmlFor={`answer-${index}`} className="block text-xs font-medium text-gray-600 dark:text-gray-200 mt-1">
               Answer {index + 1}
             </label>
            <input
              id={`answer-${index}`}
              type="text"
              autoComplete="off"
              value={selectedSecurityAnswers[index].answer}
              onChange={(e) => handleSecurityAnswerChange(index, e.target.value)}
              className="appearance-none block w-full px-2.5 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
              disabled={isLoading || isLoadingQuestions}
              required
            />
          </div>
        ))}
      </div>

      <div className="pt-2">
        <button type="submit" disabled={isLoading || isLoadingQuestions}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-colors">
           {isLoading ? (<div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>) : 'Register'}
        </button>
      </div>
      {onToggleView && ( // Removed !successMessage condition as successMessage state is gone
        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <button type="button" onClick={onToggleView}
            className="text-indigo-600 hover:text-indigo-500 hover:underline font-medium focus:outline-none dark:text-indigo-400 dark:hover:text-indigo-300"
            disabled={isLoading}>
            Login
          </button>
        </p>
      )}
    </form>
  );
};

export default RegisterForm;