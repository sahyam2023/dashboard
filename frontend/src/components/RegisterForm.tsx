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

    const registrationPayload: RegisterRequest = {
        username,
        email: email || undefined, // Send undefined if email is empty, as backend expects optional
        password,
        security_answers: securityAnswersPayload,
    };

    try {
      const regData: RegisterResponse = await registerUser(registrationPayload); 
      // Assuming regData from backend now includes password_reset_required (it should, based on task context)
      // If not, it will be undefined, and auth.login's default (false) will be used.
      const requiresReset = auth.login(regData.access_token, regData.username, regData.role, false); 
      
      showSuccessToast('Registration successful! Logging you in...');
      
      if (onAuthSuccess) {
        onAuthSuccess(requiresReset); // Call immediately with the reset flag
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
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input id="register-username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading} />
      </div>

      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
        <input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading} />
      </div>

      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <div className="relative">
          <input id="register-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={handlePasswordChange}
            className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10"
            disabled={isLoading} />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={isLoading}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {/* passwordError p tag is removed */}
      </div>

       <div>
        <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <div className="relative">
          <input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword} onChange={handleConfirmPasswordChange}
            className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-10"
            disabled={isLoading} />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={isLoading}
          >
            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      {/* Security Questions Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-md font-medium text-gray-700">Security Questions</h3>
        <p className="text-xs text-gray-500">Select three different questions and provide answers. These will be used for account recovery.</p>
        {isLoadingQuestions && <p className="text-sm text-gray-500">Loading security questions...</p>}
        {/* securityQuestionsError display div is removed */}
        {!isLoadingQuestions && allSecurityQuestions.length > 0 && selectedSecurityAnswers.map((_, index) => (
          <div key={index} className="space-y-1.5 border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
            <label htmlFor={`question-${index}`} className="block text-xs font-medium text-gray-600">
              Question {index + 1}
            </label>
            <select
              id={`question-${index}`}
              value={selectedSecurityAnswers[index].question_id}
              onChange={(e) => handleSecurityQuestionChange(index, e.target.value)}
              className="appearance-none block w-full px-2.5 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
            <label htmlFor={`answer-${index}`} className="block text-xs font-medium text-gray-600 mt-1">
              Answer {index + 1}
            </label>
            <input
              id={`answer-${index}`}
              type="text"
              value={selectedSecurityAnswers[index].answer}
              onChange={(e) => handleSecurityAnswerChange(index, e.target.value)}
              className="appearance-none block w-full px-2.5 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button type="button" onClick={onToggleView}
            className="text-indigo-600 hover:text-indigo-500 hover:underline font-medium focus:outline-none"
            disabled={isLoading}>
            Login
          </button>
        </p>
      )}
    </form>
  );
};

export default RegisterForm;