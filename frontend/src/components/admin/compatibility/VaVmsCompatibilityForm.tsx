import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { Button, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, Grid, Typography, Box } from '@mui/material';
import { Software, SoftwareVersion, AdminVaVmsCompatibilityEntry, addAdminVaVmsCompatibility, updateAdminVaVmsCompatibility, fetchSoftware, fetchVersionsForSoftware } from '../../../services/api';
import { showErrorToast, showSuccessToast } from '../../../utils/toastUtils';

interface VaVmsCompatibilityFormProps {
  initialData?: AdminVaVmsCompatibilityEntry | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  vaSoftwareId: string;
  vaVersionId: string;
  vmsSoftwareId: string;
  vmsVersionId: string;
  description: string;
}

const schema = yup.object().shape({
  vaSoftwareId: yup.string().required('VA Software is required.'),
  vaVersionId: yup.string().required('VA Version is required.'),
  vmsSoftwareId: yup.string().required('VMS Software is required.'),
  vmsVersionId: yup.string().required('VMS Version is required.'),
  description: yup.string().max(500, 'Description cannot exceed 500 characters.').nullable(),
});

const VMS_SOFTWARE_NAME = 'VMS';
const VA_SOFTWARE_NAME = 'VA';

const VaVmsCompatibilityForm: React.FC<VaVmsCompatibilityFormProps> = ({ initialData, onSuccess, onCancel }) => {
  const { control, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      vaSoftwareId: '',
      vaVersionId: '',
      vmsSoftwareId: '',
      vmsVersionId: '',
      description: '',
    },
  });

  const [allSoftware, setAllSoftware] = useState<Software[]>([]);
  const [vaSoftwareEntity, setVaSoftwareEntity] = useState<Software | null>(null);
  const [vmsSoftwareEntity, setVmsSoftwareEntity] = useState<Software | null>(null);
  const [vaVersions, setVaVersions] = useState<SoftwareVersion[]>([]);
  const [vmsVersions, setVmsVersions] = useState<SoftwareVersion[]>([]);
  const [loadingSoftware, setLoadingSoftware] = useState(true);
  const [loadingVaVersions, setLoadingVaVersions] = useState(false);
  const [loadingVmsVersions, setLoadingVmsVersions] = useState(false);

  const watchedVaSoftwareId = watch('vaSoftwareId');
  const watchedVmsSoftwareId = watch('vmsSoftwareId');

  useEffect(() => {
    fetchSoftware()
      .then(data => {
        setAllSoftware(data);
        const foundVa = data.find(s => s.name.toUpperCase() === VA_SOFTWARE_NAME.toUpperCase());
        const foundVms = data.find(s => s.name.toUpperCase() === VMS_SOFTWARE_NAME.toUpperCase());

        if (foundVa) {
          setVaSoftwareEntity(foundVa);
          setValue('vaSoftwareId', foundVa.id.toString());
        } else {
          showErrorToast(`Software named '${VA_SOFTWARE_NAME}' not found. Please create it first.`);
        }
        if (foundVms) {
          setVmsSoftwareEntity(foundVms);
          setValue('vmsSoftwareId', foundVms.id.toString());
        } else {
          showErrorToast(`Software named '${VMS_SOFTWARE_NAME}' not found. Please create it first.`);
        }
      })
      .catch(() => showErrorToast('Failed to load software list.'))
      .finally(() => setLoadingSoftware(false));
  }, [setValue]);

  useEffect(() => {
    if (watchedVaSoftwareId) {
      setLoadingVaVersions(true);
      fetchVersionsForSoftware(parseInt(watchedVaSoftwareId))
        .then(setVaVersions)
        .catch(() => showErrorToast('Failed to load VA versions.'))
        .finally(() => setLoadingVaVersions(false));
    } else {
      setVaVersions([]);
    }
    setValue('vaVersionId', '');
  }, [watchedVaSoftwareId, setValue]);

  useEffect(() => {
    if (watchedVmsSoftwareId) {
      setLoadingVmsVersions(true);
      fetchVersionsForSoftware(parseInt(watchedVmsSoftwareId))
        .then(setVmsVersions)
        .catch(() => showErrorToast('Failed to load VMS versions.'))
        .finally(() => setLoadingVmsVersions(false));
    } else {
      setVmsVersions([]);
    }
    setValue('vmsVersionId', '');
  }, [watchedVmsSoftwareId, setValue]);

  useEffect(() => {
     if (initialData) {
         const vaSoftwareIdToSet = initialData.va_software_id?.toString() || (vaSoftwareEntity?.id.toString() || '');
         const vmsSoftwareIdToSet = initialData.vms_software_id?.toString() || (vmsSoftwareEntity?.id.toString() || '');

         setValue('vaSoftwareId', vaSoftwareIdToSet);
         setValue('vmsSoftwareId', vmsSoftwareIdToSet);
         setValue('description', initialData.description || '');
     }
  }, [initialData, setValue, vaSoftwareEntity, vmsSoftwareEntity]);

 useEffect(() => {
     if (initialData && vaVersions.length > 0 && watchedVaSoftwareId === (initialData.va_software_id?.toString() || vaSoftwareEntity?.id.toString())) {
         if (vaVersions.some(v => v.id.toString() === initialData.va_version_id.toString())) {
              setValue('vaVersionId', initialData.va_version_id.toString());
         }
     }
 }, [initialData, vaVersions, watchedVaSoftwareId, setValue, vaSoftwareEntity]);

 useEffect(() => {
     if (initialData && vmsVersions.length > 0 && watchedVmsSoftwareId === (initialData.vms_software_id?.toString() || vmsSoftwareEntity?.id.toString())) {
          if (vmsVersions.some(v => v.id.toString() === initialData.vms_version_id.toString())) {
             setValue('vmsVersionId', initialData.vms_version_id.toString());
          }
     }
 }, [initialData, vmsVersions, watchedVmsSoftwareId, setValue, vmsSoftwareEntity]);


  const onSubmit = async (formData: FormData) => {
    const payload = {
      va_version_id: parseInt(formData.vaVersionId),
      vms_version_id: parseInt(formData.vmsVersionId),
      description: formData.description,
    };
    try {
      if (initialData) {
        await updateAdminVaVmsCompatibility(initialData.id, payload);
        showSuccessToast('Compatibility updated successfully!');
      } else {
        await addAdminVaVmsCompatibility(payload);
        showSuccessToast('Compatibility added successfully!');
      }
      reset(); // Reset form after successful submission
      onSuccess(); // Call onSuccess callback (e.g., to close modal and refresh table)
    } catch (error: any) {
      showErrorToast(error.response?.data?.msg || error.message || 'Failed to save compatibility.');
    }
  };

  if (loadingSoftware) {
    return <Box sx={{display: 'flex', justifyContent: 'center', p:2}}><CircularProgress /><Typography sx={{ml:1}}>Loading software definitions...</Typography></Box>;
  }

  if (!vaSoftwareEntity || !vmsSoftwareEntity) {
     return <Typography color="error" sx={{p:2}}>Required software '{VA_SOFTWARE_NAME}' or '{VMS_SOFTWARE_NAME}' not found. Please ensure they are added via Software Management.</Typography>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Grid container spacing={2} sx={{p: 2}}> {/* Added padding to the grid container */}
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.vaSoftwareId}>
            <InputLabel id="va-software-label">VA Software</InputLabel>
            <Controller
              name="vaSoftwareId"
              control={control}
              render={({ field }) => (
                <Select labelId="va-software-label" {...field} label="VA Software" disabled>
                  {vaSoftwareEntity && <MenuItem value={vaSoftwareEntity.id.toString()}>{vaSoftwareEntity.name}</MenuItem>}
                </Select>
              )}
            />
            {errors.vaSoftwareId && <p className="text-red-600 text-xs">{errors.vaSoftwareId.message}</p>}
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.vaVersionId} disabled={loadingVaVersions || !watchedVaSoftwareId}>
            <InputLabel id="va-version-label">VA Version*</InputLabel>
            <Controller
              name="vaVersionId"
              control={control}
              render={({ field }) => (
                <Select labelId="va-version-label" {...field} label="VA Version*">
                  <MenuItem value="" disabled><em>{loadingVaVersions ? 'Loading VA versions...' : 'Select VA Version'}</em></MenuItem>
                  {vaVersions.map(v => <MenuItem key={v.id} value={v.id.toString()}>{v.version_number}</MenuItem>)}
                </Select>
              )}
            />
            {errors.vaVersionId && <p className="text-red-600 text-xs">{errors.vaVersionId.message}</p>}
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.vmsSoftwareId}>
            <InputLabel id="vms-software-label">VMS Software</InputLabel>
            <Controller
              name="vmsSoftwareId"
              control={control}
              render={({ field }) => (
                <Select labelId="vms-software-label" {...field} label="VMS Software" disabled>
                  {vmsSoftwareEntity && <MenuItem value={vmsSoftwareEntity.id.toString()}>{vmsSoftwareEntity.name}</MenuItem>}
                </Select>
              )}
            />
            {errors.vmsSoftwareId && <p className="text-red-600 text-xs">{errors.vmsSoftwareId.message}</p>}
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth error={!!errors.vmsVersionId} disabled={loadingVmsVersions || !watchedVmsSoftwareId}>
            <InputLabel id="vms-version-label">VMS Version*</InputLabel>
            <Controller
              name="vmsVersionId"
              control={control}
              render={({ field }) => (
                <Select labelId="vms-version-label" {...field} label="VMS Version*">
                  <MenuItem value="" disabled><em>{loadingVmsVersions ? 'Loading VMS versions...' : 'Select VMS Version'}</em></MenuItem>
                  {vmsVersions.map(v => <MenuItem key={v.id} value={v.id.toString()}>{v.version_number}</MenuItem>)}
                </Select>
              )}
            />
            {errors.vmsVersionId && <p className="text-red-600 text-xs">{errors.vmsVersionId.message}</p>}
          </FormControl>
        </Grid>

        <Grid item xs={12}>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Description (Optional)"
                multiline
                rows={3}
                fullWidth
                variant="outlined"
                error={!!errors.description}
                helperText={errors.description?.message}
              />
            )}
          />
        </Grid>

        <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button onClick={onCancel} color="inherit" variant="outlined" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={isSubmitting || loadingSoftware || loadingVaVersions || loadingVmsVersions}>
            {isSubmitting ? <CircularProgress size={24} /> : (initialData ? 'Update Compatibility' : 'Add Compatibility')}
          </Button>
        </Grid>
      </Grid>
    </form>
  );
};

export default VaVmsCompatibilityForm;
