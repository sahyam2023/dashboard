import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginGlobal } from '../services/api';
import { Box, TextField, Button, Typography, Container, Alert } from '@mui/material';

const GlobalLoginPage: React.FC = () => {
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { grantGlobalAccess } = useAuth();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await loginGlobal(password);
      grantGlobalAccess();
      navigate('/documents'); // Redirect to a default page after global login
    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || 'An unknown error occurred.');
    }
  };

  return (
    <Container component="main" maxWidth="xs" sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f0f2f5' // A slightly different background for distinction
    }}>
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 3,
          backgroundColor: 'white',
          borderRadius: 2,
          boxShadow: '0 3px 10px rgb(0 0 0 / 0.2)'
        }}
      >
        <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
          Site Access Control
        </Typography>
        <Typography component="p" sx={{ mb: 2, textAlign: 'center', color: 'text.secondary' }}>
          Please enter the global site password to proceed.
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Global Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && (
            <Alert severity="error" sx={{ width: '100%', mt: 2, mb: 1 }}>
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2, backgroundColor: '#1976d2' }} // Standard blue
          >
            Unlock
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default GlobalLoginPage;
