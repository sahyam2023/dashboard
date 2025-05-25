import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Modal, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Box, Typography, CircularProgress } from '@mui/material';

const SessionTimeoutWarningModal: React.FC = () => {
  const { 
    isSessionWarningModalOpen, 
    setSessionWarningModalOpen, 
    sessionWarningCountdown, 
    refreshSession, 
    logout 
  } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleStayLoggedIn = async () => {
    setIsRefreshing(true);
    try {
      await refreshSession();
      // The modal should be closed by the refreshSession success logic in AuthContext
      // or by the useEffect watching timeLeftSeconds becoming > WARNING_THRESHOLD_SECONDS.
      // Explicitly closing here might be redundant if AuthContext handles it, but safe.
      // setSessionWarningModalOpen(false); // AuthContext should handle this
    } catch (error) {
      // Error toast is shown in refreshSession, user will be logged out eventually.
      // Modal will remain open until session actually expires or user logs out.
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout(); // This will also close the modal via AuthContext logic
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isSessionWarningModalOpen) {
    return null;
  }

  return (
    <Dialog
      open={isSessionWarningModalOpen}
      onClose={(event, reason) => {
        // Prevent closing on backdrop click or escape key for this modal
        if (reason && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
          return;
        }
        // Fallback if some other close event occurs, though not expected with current setup
        setSessionWarningModalOpen(false); 
      }}
      aria-labelledby="session-timeout-warning-title"
      aria-describedby="session-timeout-warning-description"
      disableEscapeKeyDown // Explicitly disable escape key
    >
      <DialogTitle id="session-timeout-warning-title">Session Timeout Warning</DialogTitle>
      <DialogContent>
        <DialogContentText id="session-timeout-warning-description">
          Your session is about to expire in <Typography component="span" sx={{ fontWeight: 'bold' }}>{formatTime(sessionWarningCountdown)}</Typography>.
        </DialogContentText>
        <DialogContentText sx={{ mt: 1 }}>
          Would you like to stay logged in?
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ p: '16px 24px' }}>
        <Button onClick={handleLogout} color="secondary" variant="outlined" disabled={isRefreshing}>
          Logout
        </Button>
        <Button 
          onClick={handleStayLoggedIn} 
          color="primary" 
          variant="contained" 
          disabled={isRefreshing}
          sx={{ minWidth: '140px' }} // Ensure button width is somewhat consistent
        >
          {isRefreshing ? <CircularProgress size={24} color="inherit" /> : 'Stay Logged In'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SessionTimeoutWarningModal;
