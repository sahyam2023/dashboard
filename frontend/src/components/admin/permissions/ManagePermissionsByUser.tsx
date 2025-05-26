import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Select, Input, Button, Table, Thead, Tbody, Tr, Th, Td, Checkbox,
  Spinner, Alert, AlertIcon, VStack, HStack, Text, useToast, Flex,
} from '@chakra-ui/react';
import {
  getPermissionsForUser,
  grantPermission,
  revokePermission,
  listUsers,
  UserItemPermission,
  User as UserType,
  getDocument, getPatch, getLink, getMiscFile, // Placeholder item fetchers
} from '../../../services/api';

const ITEM_TYPES_FOR_FILTER = ['all', 'document', 'patch', 'link', 'misc_file'];
const ITEM_TYPES_FOR_GRANT = ['document', 'patch', 'link', 'misc_file'];

interface UserPermissionDisplay extends UserItemPermission {
  itemName?: string; // To store fetched item name
}

export const ManagePermissionsByUser: React.FC = () => {
  const toast = useToast();

  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [searchedUsers, setSearchedUsers] = useState<UserType[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  const [itemTypeFilter, setItemTypeFilter] = useState<string>(ITEM_TYPES_FOR_FILTER[0]);
  const [userPermissions, setUserPermissions] = useState<UserPermissionDisplay[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState<boolean>(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [itemDetailsCache, setItemDetailsCache] = useState<Record<string, string>>({});

  const [grantItemType, setGrantItemType] = useState<string>(ITEM_TYPES_FOR_GRANT[0]);
  const [grantItemId, setGrantItemId] = useState<string>('');
  const [grantCanView, setGrantCanView] = useState<boolean>(true);
  const [grantCanDownload, setGrantCanDownload] = useState<boolean>(true);
  const [isGrantingNew, setIsGrantingNew] = useState<boolean>(false);

  const handleUserSearch = async () => {
    if (!userSearchTerm.trim()) {
      setSearchedUsers([]);
      setSelectedUser(null);
      setUserPermissions([]);
      return;
    }
    setIsSearchingUsers(true);
    setPermissionsError(null);
    try {
      const response = await listUsers(1, 50, userSearchTerm, 'username'); 
      const filtered = response.users.filter(u => 
        u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
      );
      setSearchedUsers(filtered);
      if (filtered.length === 0) {
        toast({ title: "No users found.", status: "info", duration: 3000, isClosable: true });
      }
    } catch (err: any) {
      toast({ title: "Error searching users", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      setIsSearchingUsers(false);
    }
  };
  
  const fetchItemName = useCallback(async (itemId: number, itemType: string): Promise<string> => {
    const cacheKey = `${itemType}-${itemId}`;
    if (itemDetailsCache[cacheKey]) {
      return itemDetailsCache[cacheKey];
    }
    try {
      let name = `Item ID: ${itemId}`; // Default/fallback name
      // These API calls are placeholders in api.ts for now
      if (itemType === 'document') { const item = await getDocument(itemId); name = item?.doc_name || name; }
      else if (itemType === 'patch') { const item = await getPatch(itemId); name = item?.patch_name || name; }
      else if (itemType === 'link') { const item = await getLink(itemId); name = item?.title || name; }
      else if (itemType === 'misc_file') { const item = await getMiscFile(itemId); name = item?.user_provided_title || item?.original_filename || name; }
      
      setItemDetailsCache(prev => ({ ...prev, [cacheKey]: name }));
      return name;
    } catch (error: any) {
      console.warn(`Failed to fetch name for ${itemType} ID ${itemId}: ${error.message}`);
      return `Item ID: ${itemId}`; // Fallback if API call fails
    }
  }, [itemDetailsCache]);

  const fetchUserPermissions = useCallback(async () => {
    if (!selectedUser) return;
    setIsLoadingPermissions(true);
    setPermissionsError(null);
    try {
      const filter = itemTypeFilter === 'all' ? undefined : itemTypeFilter;
      const perms = await getPermissionsForUser(selectedUser.id, filter);
      
      const permsWithNames: UserPermissionDisplay[] = await Promise.all(
        perms.map(async (perm) => ({
          ...perm,
          itemName: await fetchItemName(perm.item_id, perm.item_type),
        }))
      );
      setUserPermissions(permsWithNames);

    } catch (err: any) {
      setPermissionsError(err.message || `Failed to fetch permissions for user ${selectedUser.username}`);
      setUserPermissions([]);
      toast({ title: "Error fetching permissions", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [selectedUser, itemTypeFilter, toast, fetchItemName]);

  useEffect(() => {
    if (selectedUser) {
      fetchUserPermissions();
    } else {
      setUserPermissions([]);
    }
  }, [selectedUser, itemTypeFilter, fetchUserPermissions]);

  const handlePermissionToggle = async (perm: UserItemPermission, fieldToToggle: 'can_view' | 'can_download') => {
    if (!selectedUser) return;
    
    const newCanView = fieldToToggle === 'can_view' ? !perm.can_view : perm.can_view;
    const newCanDownload = fieldToToggle === 'can_download' ? !perm.can_download : perm.can_download;
    
    // To provide instant feedback, we can update the state optimistically
    // This is complex if there are many updates; for now, simple loading state for the table.
    setIsLoadingPermissions(true); 
    try {
      await grantPermission(selectedUser.id, perm.item_id, perm.item_type, newCanView, newCanDownload);
      toast({ title: "Permission updated.", status: "success", duration: 2000, isClosable: true });
      await fetchUserPermissions(); // Re-fetch to confirm and get latest state
    } catch (err: any) {
      toast({ title: "Error updating permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
      // If optimistic update was done, revert here.
    } finally {
       // setIsLoadingPermissions(false); // Already handled by fetchUserPermissions
    }
  };

  const handleRevoke = async (itemIdToRevoke: number, itemTypeToRevoke: string) => {
    if (!selectedUser) return;
    setIsLoadingPermissions(true);
    try {
      await revokePermission(selectedUser.id, itemIdToRevoke, itemTypeToRevoke);
      toast({ title: "Permission revoked.", status: "success", duration: 2000, isClosable: true });
      await fetchUserPermissions(); // Refresh
    } catch (err: any) {
      toast({ title: "Error revoking permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      // setIsLoadingPermissions(false); // Already handled by fetchUserPermissions
    }
  };

  const handleGrantNewPermission = async () => {
    if (!selectedUser) {
      toast({ title: "Please select a user first.", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    const numericGrantItemId = parseInt(grantItemId, 10);
    if (isNaN(numericGrantItemId) || numericGrantItemId <= 0) {
      toast({ title: "Item ID for grant must be a positive number.", status: "error", duration: 3000, isClosable: true });
      return;
    }

    setIsGrantingNew(true);
    try {
      await grantPermission(selectedUser.id, numericGrantItemId, grantItemType, grantCanView, grantCanDownload);
      toast({ title: "Permission granted successfully.", status: "success", duration: 3000, isClosable: true });
      await fetchUserPermissions(); // Refresh list
      setGrantItemId('');
      setGrantCanView(true);
      setGrantCanDownload(true);
    } catch (err: any) {
      toast({ title: "Error granting permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      setIsGrantingNew(false);
    }
  };

  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <VStack spacing={6} align="stretch">
        <Heading size="md" mb={2}>Manage Permissions by User</Heading>
        
        <Box>
          <HStack spacing={3} mb={2}>
            <Input 
              placeholder="Search username or email"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              width="300px"
            />
            <Button onClick={handleUserSearch} isLoading={isSearchingUsers} colorScheme="blue">Search Users</Button>
          </HStack>
          {isSearchingUsers && searchedUsers.length === 0 && <Spinner size="sm"/>}
          {searchedUsers.length > 0 && (
            <Select 
              placeholder="Select a user from search results" 
              onChange={(e) => {
                const userIdVal = e.target.value;
                if (userIdVal) {
                    const user = searchedUsers.find(u => u.id.toString() === userIdVal);
                    setSelectedUser(user || null);
                } else {
                    setSelectedUser(null);
                }
              }}
              mb={selectedUser ? 2 : 0}
              value={selectedUser?.id.toString() || ""}
            >
              {searchedUsers.map(user => (
                <option key={user.id} value={user.id.toString()}>{user.username} (ID: {user.id})</option>
              ))}
            </Select>
          )}
          {selectedUser && <Text mt={2} fontSize="lg" fontWeight="bold">Selected User: {selectedUser.username} (ID: {selectedUser.id})</Text>}
        </Box>

        {selectedUser && (
          <>
            <Box>
              <HStack mb={3} spacing={3} align="center">
                <Heading size="sm">Permissions for {selectedUser.username}</Heading>
                <Select 
                  size="sm"
                  width="200px"
                  value={itemTypeFilter}
                  onChange={(e) => setItemTypeFilter(e.target.value)}
                  isDisabled={isLoadingPermissions}
                >
                  {ITEM_TYPES_FOR_FILTER.map(type => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </Select>
              </HStack>
              {isLoadingPermissions && <Spinner />}
              {permissionsError && <Alert status="error" mt={2}><AlertIcon />{permissionsError}</Alert>}
              {!isLoadingPermissions && !permissionsError && userPermissions.length === 0 && (
                <Text mt={2}>No specific permissions found for this user {itemTypeFilter !== 'all' ? `and item type '${itemTypeFilter}'` : ''}. Default access may apply.</Text>
              )}
              {!isLoadingPermissions && userPermissions.length > 0 && (
                <Table variant="simple" size="sm" mt={2}>
                  <Thead>
                    <Tr>
                      <Th>Item Type</Th>
                      <Th>Item ID/Name</Th>
                      <Th>Can View</Th>
                      <Th>Can Download</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {userPermissions.map(perm => (
                      <Tr key={`${perm.item_type}-${perm.item_id}`}>
                        <Td>{perm.item_type}</Td>
                        <Td>{perm.itemName || `ID: ${perm.item_id}`}</Td>
                        <Td>
                          <Checkbox 
                            isChecked={perm.can_view} 
                            onChange={() => handlePermissionToggle(perm, 'can_view')}
                            isDisabled={isLoadingPermissions}
                          />
                        </Td>
                        <Td>
                          <Checkbox 
                            isChecked={perm.can_download} 
                            onChange={() => handlePermissionToggle(perm, 'can_download')}
                            isDisabled={isLoadingPermissions}
                          />
                        </Td>
                        <Td>
                          <Button size="xs" colorScheme="red" variant="outline" onClick={() => handleRevoke(perm.item_id, perm.item_type)} isLoading={isLoadingPermissions}>Revoke</Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Box>

            <Box mt={6} p={4} borderWidth="1px" borderRadius="md" shadow="sm">
              <Heading size="sm" mb={4}>Grant New Permission to {selectedUser.username}</Heading>
              <VStack spacing={4} align="stretch">
                <HStack spacing={3}>
                  <Select 
                    value={grantItemType} 
                    onChange={(e) => setGrantItemType(e.target.value)} 
                    width="200px"
                    size="sm"
                  >
                    {ITEM_TYPES_FOR_GRANT.map(type => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </Select>
                  <Input 
                    placeholder="Item ID" 
                    value={grantItemId} 
                    onChange={(e) => setGrantItemId(e.target.value)} 
                    type="number"
                    width="120px"
                    size="sm"
                  />
                </HStack>
                <HStack spacing={5}>
                  <Checkbox isChecked={grantCanView} onChange={(e) => setGrantCanView(e.target.checked)}>Can View</Checkbox>
                  <Checkbox isChecked={grantCanDownload} onChange={(e) => setGrantCanDownload(e.target.checked)}>Can Download</Checkbox>
                </HStack>
                <Button 
                  onClick={handleGrantNewPermission} 
                  isLoading={isGrantingNew} 
                  colorScheme="green"
                  size="sm"
                  alignSelf="flex-start"
                  disabled={!grantItemId.trim()}
                >
                  Grant Permission
                </Button>
              </VStack>
            </Box>
          </>
        )}
      </VStack>
    </Box>
  );
};
