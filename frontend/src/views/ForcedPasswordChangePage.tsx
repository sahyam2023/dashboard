import React, { useState, FormEvent } from 'react';
import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { changePassword, ChangePasswordPayload } from '../services/api';
import { Box, TextField, Button, Typography, Container, Alert, Paper, IconButton, InputAdornment } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { showSuccessToast, showErrorToast } from '../utils/toastUtils'; // Added toast imports

const ForcedPasswordChangePage: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordValidationError, setPasswordValidationError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const auth = useAuth();
  const navigate = useNavigate();

  const validatePassword = (pwd: string): string => {
    if (pwd.length < 8) return "New password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pwd)) return "New password must include at least one uppercase letter.";
    if (!/[a-z]/.test(pwd)) return "New password must include at least one lowercase letter.";
    if (!/[0-9]/.test(pwd)) return "New password must include at least one digit.";
    return "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPasswordValidationError('');
    setSuccessMessage(null);

    const newPasswordValidationError = validatePassword(newPassword);
    if (newPasswordValidationError) {
      setPasswordValidationError(newPasswordValidationError);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordValidationError("New passwords do not match.");
      return;
    }

    setIsLoading(true);
    const payload: ChangePasswordPayload = {
      current_password: currentPassword, // If current password is not required, this can be an empty string or handled by backend
      new_password: newPassword,
    };

    try {
      const response = await changePassword(payload);
      const successMsg = response.msg || "Password changed successfully. You can now login with your new password.";
      setSuccessMessage(successMsg); // Keep existing Alert logic
      showSuccessToast(successMsg); // Add toast
      auth.clearPasswordResetRequiredFlag(); // Clear the flag in context
      setTimeout(() => {
        auth.logout(); // Logout the user to force re-login with new password
        navigate('/login'); // Redirect to login page
      }, 2500); // Slightly longer timeout to allow toast visibility
    } catch (err: any) {
      const errMsg = err.response?.data?.msg || err.message || "Failed to change password.";
      if (errMsg.toLowerCase().includes("password")) {
        setPasswordValidationError(errMsg); // Keep specific password field error
      } else {
        setError(errMsg); // Keep general error Alert
      }
      showErrorToast(errMsg); // Add toast for all errors
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Paper elevation={3} sx={{ p: 4, mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <Typography component="h1" variant="h5" sx={{ mb: 1 }}>
          Change Your Password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
          A password change is required for your account. Please set a new password below.
        </Typography>

        {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}
        {successMessage && <Alert severity="success" sx={{ width: '100%', mb: 2 }}>{successMessage}</Alert>}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%' }}>
          {/* Current Password Field - Consider if this is needed/enforced by backend for this flow */}
          {/* For a forced reset, user might not know current password if it was temporary or compromised */}
          {/* If backend doesn't require it for forced reset, this field can be omitted */}
          <TextField
            margin="normal"
            required 
            fullWidth
            name="currentPassword"
            label="Current Password"
            type={showCurrentPassword ? 'text' : 'password'}
            id="currentPassword"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={isLoading || !!successMessage}
            helperText="Enter your current password (may not be required if this is a forced reset after login)."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle current password visibility"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    edge="end"
                    disabled={isLoading || !!successMessage}
                  >
                    {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
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
              if (passwordValidationError) setPasswordValidationError(validatePassword(e.target.value));
            }}
            error={!!passwordValidationError && !successMessage}
            helperText={!successMessage ? passwordValidationError : ""}
            disabled={isLoading || !!successMessage}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle new password visibility"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    edge="end"
                    disabled={isLoading || !!successMessage}
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
            error={newPassword !== confirmNewPassword && confirmNewPassword !== "" && !successMessage}
            helperText={newPassword !== confirmNewPassword && confirmNewPassword !== "" && !successMessage ? "New passwords do not match." : ""}
            disabled={isLoading || !!successMessage}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle confirm new password visibility"
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    edge="end"
                    disabled={isLoading || !!successMessage}
                  >
                    {showConfirmNewPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isLoading || !!successMessage}
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default ForcedPasswordChangePage;
