import React from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Breadcrumbs as MuiBreadcrumbs, Link as MuiLink, Typography, Box } from '@mui/material';
import { Home as HomeIcon } from 'lucide-react'; // Optional: for a home icon

// Helper to capitalize and format path segments
const formatSegment = (segment: string) => {
  if (!segment) return '';
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(x => x);

  // Do not render breadcrumbs on the homepage itself if pathnames is empty
  // or for very specific paths like /login, /register if not desired.
  const publicPaths = ["login", "register", "forgot-password", "force-change-password"];
  if (pathnames.length === 0 || publicPaths.includes(pathnames[0])) {
    return null; 
  }

  return (
    <Box sx={{ my: 2, ml: 0.5 }}> {/* Added small left margin to align with page content better */}
      <MuiBreadcrumbs aria-label="breadcrumb">
        <MuiLink
          component={RouterLink}
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          to="/"
        >
          <HomeIcon size={20} style={{ marginRight: '4px' }} /> 
          Home
        </MuiLink>
        {pathnames.map((value, index) => {
          const last = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          const formattedName = formatSegment(value);

          return last ? (
            <Typography color="text.primary" key={to}>
              {formattedName}
            </Typography>
          ) : (
            <MuiLink component={RouterLink} underline="hover" color="inherit" to={to} key={to}>
              {formattedName}
            </MuiLink>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};
export default Breadcrumbs;
