import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button,
  TablePagination, CircularProgress, Typography, IconButton, Box, TextField, Grid,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { Edit, Delete, FilterList } from '@mui/icons-material';
import { AdminVaVmsCompatibilityEntry, fetchAdminVaVmsCompatibility, deleteAdminVaVmsCompatibility, SoftwareVersion, fetchVersionsForSoftware, Software, fetchSoftware } from '../../../services/api';
import { showErrorToast, showSuccessToast } from '../../../utils/toastUtils';
import ConfirmationModal from '../../shared/ConfirmationModal'; // Assuming path
import { formatToISTLocaleString } from '../../../utils/dateUtils'; // Corrected import name

interface VaVmsCompatibilityTableProps {
  onEdit: (compatibility: AdminVaVmsCompatibilityEntry) => void;
  refreshKey: number;
}

const VMS_SOFTWARE_NAME = 'VMS'; // Consider making these configurable if needed
const VA_SOFTWARE_NAME = 'VA';

const VaVmsCompatibilityTable: React.FC<VaVmsCompatibilityTableProps> = ({ onEdit, refreshKey }) => {
  const [compatibilities, setCompatibilities] = useState<AdminVaVmsCompatibilityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRows, setTotalRows] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<AdminVaVmsCompatibilityEntry | null>(null);

  // Filtering states
  const [showFilters, setShowFilters] = useState(false);
  const [filterVaSoftwareId, setFilterVaSoftwareId] = useState<string>('');
  const [filterVmsSoftwareId, setFilterVmsSoftwareId] = useState<string>('');
  const [filterVaVersionId, setFilterVaVersionId] = useState<string>('');
  const [filterVmsVersionId, setFilterVmsVersionId] = useState<string>('');

  const [allSoftware, setAllSoftware] = useState<Software[]>([]);
  const [vaSoftwareEntity, setVaSoftwareEntity] = useState<Software | null>(null);
  const [vmsSoftwareEntity, setVmsSoftwareEntity] = useState<Software | null>(null);
  const [vaVersionsForFilter, setVaVersionsForFilter] = useState<SoftwareVersion[]>([]);
  const [vmsVersionsForFilter, setVmsVersionsForFilter] = useState<SoftwareVersion[]>([]);
  const [loadingFilterSoftware, setLoadingFilterSoftware] = useState(false);
  const [loadingFilterVaVersions, setLoadingFilterVaVersions] = useState(false);
  const [loadingFilterVmsVersions, setLoadingFilterVmsVersions] = useState(false);

 useEffect(() => {
     setLoadingFilterSoftware(true);
     fetchSoftware().then(data => {
         setAllSoftware(data);
         const foundVa = data.find(s => s.name.toUpperCase() === VA_SOFTWARE_NAME.toUpperCase());
         const foundVms = data.find(s => s.name.toUpperCase() === VMS_SOFTWARE_NAME.toUpperCase());
         if (foundVa) {
             setVaSoftwareEntity(foundVa);
             setFilterVaSoftwareId(foundVa.id.toString()); // Auto-set VA filter
         }
         if (foundVms) {
             setVmsSoftwareEntity(foundVms);
             setFilterVmsSoftwareId(foundVms.id.toString()); // Auto-set VMS filter
         }
     }).catch(() => showErrorToast("Failed to load software for filters."))
       .finally(() => setLoadingFilterSoftware(false));
 }, []);

 useEffect(() => {
     if (filterVaSoftwareId) {
         setLoadingFilterVaVersions(true);
         fetchVersionsForSoftware(parseInt(filterVaSoftwareId))
             .then(setVaVersionsForFilter)
             .catch(() => showErrorToast('Failed to load VA versions for filter.'))
             .finally(() => setLoadingFilterVaVersions(false));
     } else {
         setVaVersionsForFilter([]);
     }
     setFilterVaVersionId(''); // Reset version when software changes
 }, [filterVaSoftwareId]);

 useEffect(() => {
     if (filterVmsSoftwareId) {
         setLoadingFilterVmsVersions(true);
         fetchVersionsForSoftware(parseInt(filterVmsSoftwareId))
             .then(setVmsVersionsForFilter)
             .catch(() => showErrorToast('Failed to load VMS versions for filter.'))
             .finally(() => setLoadingFilterVmsVersions(false));
     } else {
         setVmsVersionsForFilter([]);
     }
     setFilterVmsVersionId(''); // Reset version when software changes
 }, [filterVmsSoftwareId]);


  const loadCompatibilities = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: page + 1, per_page: rowsPerPage };
      if (filterVaVersionId) params.va_version_id = parseInt(filterVaVersionId);
      if (filterVmsVersionId) params.vms_version_id = parseInt(filterVmsVersionId);
      // Note: The backend GET /api/admin/va_vms_compatibility might also need to support
      // filtering by va_software_id and vms_software_id if we allow changing those in filter UI.
      // For now, assuming VA/VMS software types are fixed and filters are for their versions.

      const data = await fetchAdminVaVmsCompatibility(params);
      setCompatibilities(data.compatibility_records || []); // Updated to match actual API response
      setTotalRows(data.total_records || 0); // Updated to match actual API response
    } catch (error) {
      showErrorToast('Failed to load compatibility data.');
      setCompatibilities([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterVaVersionId, filterVmsVersionId, refreshKey]); // Added refreshKey

  useEffect(() => {
    loadCompatibilities();
  }, [loadCompatibilities]); // loadCompatibilities is memoized with its deps

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDeleteClick = (compatibility: AdminVaVmsCompatibilityEntry) => {
    setItemToDelete(compatibility);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await deleteAdminVaVmsCompatibility(itemToDelete.id);
      showSuccessToast('Compatibility link deleted successfully!');
      loadCompatibilities(); // Refresh table
    } catch (error: any) {
      showErrorToast(error.response?.data?.msg || 'Failed to delete compatibility link.');
    } finally {
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

 const handleApplyFilters = () => {
     setPage(0); // Reset to first page when applying filters
     loadCompatibilities();
 };

 const handleClearFilters = () => {
     setFilterVaVersionId('');
     setFilterVmsVersionId('');
     // Optionally reset software filters if they were selectable
     // setFilterVaSoftwareId(vaSoftwareEntity?.id.toString() || '');
     // setFilterVmsSoftwareId(vmsSoftwareEntity?.id.toString() || '');
     setPage(0);
     // Manually trigger loadCompatibilities because state update might not be immediate for all filters
     // A slight delay or direct call might be needed if issues persist.
     // For now, relying on useEffect for loadCompatibilities to pick up changes.
     // To be safe, call it directly after a very short timeout or structure state updates to ensure it runs.
     setTimeout(() => loadCompatibilities(), 0);
 };


  return (
    <Box>
     <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
         <Button
             startIcon={<FilterList />}
             onClick={() => setShowFilters(!showFilters)}
             variant={showFilters ? "contained" : "outlined"}
         >
             {showFilters ? 'Hide Filters' : 'Show Filters'}
         </Button>
     </Box>

     {showFilters && (
         <Paper sx={{ p: 2, mb: 2 }}>
             <Typography variant="subtitle1" gutterBottom>Filter Options</Typography>
             <Grid container spacing={2} alignItems="center">
                 {/* VA Software Filter (Potentially Readonly/Hidden if VA is fixed) */}
                 <Grid item xs={12} sm={3}>
                     <FormControl fullWidth size="small" disabled={loadingFilterSoftware || !vaSoftwareEntity}>
                         <InputLabel>VA Software</InputLabel>
                         <Select value={filterVaSoftwareId} label="VA Software" onChange={e => setFilterVaSoftwareId(e.target.value)} disabled>
                             {vaSoftwareEntity && <MenuItem value={vaSoftwareEntity.id.toString()}>{vaSoftwareEntity.name}</MenuItem>}
                         </Select>
                     </FormControl>
                 </Grid>
                 {/* VA Version Filter */}
                 <Grid item xs={12} sm={3}>
                     <FormControl fullWidth size="small" disabled={loadingFilterVaVersions || !filterVaSoftwareId}>
                         <InputLabel>VA Version</InputLabel>
                         <Select value={filterVaVersionId} label="VA Version" onChange={e => setFilterVaVersionId(e.target.value)}>
                             <MenuItem value=""><em>All VA Versions</em></MenuItem>
                             {vaVersionsForFilter.map(v => <MenuItem key={v.id} value={v.id.toString()}>{v.version_number}</MenuItem>)}
                         </Select>
                     </FormControl>
                 </Grid>
                 {/* VMS Software Filter (Potentially Readonly/Hidden) */}
                 <Grid item xs={12} sm={3}>
                     <FormControl fullWidth size="small" disabled={loadingFilterSoftware || !vmsSoftwareEntity}>
                         <InputLabel>VMS Software</InputLabel>
                         <Select value={filterVmsSoftwareId} label="VMS Software" onChange={e => setFilterVmsSoftwareId(e.target.value)} disabled>
                             {vmsSoftwareEntity && <MenuItem value={vmsSoftwareEntity.id.toString()}>{vmsSoftwareEntity.name}</MenuItem>}
                         </Select>
                     </FormControl>
                 </Grid>
                 {/* VMS Version Filter */}
                 <Grid item xs={12} sm={3}>
                     <FormControl fullWidth size="small" disabled={loadingFilterVmsVersions || !filterVmsSoftwareId}>
                         <InputLabel>VMS Version</InputLabel>
                         <Select value={filterVmsVersionId} label="VMS Version" onChange={e => setFilterVmsVersionId(e.target.value)}>
                             <MenuItem value=""><em>All VMS Versions</em></MenuItem>
                             {vmsVersionsForFilter.map(v => <MenuItem key={v.id} value={v.id.toString()}>{v.version_number}</MenuItem>)}
                         </Select>
                     </FormControl>
                 </Grid>
                 <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                     <Button onClick={handleClearFilters} variant="outlined" size="small">Clear Filters</Button>
                     <Button onClick={handleApplyFilters} variant="contained" size="small">Apply Filters</Button>
                 </Grid>
             </Grid>
         </Paper>
     )}

      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="compatibility table">
          <TableHead>
            <TableRow>
              <TableCell>VA Software</TableCell>
              <TableCell>VA Version</TableCell>
              <TableCell>VMS Software</TableCell>
              <TableCell>VMS Version</TableCell>
              <TableCell sx={{minWidth: 200}}>Description</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell>Updated At</TableCell>
              <TableCell align="right" sx={{minWidth: 130}}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} align="center"><CircularProgress /></TableCell></TableRow>
            ) : compatibilities.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center"><Typography>No compatibility links found.</Typography></TableCell></TableRow>
            ) : (
              compatibilities.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.va_software_name}</TableCell>
                  <TableCell>{row.va_version_number}</TableCell>
                  <TableCell>{row.vms_software_name}</TableCell>
                  <TableCell>{row.vms_version_number}</TableCell>
                  <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description || ''}>
                     {row.description || '-'}
                  </TableCell>
                  <TableCell>{formatToISTLocaleString(row.created_at)}</TableCell>
                  <TableCell>{formatToISTLocaleString(row.updated_at)}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => onEdit(row)} size="small" aria-label="edit" color="primary"><Edit /></IconButton>
                    <IconButton onClick={() => handleDeleteClick(row)} size="small" aria-label="delete" color="error"><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={totalRows}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Confirm Delete"
        message={`Are you sure you want to delete the compatibility link between ${itemToDelete?.va_software_name} ${itemToDelete?.va_version_number} and ${itemToDelete?.vms_software_name} ${itemToDelete?.vms_version_number}?`}
        onConfirm={confirmDeleteItem}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmButtonText="Delete"
        confirmButtonVariant="danger"
      />
    </Box>
  );
};

export default VaVmsCompatibilityTable;
