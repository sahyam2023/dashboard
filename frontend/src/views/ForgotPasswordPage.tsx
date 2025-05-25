import React, { useState, FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  requestPasswordResetInfo,
  verifySecurityAnswers,
  resetPasswordWithToken,
  PasswordResetInfoResponse,
  VerifySecurityAnswersResponse,
  SecurityQuestion, // Assuming SecurityQuestion type is exported from api.ts if not from types.ts
} from '../services/api';
import {
  Box, TextField, Button, Typography, Container, Alert, Stepper, Step, StepLabel, CircularProgress, Paper, IconButton, InputAdornment
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

type AnswerInput = {
  question_id: number;
  answer: string;
};

const ForgotPasswordPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(0); // 0: Enter Username/Email, 1: Answer Questions, 2: Reset Password
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Step 0: Username/Email
  const [usernameOrEmail, setUsernameOrEmail] = useState<string>('');

  // Step 1: Security Questions
  const [passwordResetInfo, setPasswordResetInfo] = useState<PasswordResetInfoResponse | null>(null);
  const [securityAnswers, setSecurityAnswers] = useState<AnswerInput[]>([]);

  // Step 2: Reset Token and New Password
  const [resetTokenInfo, setResetTokenInfo] = useState<VerifySecurityAnswersResponse | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState<boolean>(false);
  const [passwordValidationError, setPasswordValidationError] = useState<string>('');


  const navigate = useNavigate();

  const handleUsernameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestPasswordResetInfo({ username_or_email: usernameOrEmail });
      setPasswordResetInfo(data);
      setSecurityAnswers(data.questions.map(q => ({ question_id: q.question_id, answer: '' })));
      setCurrentStep(1);
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || 'Failed to retrieve user information.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswersSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    if (!passwordResetInfo) {
      setError("User information not found. Please start over.");
      setIsLoading(false);
      setCurrentStep(0);
      return;
    }
    if (securityAnswers.some(sa => sa.answer.trim() === '')) {
      setError("All security questions must be answered.");
      setIsLoading(false);
      return;
    }
    try {
      const payload = {
        user_id: passwordResetInfo.user_id,
        answers: securityAnswers.map(sa => ({ question_id: sa.question_id, answer: sa.answer.trim() })),
      };
      const data = await verifySecurityAnswers(payload);
      setResetTokenInfo(data);
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || 'Failed to verify security answers.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Basic password validation (can be enhanced)
  const validateNewPassword = (pwd: string): string => {
    if (pwd.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
    if (!/[a-z]/.test(pwd)) return "Password must include at least one lowercase letter.";
    if (!/[0-9]/.test(pwd)) return "Password must include at least one digit.";
    return "";
  };


  const handlePasswordResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setPasswordValidationError('');

    if (!resetTokenInfo) {
      setError("Reset token not found. Please start over.");
      setIsLoading(false);
      setCurrentStep(0);
      return;
    }
    const validationError = validateNewPassword(newPassword);
    if (validationError) {
        setPasswordValidationError(validationError);
        setIsLoading(false);
        return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordValidationError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      const data = await resetPasswordWithToken({ token: resetTokenInfo.reset_token, new_password: newPassword });
      setSuccessMessage(data.msg + " You will be redirected to login shortly.");
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSecurityAnswerChange = (questionId: number, answer: string) => {
    setSecurityAnswers(prev =>
      prev.map(sa => (sa.question_id === questionId ? { ...sa, answer } : sa))
    );
  };

  const steps = ['Enter Username/Email', 'Answer Security Questions', 'Reset Password'];

  return (
    <Container component="main" maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
          Forgot Password
        </Typography>
        <Stepper activeStep={currentStep} sx={{ width: '100%', mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}
        {successMessage && <Alert severity="success" sx={{ width: '100%', mb: 2 }}>{successMessage}</Alert>}

        {currentStep === 0 && (
          <Box component="form" onSubmit={handleUsernameSubmit} sx={{ width: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Please enter your username or email address to start the password reset process.
            </Typography>
            <TextField
              margin="normal"
              required
              fullWidth
              id="usernameOrEmail"
              label="Username or Email"
              name="usernameOrEmail"
              autoComplete="username"
              autoFocus
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isLoading}>
              {isLoading ? <CircularProgress size={24} /> : 'Next'}
            </Button>
          </Box>
        )}

        {currentStep === 1 && passwordResetInfo && (
          <Box component="form" onSubmit={handleAnswersSubmit} sx={{ width: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Hello, {passwordResetInfo.username}. Please answer your security questions.
            </Typography>
            {passwordResetInfo.questions.map((q, index) => (
              <Box key={q.question_id} sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{q.question_text}</Typography>
                <TextField
                  margin="dense"
                  required
                  fullWidth
                  name={`answer-${q.question_id}`}
                  label={`Answer ${index + 1}`}
                  type="text"
                  id={`answer-${q.question_id}`}
                  value={securityAnswers.find(sa => sa.question_id === q.question_id)?.answer || ''}
                  onChange={(e) => handleSecurityAnswerChange(q.question_id, e.target.value)}
                  disabled={isLoading}
                />
              </Box>
            ))}
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isLoading}>
              {isLoading ? <CircularProgress size={24} /> : 'Verify Answers'}
            </Button>
          </Box>
        )}

        {currentStep === 2 && resetTokenInfo && (
          <Box component="form" onSubmit={handlePasswordResetSubmit} sx={{ width: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Create a new password.
            </Typography>
            <TextField
              margin="normal"
              required
              fullWidth
              name="newPassword"
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              id="newPassword"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (passwordValidationError) setPasswordValidationError(validateNewPassword(e.target.value));
              }}
              error={!!passwordValidationError}
              helperText={passwordValidationError}
              disabled={isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle new password visibility"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      edge="end"
                      disabled={isLoading}
                    >
                      {showNewPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmNewPassword"
              label="Confirm New Password"
              type={showConfirmNewPassword ? 'text' : 'password'}
              id="confirmNewPassword"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              error={newPassword !== confirmNewPassword && confirmNewPassword !== ""}
              helperText={newPassword !== confirmNewPassword && confirmNewPassword !== "" ? "Passwords do not match." : ""}
              disabled={isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle confirm new password visibility"
                      onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                      edge="end"
                      disabled={isLoading}
                    >
                      {showConfirmNewPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={isLoading}>
              {isLoading ? <CircularProgress size={24} /> : 'Reset Password'}
            </Button>
          </Box>
        )}
        
        {!successMessage && (
          <Typography variant="body2" align="center" sx={{ mt: 3 }}>
            Remember your password? <RouterLink to="/login" style={{ textDecoration: 'none' }}>Sign In</RouterLink>
          </Typography>
        )}
      </Paper>
    </Container>
  );
};

export default ForgotPasswordPage;
