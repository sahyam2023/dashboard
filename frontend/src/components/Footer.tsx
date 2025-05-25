import React from 'react';
import { Box, Typography } from '@mui/material';

const Footer: React.FC = () => {
  return (
    <Box 
      component="footer" 
      sx={{ 
        py: 2, 
        mt: 'auto', // Pushes footer to the bottom in a flex column layout
        // Use theme palette for background and text for consistency
        backgroundColor: (theme) => theme.palette.mode === 'light' 
            ? theme.palette.grey[200] 
            : theme.palette.grey[800], 
        textAlign: 'center',
        borderTop: (theme) => `1px solid ${theme.palette.divider}` // Optional: adds a subtle top border
      }}
    >
      <Typography variant="body2" color="text.secondary">
        © {new Date().getFullYear()} I2V. All rights reserved.
      </Typography>
    </Box>
  );
};

export default Footer;
