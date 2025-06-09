import React, { useEffect, useState, useCallback } from 'react';
import {
  Paper, Typography, Table, TableBody, TableCell, TableHead, TableRow,
  Button, Switch, CircularProgress, Alert, TablePagination, Tooltip, IconButton,
  Select, MenuItem, FormControl, InputLabel, Box, Chip
} from '@mui/material';
import { Refresh as RefreshIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { UserFeedback, fetchAdminFeedback, updateAdminFeedbackStatus } from '../../services/api';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext'; // To get current user for potential future actions
import { showErrorToast, showSuccessToast } from '../../utils/toastUtils';

const FeedbackViewerWidget: React.FC = () => {
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [resolvedStatusFilter, setResolvedStatusFilter] = useState<'all' | 'true' | 'false'>('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { user } = useAuth(); // Get current user if needed for permissions or logging future actions

  const loadFeedback = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page: page + 1,
        perPage: rowsPerPage,
        sortBy: sortBy,
        sortOrder: sortOrder
      };
      if (resolvedStatusFilter !== 'all') {
        params.resolved_status = resolvedStatusFilter;
      }
      const response = await fetchAdminFeedback(params);
      setFeedbackItems(response.feedback || []);
      setTotalFeedback(response.total_feedback || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch feedback');
      showErrorToast(err.message || 'Failed to fetch feedback');
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage, resolvedStatusFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleToggleResolved = async (feedbackId: number, currentStatus: boolean) => {
    try {
      await updateAdminFeedbackStatus(feedbackId, !currentStatus);
      showSuccessToast(`Feedback status updated successfully!`);
      // Refresh feedback list to show the change
      loadFeedback();
    } catch (err: any) {
      showErrorToast(err.message || 'Failed to update feedback status.');
    }
  };

  const handleFilterChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setResolvedStatusFilter(event.target.value as 'all' | 'true' | 'false');
    setPage(0); // Reset to first page when filter changes
  };

  // Basic styling for cells, can be expanded
  const cellStyle = {
    padding: '8px 12px', // Reduced padding
    fontSize: '0.875rem', // Smaller font size
  };
  const headCellStyle = { ...cellStyle, fontWeight: 'bold' };


  return (
    <Paper elevation={3} sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          User Feedback & Bug Reports
        </Typography>
        <Tooltip title="Refresh Feedback">
          <IconButton onClick={loadFeedback} disabled={isLoading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <FormControl size="small" sx={{ mb: 2, minWidth: 120 }}>
        <InputLabel id="resolved-status-filter-label">Status</InputLabel>
        <Select
          labelId="resolved-status-filter-label"
          id="resolved-status-filter"
          value={resolvedStatusFilter}
          label="Status"
          onChange={handleFilterChange as any} // Cast due to MUI Select type issue
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="false">Unresolved</MenuItem>
          <MenuItem value="true">Resolved</MenuItem>
        </Select>
      </FormControl>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      {!isLoading && !error && feedbackItems.length === 0 && (
        <Typography sx={{ textAlign: 'center', my: 2 }}>No feedback entries found.</Typography>
      )}

      {!isLoading && !error && feedbackItems.length > 0 && (
        <Box sx={{ overflowX: 'auto', flexGrow: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellStyle}>Sender</TableCell>
                <TableCell sx={headCellStyle}>Message</TableCell>
                <TableCell sx={headCellStyle}>Type</TableCell>
                <TableCell sx={headCellStyle}>Date</TableCell>
                <TableCell sx={headCellStyle} align="center">Resolved</TableCell>
                {/* Add Actions column if needed later */}
              </TableRow>
            </TableHead>
            <TableBody>
              {feedbackItems.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={cellStyle}>{item.username || 'N/A'}</TableCell>
                  <TableCell sx={{...cellStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={item.message_content}>
                        <span>{item.message_content}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Chip
                      label={item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      color={item.type === 'bug' ? 'error' : 'info'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    {item.created_at ? format(new Date(item.created_at), 'dd MMM yyyy, HH:mm') : 'N/A'}
                  </TableCell>
                  <TableCell sx={cellStyle} align="center">
                    <Switch
                      checked={item.is_resolved}
                      onChange={() => handleToggleResolved(item.id, item.is_resolved)}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={totalFeedback}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        sx={{ mt: 'auto', pt: 2, borderTop: '1px solid rgba(224, 224, 224, 1)' }} // Ensure it's at the bottom
      />
    </Paper>
  );
};

export default FeedbackViewerWidget;
