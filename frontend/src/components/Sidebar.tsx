// src/components/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom'; // useLocation is not strictly needed here anymore unless for other logic
import {
  FileText,
  Package,
  Link as LinkIcon,
  MoreHorizontal,
  UploadCloud as UploadIcon, // <-- Import an icon for Upload
  Settings as SettingsIcon, // Icon for "Manage Versions"
  // LogIn as LogInIcon, // Keep if you want login/register here, but usually in Header
  // UserPlus as RegisterIcon // Keep if you want login/register here
} from 'lucide-react';
import { useAuth } from '../context/AuthContext'; // <-- Import useAuth hook

interface SidebarProps {
  collapsed: boolean;
}

interface NavItemConfig {
  path: string;
  label: string;
  icon: (isCollapsed: boolean) => React.ReactNode; // Icon can now depend on collapsed state
  requiresAuth?: boolean; 
  publicOnly?: boolean; 
  roles?: Array<'admin' | 'super_admin' | 'user'>; // Specify roles that can see this link
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const { isAuthenticated, role } = useAuth(); // <-- Get authentication status and role

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
    // Admin-specific links
    {
      path: '/admin/versions',
      label: 'Manage Versions',
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
    if (item.roles && (!isAuthenticated || (role && !item.roles.includes(role)))) {
      // Hide if item has role requirements, and user is not authenticated,
      // or user's role is not in the allowed roles for the item.
      return false;
    }
    return true; // Otherwise, show the item
  });

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-20' : 'w-64'
      } overflow-y-auto z-20`} // Added overflow-y-auto and z-index
    >
      <nav className="h-full flex flex-col py-4">
        <div className="space-y-1 px-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-3 py-3 text-sm sm:text-base rounded-md transition-colors group ${ // Added group for potential icon hover effects
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium' // Active state styling
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900' // Default and hover
                }`
              }
              title={collapsed ? item.label : undefined} // Show tooltip when collapsed
            >
              <span className={`${collapsed ? 'mx-auto' : 'mr-3'} text-gray-500 group-hover:text-gray-700 ${ ({isActive}: {isActive:boolean}) => isActive && 'text-blue-600'}`}> {/* Icon styling */}
                {item.icon(collapsed)}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;