import React from 'react';
import { Box, Typography } from '@mui/material';

const APP_VERSION = "1.0.1"; // Example version, user can change this

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <Box 
      component="footer" 
      sx={{ 
        py: 2, 
        mt: 'auto', 
        backgroundColor: (theme) => theme.palette.mode === 'light' 
            ? theme.palette.grey[200] 
            : theme.palette.background.paper, 
        textAlign: 'center',
        borderTop: (theme) => `1px solid ${theme.palette.divider}`
      }}
    >
      <Typography variant="body2" color="text.secondary">
        © {currentYear} I2V. All rights reserved. | Version: {APP_VERSION} | Made with ❤️ by Sahyam
      </Typography>
    </Box>
  );
};

export default Footer;