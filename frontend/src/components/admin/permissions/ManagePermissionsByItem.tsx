import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Select, Input, Button, Table, Thead, Tbody, Tr, Th, Td, Checkbox,
  Spinner, Alert, AlertIcon, VStack, HStack, Text, useToast,
} from '@chakra-ui/react';
import {
  getPermissionsForItem,
  grantPermission,
  revokePermission,
  UserItemPermission, 
  listUsers, 
  User as UserType,
  // Import placeholder individual item fetchers
  getDocument, getPatch, getLink, getMiscFile,
} from '../../../services/api'; 
// Item types (Document, Patch, etc.) are imported from '../../../types' by api.ts, 
// so no direct import needed here if api.ts functions return them correctly.

const ITEM_TYPES = ['document', 'patch', 'link', 'misc_file'];

interface SelectedItemDisplay {
  id: number;
  name: string;
  type: string;
}

export const ManagePermissionsByItem: React.FC = () => {
  const toast = useToast();
  const [itemType, setItemType] = useState<string>(ITEM_TYPES[0]);
  const [itemIdSearch, setItemIdSearch] = useState<string>('');
  
  const [selectedItem, setSelectedItem] = useState<SelectedItemDisplay | null>(null);
  const [permissions, setPermissions] = useState<UserItemPermission[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(false); // General loading for table/item details
  const [error, setError] = useState<string | null>(null);

  const [grantingToUserIdString, setGrantingToUserIdString] = useState<string>(''); // For direct ID input
  const [grantCanView, setGrantCanView] = useState<boolean>(true);
  const [grantCanDownload, setGrantCanDownload] = useState<boolean>(true);
  const [isGranting, setIsGranting] = useState<boolean>(false); // Loading for the grant button

  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [searchedUsers, setSearchedUsers] = useState<UserType[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState<boolean>(false);
  const [selectedUserForGrant, setSelectedUserForGrant] = useState<UserType | null>(null);

  const fetchItemDetailsAndPermissions = useCallback(async () => {
    if (!itemIdSearch || !itemType) {
      toast({ title: "Please select an item type and enter an Item ID.", status: "warning", duration: 3000, isClosable: true });
      return;
    }
    const numericItemId = parseInt(itemIdSearch, 10);
    if (isNaN(numericItemId) || numericItemId <= 0) {
        toast({ title: "Item ID must be a positive number.", status: "error", duration: 3000, isClosable: true });
        return;
    }

    setIsLoading(true);
    setError(null);
    setPermissions([]); 
    setSelectedItem(null); 

    try {
      let itemName = `Item ID: ${numericItemId}`; // Default name
      // Fetch actual item details to get its name
      try {
        if (itemType === 'document') {
          const item = await getDocument(numericItemId); itemName = item?.doc_name || itemName;
        } else if (itemType === 'patch') {
          const item = await getPatch(numericItemId); itemName = item?.patch_name || itemName;
        } else if (itemType === 'link') {
          const item = await getLink(numericItemId); itemName = item?.title || itemName;
        } else if (itemType === 'misc_file') {
          const item = await getMiscFile(numericItemId); itemName = item?.user_provided_title || item?.original_filename || itemName;
        }
      } catch (itemFetchError: any) {
        console.warn(`Could not fetch details for ${itemType} ID ${numericItemId}: ${itemFetchError.message}`);
        // Continue with default name if item detail fetch fails, but permissions might still load.
      }
      
      const fetchedPermissions = await getPermissionsForItem(itemType, numericItemId);
      setPermissions(fetchedPermissions);
      setSelectedItem({ id: numericItemId, name: itemName, type: itemType }); 
    } catch (err: any) {
      const errorMsg = err.response?.data?.msg || err.message || `Failed to fetch details or permissions for ${itemType} ID ${numericItemId}`;
      setError(errorMsg);
      toast({ title: "Error", description: errorMsg, status: "error", duration: 5000, isClosable: true });
      setPermissions([]);
      setSelectedItem(null);
    } finally {
      setIsLoading(false);
    }
  }, [itemType, itemIdSearch, toast]);

  const handlePermissionToggle = async (perm: UserItemPermission, fieldToToggle: 'can_view' | 'can_download') => {
    if (!selectedItem) return;
    
    // Optimistically update UI (optional, or use a specific loading state for the row/checkbox)
    // For simplicity, we'll use a general isLoading for the table section during updates.
    setIsLoading(true); 
    setError(null);

    const newCanView = fieldToToggle === 'can_view' ? !perm.can_view : perm.can_view;
    const newCanDownload = fieldToToggle === 'can_download' ? !perm.can_download : perm.can_download;
    
    try {
      await grantPermission(perm.user_id, selectedItem.id, selectedItem.type, newCanView, newCanDownload);
      toast({ title: "Permission updated successfully.", status: "success", duration: 3000, isClosable: true });
      fetchItemDetailsAndPermissions(); // Refresh permissions list and potentially item details
    } catch (err: any) {
      setError(err.message || "Failed to update permission.");
      toast({ title: "Error updating permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
      // Optionally, revert optimistic UI update here if implemented
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchUsers = async () => {
    if (!userSearchTerm.trim()) {
        setSearchedUsers([]);
        setSelectedUserForGrant(null);
        setGrantingToUserIdString(''); // Clear direct ID input when search term is empty
        return;
    }
    setIsSearchingUsers(true);
    try {
        const allUsersResponse = await listUsers(1, 100); // Fetch a reasonable number for dropdown
        const filteredUsers = allUsersResponse.users.filter(user => 
            user.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
            (user.email && user.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
        );
        setSearchedUsers(filteredUsers);
        if (filteredUsers.length === 0) {
            toast({ title: "No users found matching your search.", status: "info", duration: 3000, isClosable: true });
        }
    } catch (err: any) {
        toast({ title: "Error searching users.", description: err.message, status: "error", duration: 5000, isClosable: true });
        setSearchedUsers([]);
    } finally {
        setIsSearchingUsers(false);
    }
  };
  
  const handleNewUserGrant = async () => {
    let userIdToGrant: number | null = null;

    if (selectedUserForGrant) {
        userIdToGrant = selectedUserForGrant.id;
    } else if (grantingToUserIdString.trim()) {
        const parsedId = parseInt(grantingToUserIdString, 10);
        if (!isNaN(parsedId) && parsedId > 0) {
            userIdToGrant = parsedId;
        }
    }

    if (!userIdToGrant) {
        toast({ title: "Invalid User ID or no user selected/entered.", status: "error", duration: 3000, isClosable: true });
        return;
    }
    if (!selectedItem) {
        toast({ title: "No item selected to grant permissions for.", status: "warning", duration: 3000, isClosable: true });
        return;
    }
    
    setIsGranting(true);
    setError(null);
    try {
      await grantPermission(userIdToGrant, selectedItem.id, selectedItem.type, grantCanView, grantCanDownload);
      toast({ title: "Permission granted successfully.", status: "success", duration: 3000, isClosable: true });
      fetchItemDetailsAndPermissions(); 
      setGrantingToUserIdString(''); 
      setUserSearchTerm('');
      setSearchedUsers([]);
      setSelectedUserForGrant(null);
      setGrantCanView(true); 
      setGrantCanDownload(true);
    } catch (err: any) {
      setError(err.message || "Failed to grant new permission.");
      toast({ title: "Error granting new permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokePermission = async (userIdToRevoke: number) => {
    if (!selectedItem) return;
    setIsLoading(true); // Use general loading for table updates
    setError(null);
    try {
      await revokePermission(userIdToRevoke, selectedItem.id, selectedItem.type);
      toast({ title: "Permission revoked successfully.", status: "success", duration: 3000, isClosable: true });
      fetchItemDetailsAndPermissions(); // Refresh list
    } catch (err: any) {
      setError(err.message || "Failed to revoke permission.");
      toast({ title: "Error revoking permission.", description: err.message, status: "error", duration: 5000, isClosable: true });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <VStack spacing={4} align="stretch">
        <Heading size="md" mb={2}>Manage Permissions by Item</Heading>
        <HStack spacing={4}>
          <Select 
            placeholder="Select Item Type" 
            value={itemType} 
            onChange={(e) => {
              setItemType(e.target.value);
              setSelectedItem(null); 
              setPermissions([]);
              setItemIdSearch(''); // Clear item ID search on type change
            }}
            width="250px"
          >
            {ITEM_TYPES.map(type => (
              <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
            ))}
          </Select>
          <Input 
            placeholder="Enter Item ID" 
            value={itemIdSearch} 
            onChange={(e) => setItemIdSearch(e.target.value)}
            width="150px"
            type="number"
          />
          <Button onClick={fetchItemDetailsAndPermissions} isLoading={isLoading && !selectedItem && !error} colorScheme="teal">Load Permissions</Button>
        </HStack>

        {error && !isLoading && <Alert status="error" mt={2}><AlertIcon />{error}</Alert>}
        
        {isLoading && !selectedItem && !error && <Spinner mt={2} />}

        {selectedItem && (
          <Box mt={4}>
            <Heading size="sm" mb={3}>Permissions for: <Text as="span" fontWeight="bold">{selectedItem.name}</Text> ({selectedItem.type} ID: {selectedItem.id})</Heading>
            {(isLoading && permissions.length === 0) && <Spinner size="sm" />}
            {!isLoading && permissions.length === 0 && <Text fontSize="sm" color="gray.500">No specific permissions found for this item. Default access applies to all users unless a rule is added.</Text>}
            
            {permissions.length > 0 && (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th>User ID</Th>
                    <Th>Username</Th>
                    <Th>Can View</Th>
                    <Th>Can Download</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {permissions.map(perm => (
                    <Tr key={`${perm.user_id}-${perm.item_type}-${perm.item_id}`}> {/* More robust key */}
                      <Td>{perm.user_id}</Td>
                      <Td>{perm.username || 'N/A'}</Td>
                      <Td>
                        <Checkbox 
                          isChecked={perm.can_view} 
                          onChange={() => handlePermissionToggle(perm, 'can_view')}
                          isDisabled={isLoading}
                        />
                      </Td>
                      <Td>
                        <Checkbox 
                          isChecked={perm.can_download} 
                          onChange={() => handlePermissionToggle(perm, 'can_download')}
                          isDisabled={isLoading}
                        />
                      </Td>
                      <Td>
                        <Button size="xs" colorScheme="red" variant="outline" onClick={() => handleRevokePermission(perm.user_id)} isLoading={isLoading}>Revoke</Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <Box mt={6} p={4} borderWidth="1px" borderRadius="md" shadow="sm">
              <Heading size="sm" mb={4}>Grant New Permission</Heading>
              <VStack spacing={4} align="stretch">
                <HStack>
                    <Input 
                      placeholder="Search username or email" 
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      width="220px"
                    />
                    <Button onClick={handleSearchUsers} isLoading={isSearchingUsers} size="sm" colorScheme="gray">Search Users</Button>
                </HStack>
                {(searchedUsers.length > 0 || selectedUserForGrant) && (
                    <Select 
                        placeholder="Select user from search results" 
                        onChange={(e) => {
                            const userIdVal = e.target.value;
                            if (userIdVal) {
                                const user = searchedUsers.find(u => u.id.toString() === userIdVal);
                                setSelectedUserForGrant(user || null);
                                setGrantingToUserIdString(userIdVal); 
                            } else {
                                setSelectedUserForGrant(null);
                                setGrantingToUserIdString('');
                            }
                        }}
                        value={selectedUserForGrant?.id.toString() || ''}
                        mb={2}
                    >
                        {searchedUsers.map(user => (
                            <option key={user.id} value={user.id.toString()}>{user.username} (ID: {user.id})</option>
                        ))}
                    </Select>
                )}
                 <Input 
                    placeholder="Or enter User ID directly" 
                    value={grantingToUserIdString}
                    onChange={(e) => {
                        setGrantingToUserIdString(e.target.value);
                        setSelectedUserForGrant(null); 
                    }}
                    width="220px"
                    type="number"
                    mb={selectedUserForGrant || searchedUsers.length > 0 ? 2 : 0}
                />
                <HStack spacing={5}>
                    <Checkbox isChecked={grantCanView} onChange={(e) => setGrantCanView(e.target.checked)}>Can View</Checkbox>
                    <Checkbox isChecked={grantCanDownload} onChange={(e) => setGrantCanDownload(e.target.checked)}>Can Download</Checkbox>
                </HStack>
                <Button 
                    onClick={handleNewUserGrant} 
                    isLoading={isGranting} 
                    colorScheme="green"
                    size="sm"
                    mt={2}
                    disabled={!selectedItem || (!selectedUserForGrant && !grantingToUserIdString.trim())}
                >
                    Grant Permission
                </Button>
              </VStack>
            </Box>
          </Box>
        )}
      </VStack>
    </Box>
  );
};
