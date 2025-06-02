// frontend/src/components/admin/SuperAdminCreateUserForm.tsx
import React, { useState, useEffect, FormEvent } from 'react';
import { fetchSecurityQuestions, superAdminCreateUser, SecurityQuestion, SuperAdminCreateUserPayload } from '../../services/api';
import { showErrorToast, showSuccessToast } from '../../utils/toastUtils';

interface SuperAdminCreateUserFormProps {
  onUserCreated: () => void;
  onCancel: () => void;
}

// Basic password strength validation (can be expanded or moved to utils)
const isPasswordStrong = (password: string): { strong: boolean; message: string } => {
  if (password.length < 8) {
    return { strong: false, message: "Password must be at least 8 characters long." };
  }
  if (!/[A-Z]/.test(password)) {
    return { strong: false, message: "Password must include at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { strong: false, message: "Password must include at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { strong: false, message: "Password must include at least one digit." };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { strong: false, message: "Password must include at least one special character." };
  }
  return { strong: true, message: "Password is strong." };
};


const SuperAdminCreateUserForm: React.FC<SuperAdminCreateUserFormProps> = ({ onUserCreated, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin' | 'super_admin'>('user');

  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [selectedQuestion1, setSelectedQuestion1] = useState<string>('');
  const [answer1, setAnswer1] = useState('');
  const [selectedQuestion2, setSelectedQuestion2] = useState<string>('');
  const [answer2, setAnswer2] = useState('');
  const [selectedQuestion3, setSelectedQuestion3] = useState<string>('');
  const [answer3, setAnswer3] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [passwordStrengthMessage, setPasswordStrengthMessage] = useState<string>('');


  useEffect(() => {
    const loadQuestions = async () => {
      setLoadingQuestions(true);
      try {
        const questions = await fetchSecurityQuestions();
        setSecurityQuestions(questions);
        if (questions.length > 0) {
            // Pre-select if possible, ensuring uniqueness if questions are fewer than 3
            if (questions.length >= 1) setSelectedQuestion1(questions[0].id.toString());
            if (questions.length >= 2) setSelectedQuestion2(questions[1].id.toString());
            if (questions.length >= 3) setSelectedQuestion3(questions[2].id.toString());
        }
      } catch (err) {
        setError('Failed to load security questions.');
        showErrorToast('Failed to load security questions. Please try again.');
      } finally {
        setLoadingQuestions(false);
      }
    };
    loadQuestions();
  }, []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    const strength = isPasswordStrong(newPassword);
    setPasswordStrengthMessage(strength.message);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!username.trim()) errors.username = "Username is required.";

    const strength = isPasswordStrong(password);
    if (!strength.strong) errors.password = strength.message;
    if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";

    if (email.trim() && !/\S+@\S+\.\S+/.test(email)) errors.email = "Email is invalid.";

    if (!selectedRole) errors.role = "Role is required.";

    const q1 = selectedQuestion1;
    const q2 = selectedQuestion2;
    const q3 = selectedQuestion3;

    if (!q1 || !q2 || !q3) {
      errors.securityQuestions = "All three security questions must be selected.";
    } else if (q1 === q2 || q1 === q3 || q2 === q3) {
      errors.securityQuestions = "Security questions must be unique.";
    }

    if (!answer1.trim()) errors.answer1 = "Answer for question 1 is required.";
    if (!answer2.trim()) errors.answer2 = "Answer for question 2 is required.";
    if (!answer3.trim()) errors.answer3 = "Answer for question 3 is required.";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    const payload: SuperAdminCreateUserPayload = {
      username,
      password,
      email: email.trim() || undefined,
      role: selectedRole,
      security_answers: [
        { question_id: parseInt(selectedQuestion1, 10), answer: answer1 },
        { question_id: parseInt(selectedQuestion2, 10), answer: answer2 },
        { question_id: parseInt(selectedQuestion3, 10), answer: answer3 },
      ],
    };

    try {
      await superAdminCreateUser(payload);
      showSuccessToast(`User "${username}" created successfully!`);
      onUserCreated();
      // Reset form
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setEmail('');
      setSelectedRole('user');
      if (securityQuestions.length >= 1) setSelectedQuestion1(securityQuestions[0].id.toString());
      if (securityQuestions.length >= 2) setSelectedQuestion2(securityQuestions[1].id.toString());
      if (securityQuestions.length >= 3) setSelectedQuestion3(securityQuestions[2].id.toString());
      else if (securityQuestions.length === 2) setSelectedQuestion3(''); // handle less than 3 questions available
      else if (securityQuestions.length === 1) {setSelectedQuestion2(''); setSelectedQuestion3('');}
      else {setSelectedQuestion1(''); setSelectedQuestion2(''); setSelectedQuestion3('');}

      setAnswer1('');
      setAnswer2('');
      setAnswer3('');
      setFormErrors({});
      setPasswordStrengthMessage('');
    } catch (err: any) {
      const apiErrorMessage = err.response?.data?.msg || err.message || 'Failed to create user.';
      setError(apiErrorMessage);
      showErrorToast(apiErrorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableQuestions = (excludeKey?: string): SecurityQuestion[] => {
    const selectedIds = [selectedQuestion1, selectedQuestion2, selectedQuestion3].filter(Boolean);
    return securityQuestions.filter(q => {
        const qIdStr = q.id.toString();
        if (excludeKey === 'q1') return qIdStr === selectedQuestion1 || !selectedIds.includes(qIdStr) || qIdStr === '';
        if (excludeKey === 'q2') return qIdStr === selectedQuestion2 || !selectedIds.includes(qIdStr) || qIdStr === '';
        if (excludeKey === 'q3') return qIdStr === selectedQuestion3 || !selectedIds.includes(qIdStr) || qIdStr === '';
        return !selectedIds.includes(qIdStr);
    });
  };


  if (loadingQuestions) {
    return <div className="text-center p-4">Loading security questions...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-2 sm:p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Create New User</h2>

      {error && <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">{error}</div>}

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
          required
        />
        {formErrors.username && <p className="mt-1 text-xs text-red-500">{formErrors.username}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={handlePasswordChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
          required
        />
        {passwordStrengthMessage && <p className={`mt-1 text-xs ${isPasswordStrong(password).strong ? 'text-green-500' : 'text-red-500'}`}>{passwordStrengthMessage}</p>}
        {formErrors.password && <p className="mt-1 text-xs text-red-500">{formErrors.password}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
        <input
          type="password"
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
          required
        />
        {formErrors.confirmPassword && <p className="mt-1 text-xs text-red-500">{formErrors.confirmPassword}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email (Optional)</label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
        />
        {formErrors.email && <p className="mt-1 text-xs text-red-500">{formErrors.email}</p>}
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
        <select
          id="role"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as 'user' | 'admin' | 'super_admin')}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        {formErrors.role && <p className="mt-1 text-xs text-red-500">{formErrors.role}</p>}
      </div>

      <div className="space-y-4">
        <h3 className="text-md font-medium text-gray-900 dark:text-white">Security Questions</h3>
        {formErrors.securityQuestions && <p className="text-xs text-red-500">{formErrors.securityQuestions}</p>}

        {/* Question 1 */}
        <div className="space-y-1">
          <label htmlFor="question1" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Question 1</label>
          <select
            id="question1"
            value={selectedQuestion1}
            onChange={(e) => setSelectedQuestion1(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white"
            disabled={securityQuestions.length === 0}
          >
            <option value="">Select a question</option>
            {getAvailableQuestions('q1').map(q => <option key={`q1-${q.id}`} value={q.id.toString()}>{q.question_text}</option>)}
          </select>
          <input
            type="text"
            id="answer1"
            value={answer1}
            onChange={(e) => setAnswer1(e.target.value)}
            placeholder="Answer for question 1"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            required
          />
          {formErrors.answer1 && <p className="mt-1 text-xs text-red-500">{formErrors.answer1}</p>}
        </div>

        {/* Question 2 */}
        <div className="space-y-1">
          <label htmlFor="question2" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Question 2</label>
          <select
            id="question2"
            value={selectedQuestion2}
            onChange={(e) => setSelectedQuestion2(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white"
            disabled={securityQuestions.length === 0}
          >
            <option value="">Select a question</option>
            {getAvailableQuestions('q2').map(q => <option key={`q2-${q.id}`} value={q.id.toString()}>{q.question_text}</option>)}
          </select>
          <input
            type="text"
            id="answer2"
            value={answer2}
            onChange={(e) => setAnswer2(e.target.value)}
            placeholder="Answer for question 2"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            required
          />
          {formErrors.answer2 && <p className="mt-1 text-xs text-red-500">{formErrors.answer2}</p>}
        </div>

        {/* Question 3 */}
        <div className="space-y-1">
          <label htmlFor="question3" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Question 3</label>
          <select
            id="question3"
            value={selectedQuestion3}
            onChange={(e) => setSelectedQuestion3(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-white"
            disabled={securityQuestions.length === 0}
          >
            <option value="">Select a question</option>
            {getAvailableQuestions('q3').map(q => <option key={`q3-${q.id}`} value={q.id.toString()}>{q.question_text}</option>)}
          </select>
          <input
            type="text"
            id="answer3"
            value={answer3}
            onChange={(e) => setAnswer3(e.target.value)}
            placeholder="Answer for question 3"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            required
          />
          {formErrors.answer3 && <p className="mt-1 text-xs text-red-500">{formErrors.answer3}</p>}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end sm:space-x-3 pt-4 space-y-2 sm:space-y-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || loadingQuestions}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  );
};

export default SuperAdminCreateUserForm;
