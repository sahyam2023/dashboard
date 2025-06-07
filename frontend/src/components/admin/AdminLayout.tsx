import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { FiShield, FiGitCommit, FiActivity } from 'react-icons/fi'; // Example icons

const AdminLayout: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: <FiShield className="mr-2" /> }, // Changed path and label
    { path: '/admin/versions', label: 'Versions Management', icon: <FiGitCommit className="mr-2" /> },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: <FiActivity className="mr-2" /> },
    // Add more admin links here as needed
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white p-4 space-y-4">
        <div className="text-2xl font-semibold flex items-center">
          <FiShield className="mr-2" /> Admin Panel
        </div>
        <nav>
          <ul>
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 ${
                    location.pathname === item.path ? 'bg-gray-900' : ''
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet /> {/* This is where the nested route component will render */}
      </main>
    </div>
  );
};

export default AdminLayout;
