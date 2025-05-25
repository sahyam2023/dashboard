// src/components/RegisterForm.tsx
import React, { useState, useEffect, FormEvent } from 'react';
import { registerUser, fetchSecurityQuestions, SecurityQuestion } from '../services/api';
import { SecurityAnswerPayload, RegisterRequest, RegisterResponse } from '../types'; // Added RegisterResponse
import { useAuth } from '../context/AuthContext'; // Added useAuth

interface RegisterFormProps {
  onAuthSuccess?: (passwordResetRequired: boolean) => void; // Updated prop type
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
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [allSecurityQuestions, setAllSecurityQuestions] = useState<SecurityQuestion[]>([]);
  const initialSelectedAnswers: SelectedAnswerState[] = [
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
  ];
  const [selectedSecurityAnswers, setSelectedSecurityAnswers] = useState<SelectedAnswerState[]>(initialSelectedAnswers);
  const [securityQuestionsError, setSecurityQuestionsError] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const auth = useAuth(); // Added auth

  useEffect(() => {
    const loadSecurityQuestions = async () => {
      setIsLoadingQuestions(true);
      setSecurityQuestionsError(null);
      try {
        const questions = await fetchSecurityQuestions();
        setAllSecurityQuestions(questions);
      } catch (err) {
        setSecurityQuestionsError('Failed to load security questions. Please try refreshing the page.');
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
    const validationError = validatePassword(newPassword);
    setPasswordError(validationError);
    if (validationError) {
        setError(null);
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (password !== e.target.value && passwordError === 'Passwords do not match.') {
        setPasswordError('');
    } else if (password !== e.target.value && error === 'Passwords do not match.') {
        setError(null);
    }
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
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    // Security Questions Validation
    const filledAnswers = selectedSecurityAnswers.filter(sa => sa.question_id && sa.answer.trim());
    if (filledAnswers.length !== 3) {
      setError('Please select and answer all three security questions.');
      setIsLoading(false);
      return;
    }
    const questionIds = filledAnswers.map(sa => sa.question_id);
    if (new Set(questionIds).size !== 3) {
      setError('Please select three different security questions.');
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
      
      setSuccessMessage('Registration successful! Logging you in...');
      
      if (onAuthSuccess) {
        onAuthSuccess(requiresReset); // Call immediately with the reset flag
      }
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.msg) {
        const backendMsg = err.response.data.msg.toLowerCase();
        if (backendMsg.includes("password")) {
          setPasswordError(err.response.data.msg);
        } else {
          setError(err.response.data.msg);
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
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-600 rounded-md text-sm">
          {error}
        </div>
      )}
      {successMessage && (
         <div className="p-3 bg-green-50 border border-green-300 text-green-600 rounded-md text-sm">
           {successMessage}
         </div>
      )}
      <div>
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
        <input id="register-username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage} />
      </div>

      <div>
        <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
        <input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage} />
      </div>

      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input id="register-password" type="password" required value={password} onChange={handlePasswordChange}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage} />
        {passwordError && <p className="mt-1.5 text-xs text-red-600">{passwordError}</p>}
      </div>

       <div>
        <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <input id="register-confirm-password" type="password" required value={confirmPassword} onChange={handleConfirmPasswordChange}
          className="appearance-none block w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          disabled={isLoading || !!successMessage} />
      </div>

      {/* Security Questions Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-md font-medium text-gray-700">Security Questions</h3>
        <p className="text-xs text-gray-500">Select three different questions and provide answers. These will be used for account recovery.</p>
        {isLoadingQuestions && <p className="text-sm text-gray-500">Loading security questions...</p>}
        {securityQuestionsError && (
          <div className="p-2 bg-red-50 border border-red-200 text-red-500 rounded-md text-xs">
            {securityQuestionsError}
          </div>
        )}
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
              disabled={isLoading || !!successMessage || isLoadingQuestions}
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
              disabled={isLoading || !!successMessage || isLoadingQuestions}
              required
            />
          </div>
        ))}
      </div>

      <div className="pt-2">
        <button type="submit" disabled={isLoading || !!successMessage || isLoadingQuestions}
          className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 transition-colors">
           {isLoading ? (<div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>) : 'Register'}
        </button>
      </div>
      {onToggleView && !successMessage && (
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