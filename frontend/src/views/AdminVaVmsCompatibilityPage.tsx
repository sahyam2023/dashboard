import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import VaVmsCompatibilityForm from '../../components/admin/compatibility/VaVmsCompatibilityForm';
import VaVmsCompatibilityTable from '../../components/admin/compatibility/VaVmsCompatibilityTable';
import Modal from '../../components/shared/Modal';
import { PlusCircle } from 'lucide-react';
import { AdminVaVmsCompatibilityEntry } from '../../types';

const AdminVaVmsCompatibilityPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
       const [editingCompatibility, setEditingCompatibility] = useState<AdminVaVmsCompatibilityEntry | null>(null);
  const [refreshTableKey, setRefreshTableKey] = useState(0);

       const handleOpenForm = (compatibilityToEdit: AdminVaVmsCompatibilityEntry | null = null) => {
    setEditingCompatibility(compatibilityToEdit);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCompatibility(null);
  };

  const handleFormSuccess = () => {
    handleCloseForm();
    setRefreshTableKey(prev => prev + 1);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        VA - VMS Version Compatibility Management
      </Typography>

      <Paper sx={{ mb: 2, p: 2 }}>
        <Button
          variant="contained"
          startIcon={<PlusCircle />}
          onClick={() => handleOpenForm()}
        >
          Add New Compatibility
        </Button>
      </Paper>

           {/* Form Modal */}
      {isFormOpen && (
             <Modal
                 isOpen={isFormOpen}
                 onClose={handleCloseForm}
                 title={editingCompatibility ? 'Edit Compatibility Link' : 'Add New Compatibility Link'}
             >
                 <VaVmsCompatibilityForm
                     initialData={editingCompatibility}
                     onSuccess={handleFormSuccess}
                     onCancel={handleCloseForm}
                 />
             </Modal>
      )}

      {/* Actual Table component */}
      <Paper sx={{ p: 2, mt: 2 }}>
        {/* Typography for "Existing Compatibilities" is now inside the Table component or can be added here if preferred */}
        <VaVmsCompatibilityTable
            onEdit={handleOpenForm}
            refreshKey={refreshTableKey}
        />
      </Paper>
    </Box>
  );
};

export default AdminVaVmsCompatibilityPage;
