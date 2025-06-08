// src/components/Sidebar.tsx
import React, { useState, useEffect } from 'react'; // Import React hooks
import { NavLink } from 'react-router-dom'; // useLocation is not strictly needed here anymore unless for other logic
import {
  FileText,
  Package,
  Link as LinkIcon,
  MoreHorizontal,
  UploadCloud as UploadIcon, // <-- Import an icon for Upload
  Settings as SettingsIcon, // Icon for "Manage Versions"
  Star as StarIcon, // Added for Favorites
  MessageSquare as ChatIcon // Added for Chat
  // LogIn as LogInIcon, 
  // UserPlus as RegisterIcon 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext'; 
import { Socket } from 'socket.io-client'; // Import Socket type

interface SidebarProps {
  collapsed: boolean;
  onToggleChat?: () => void; // Optional: if chat toggle is directly in sidebar
  socket: Socket | null; 
  socketConnected?: boolean; // Add socketConnected prop
}

interface NavItemConfig {
  path: string;
  label: string;
  icon: (isCollapsed: boolean) => React.ReactNode; // Icon can now depend on collapsed state
  requiresAuth?: boolean; 
  publicOnly?: boolean; 
  roles?: Array<'admin' | 'super_admin' | 'user'>; // Specify roles that can see this link
  action?: () => void; // For items that trigger actions instead of navigation
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggleChat, socket, socketConnected }) => {
  const { user, isAuthenticated } = useAuth(); // Updated to use user object
  type RoleType = 'admin' | 'super_admin' | 'user';
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
  console.log('Sidebar useEffect [socket, socketConnected]: Socket instance:', socket, 'Connected status prop:', socketConnected);

  if (socket && socketConnected) {
      const handleUnreadChatCount = (data: { count: number }) => {
        console.log('Sidebar: unread_chat_count event received, Data:', data);
        setUnreadChatCount(data.count);
      };

    console.log("Sidebar: Socket connected. Attaching 'unread_chat_count' listener.");
      socket.on('unread_chat_count', handleUnreadChatCount);

      return () => {
      console.log("Sidebar: Cleaning up 'unread_chat_count' listener.");
        socket.off('unread_chat_count', handleUnreadChatCount);
      };
    } else {
    console.log('Sidebar: Socket is null or not connected. Resetting unread count and ensuring no listener is active.');
      setUnreadChatCount(0);
    // If socket object exists but is not connected, and if listeners might persist,
    // explicitly turn them off. However, the structure ensures a new listener is added
    // only when connected, and the old one (from a previous connected state) would be
    // cleaned up by the previous return function. So, just resetting count here is likely sufficient.
    // If there was a scenario where `socket` exists but `socketConnected` becomes false,
    // the cleanup from the *previous* effect (when it was true) should handle `socket.off`.
    }
}, [socket, socketConnected]); // Added socketConnected to dependency array

  const navItems: NavItemConfig[] = [
    {
      path: '/documents',
      label: 'Documents',
      icon: (isCollapsed) => <FileText size={isCollapsed ? 24 : 20} />,
    },
    {
      path: '/patches',
      label: 'Patches',
      icon: (isCollapsed) => <Package size={isCollapsed ? 24 : 20} />,
    },
    {
      path: '/links',
      label: 'Links',
      icon: (isCollapsed) => <LinkIcon size={isCollapsed ? 24 : 20} />,
    },
    // { // NEW UPLOAD LINK CONFIG
    //   path: '/upload',
    //   label: 'Upload Files',
    //   icon: (isCollapsed) => <UploadIcon size={isCollapsed ? 24 : 20} />,
    //   requiresAuth: true, // Only show if authenticated
    // },
    {
      path: '/misc',
      label: 'Misc',
      icon: (isCollapsed) => <MoreHorizontal size={isCollapsed ? 24 : 20} />,
    },
    {
      path: '/favorites',
      label: 'Favorites',
      icon: (isCollapsed) => <StarIcon size={isCollapsed ? 24 : 20} />,
      requiresAuth: true,
    },
    {
      path: '#chat', // Placeholder path, action will be handled
      label: 'Chat',
      icon: (isCollapsed) => (
        <div className="relative">
          <ChatIcon size={isCollapsed ? 24 : 20} />
          {unreadChatCount > 0 && (
            <span
              className={`absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center border-2 border-lime-500 ${ // Temporary border
                isCollapsed ? 'transform scale-90 -translate-y-0.5' : '' // Slightly adjust badge when collapsed
              }`}
              style={{ lineHeight: '1' }}
            >
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </div>
      ),
      requiresAuth: true, // Assuming chat is for authenticated users
      action: onToggleChat,
    },
    // Admin-specific links
    {
      path: '/admin/dashboard',
      label: 'Management',
      icon: (isCollapsed) => <SettingsIcon size={isCollapsed ? 24 : 20} />,
      requiresAuth: true,
      roles: ['admin', 'super_admin'], // Only for admin and super_admin
    },
    // Example: Login/Register links in sidebar (though typically in header)
    // {
    //   path: '/login',
    //   label: 'Login',
    //   icon: (isCollapsed) => <LogInIcon size={isCollapsed ? 24 : 20} />,
    //   publicOnly: true, // Only show if NOT authenticated
    // },
  ];

  // Filter items based on authentication status and role
  const visibleNavItems = navItems.filter(item => {
    if (item.publicOnly && isAuthenticated) {
      return false; // Hide if public only and user is authenticated
    }
    if (item.requiresAuth && !isAuthenticated) {
      return false; // Hide if requires auth and user is not authenticated
    }
    if (
      item.roles !== undefined &&
      (!isAuthenticated || !user || (user.role && !item.roles.includes(user.role as RoleType)))
    ) {
      // Hide if item has role requirements, and user is not authenticated,
      // or user object is null, or user's role is not in the allowed roles for the item.
      return false;
    }
    return true; // Otherwise, show the item
  });

  return (
    <aside
      aria-label="Main sidebar" // Added aria-label
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-20' : 'w-64'
      } overflow-y-auto z-20 focus:outline-none`} // Added focus:outline-none as it's not meant to be directly focused
    >
      <nav className="h-full flex flex-col py-4">
        <div className="space-y-1 px-3">
          {visibleNavItems.map((item) => {
            if (item.action) {
              return (
                <button
                  key={item.label} // Use label for key if path is '#' or similar
                  onClick={item.action}
                  aria-label={item.label}
                  className={`w-full flex items-center px-3 py-3 text-sm sm:text-base rounded-md transition-colors group focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={`${collapsed ? 'mx-auto' : 'mr-3'} text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300`}>
                    {item.icon(collapsed)}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                aria-label={item.label} // Added aria-label for better accessibility
                className={({ isActive }) =>
                  `flex items-center px-3 py-3 text-sm sm:text-base rounded-md transition-colors group focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 dark:focus:ring-blue-400 ${ // Added focus states
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-700 text-blue-700 dark:text-blue-50 font-medium' // Active state styling
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100' // Default and hover
                  }`
                }
                title={collapsed ? item.label : undefined} // Show tooltip when collapsed, good for visual users
              >
                {/* Updated icon span for dark mode compatibility, conditional active class needs care */}
                <span className={`${collapsed ? 'mx-auto' : 'mr-3'} text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 ${ ({isActive}: {isActive:boolean}) => isActive ? 'text-blue-600 dark:text-blue-300' : ''}`}>
                  {item.icon(collapsed)}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;