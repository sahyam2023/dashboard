//src/components/Sidebar.tsx
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  FileText, 
  Package, 
  Link as LinkIcon, 
  MoreHorizontal 
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const location = useLocation();
  
  const navItems: NavItem[] = [
    { 
      path: '/documents', 
      label: 'Documents', 
      icon: <FileText size={collapsed ? 24 : 20} /> 
    },
    { 
      path: '/patches', 
      label: 'Patches', 
      icon: <Package size={collapsed ? 24 : 20} /> 
    },
    { 
      path: '/links', 
      label: 'Links', 
      icon: <LinkIcon size={collapsed ? 24 : 20} /> 
    },
    { 
      path: '/misc', 
      label: 'Misc', 
      icon: <MoreHorizontal size={collapsed ? 24 : 20} /> 
    }
  ];

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-20' : 'w-64'
      } overflow-hidden`}
    >
      <nav className="h-full flex flex-col py-4">
        <div className="space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 
                `flex items-center px-3 py-3 text-base rounded-md transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <span className={`${collapsed ? 'mx-auto' : 'mr-3'}`}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;