
import React, { useState, useEffect, useCallback } from 'react';
import type { UsageLimits } from '../types';
import { SpinnerIcon, ShieldCheckIcon, UserGroupIcon, ClipboardDocumentListIcon } from './icons';
import { getAllUsageLimits, setTestModeStatus, updateUsageLimits, getAdminStats } from '../services/configService';
import { useAuth } from '../auth/AuthContext';
import UserManagementTab from './UserManagement';

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
    isMockUser: boolean;
}

type AdminTab = 'dashboard' | 'settings' | 'users';

const TabButton: React.FC<{name: string, tabId: AdminTab, activeTab: AdminTab, setActiveTab: (tab: AdminTab) => void}> = ({ name, tabId, activeTab, setActiveTab }) => {
    const isActive = activeTab === tabId;
    return (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`py-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 ${
                isActive
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
            }`}
        >
            {name}
        </button>
    );
};

const DashboardTab: React.FC = () => {
    const { isTestMode, refreshTestMode } = useAuth();
    const [localTestMode, setLocalTestMode] = useState(isTestMode);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<{ total_users: number; total_test_runs: number } | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        setLocalTestMode(isTestMode);
    }, [isTestMode]);

    useEffect(() => {
        const loadStats = async () => {
            setLoadingStats(true);
            const data = await getAdminStats();
            setStats(data);
            setLoadingStats(false);
        };
        loadStats();
    }, []);

    const handleTestModeToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStatus = e.target.checked;
        setLocalTestMode(newStatus); // Optimistic UI update
        setIsSaving(true);
        setError(null);
        try {
            await setTestModeStatus(newStatus);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to save Test Mode status.';
            setError(errorMessage);
        } finally {
            // Always refresh from the DB to ensure UI is consistent with the backend state.
            // If the call succeeded, this fetches the new value.
            // If it failed, this fetches the old value, reverting the optimistic change.
            await refreshTestMode();
            setIsSaving(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white">Dashboard</h3>
             {error && <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 text-sm rounded-md">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard 
                    icon={<UserGroupIcon className="w-6 h-6"/>} 
                    title="Total Users" 
                    value={loadingStats ? "..." : (stats?.total_users.toLocaleString() ?? "N/A")} 
                    description={stats ? "Registered accounts on the platform." : "Requires updated DB script."} 
                />
                <StatCard 
                    icon={<ClipboardDocumentListIcon className="w-6 h-6"/>} 
                    title="Total Test Runs" 
                    value={loadingStats ? "..." : (stats?.total_test_runs.toLocaleString() ?? "N/A")} 
                    description={stats ? "Performance tests completed globally." : "Requires updated DB script."} 
                />
            </div>
             <div>
                <h4 className="text-md font-semibold text-white mb-2">Application Test Mode</h4>
                 <label htmlFor="test-mode-toggle" className="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
                    <div className="relative">
                        <input
                            type="checkbox"
                            id="test-mode-toggle"
                            className="sr-only"
                            checked={localTestMode}
                            onChange={handleTestModeToggle}
                            disabled={isSaving}
                        />
                        <div className={`block w-14 h-8 rounded-full transition ${localTestMode ? 'bg-blue-600' : 'bg-gray-600'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform ${localTestMode ? 'translate-x-6' : ''}`}></div>
                    </div>
                    <div className="ml-4">
                        <span className="text-sm font-medium text-white">Enable Test Mode</span>
                        <p className="text-xs text-gray-400">Allows any user to bypass the login screen.</p>
                    </div>
                     {isSaving && <SpinnerIcon className="w-5 h-5 animate-spin text-gray-400 ml-auto" />}
                </label>
            </div>
        </div>
    );
};

const SettingsTab: React.FC<{ isMockUser: boolean }> = ({ isMockUser }) => {
    const [limits, setLimits] = useState<UsageLimits[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState<{[key: string]: boolean}>({});
    const [error, setError] = useState<string | null>(null);

     useEffect(() => {
        const fetchLimits = async () => {
            setIsLoading(true);
            setError(null);

            if (isMockUser) {
                // In test mode, we don't have a real session to fetch data.
                // Display hardcoded defaults to keep the UI consistent.
                setLimits([
                    { role: 'admin', max_users: 10000, max_duration: 600, max_ramp_up: 300, min_pacing: 0 },
                    { role: 'user', max_users: 100, max_duration: 120, max_ramp_up: 60, min_pacing: 500 },
                ]);
                setIsLoading(false);
                return;
            }

            try {
                const allLimits = await getAllUsageLimits();
                allLimits.sort((a, b) => {
                    if (a.role === 'admin') return -1; if (b.role === 'admin') return 1;
                    if (a.role === 'user') return -1; if (b.role === 'user') return 1;
                    return 0;
                });
                setLimits(allLimits);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load usage limits.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLimits();
    }, [isMockUser]);

    const handleLimitChange = (role: string, field: keyof UsageLimits, value: string) => {
        const numericValue = value === '' ? 0 : parseInt(value, 10);
        if (isNaN(numericValue)) return;
        setLimits(prev => prev.map(l => l.role === role ? { ...l, [field]: numericValue } : l));
    };

    const handleSaveLimits = async (role: string) => {
        const limitToSave = limits.find(l => l.role === role);
        if (!limitToSave) return;
        
        setIsSaving(prev => ({ ...prev, [role]: true }));
        setError(null);
        try {
            await updateUsageLimits(limitToSave);
        } catch (err) {
             setError(err instanceof Error ? err.message : `Failed to save limits for ${role}.`);
        } finally {
            setIsSaving(prev => ({ ...prev, [role]: false }));
        }
    };
    
     if (isLoading) {
        return <div className="flex items-center justify-center h-full"><SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" /></div>;
    }

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white">Usage Limits</h3>
            <p className="text-sm text-gray-400">Configure the maximum resource allocation for different user roles. These limits prevent abuse and control costs.</p>
             {error && <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 text-sm rounded-md">{error}</div>}
             <div className="space-y-4">
                {limits.map(limit => (
                    <div key={limit.role} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <h4 className="font-bold text-lg capitalize mb-3 text-blue-300">{limit.role} Role</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <LimitInput label="Max Users" id={`max_users_${limit.role}`} value={limit.max_users} onChange={e => handleLimitChange(limit.role, 'max_users', e.target.value)} disabled={isMockUser} />
                            <LimitInput label="Max Duration (s)" id={`max_duration_${limit.role}`} value={limit.max_duration} onChange={e => handleLimitChange(limit.role, 'max_duration', e.target.value)} disabled={isMockUser} />
                            <LimitInput label="Max Ramp Up (s)" id={`max_ramp_up_${limit.role}`} value={limit.max_ramp_up} onChange={e => handleLimitChange(limit.role, 'max_ramp_up', e.target.value)} disabled={isMockUser} />
                            <LimitInput label="Min Pacing (ms)" id={`min_pacing_${limit.role}`} value={limit.min_pacing} onChange={e => handleLimitChange(limit.role, 'min_pacing', e.target.value)} disabled={isMockUser} />
                        </div>
                        <div className="mt-4 text-right">
                            <button onClick={() => handleSaveLimits(limit.role)} disabled={isSaving[limit.role] || isMockUser} className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50 min-w-[80px]">
                                {isSaving[limit.role] ? <SpinnerIcon className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, isMockUser }) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
    
    return (
        <>
            <div 
                className={`fixed inset-0 bg-gray-950/70 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <aside className={`fixed top-0 right-0 h-full w-full max-w-4xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <div className="flex items-center space-x-3">
                            <ShieldCheckIcon className="w-6 h-6 text-blue-400" />
                            <h2 className="text-lg font-bold text-white">Admin Panel</h2>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </header>

                    <nav className="flex-shrink-0 border-b border-gray-700 px-6">
                        <div className="flex space-x-6">
                            <TabButton name="Dashboard" tabId="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} />
                            <TabButton name="Settings" tabId="settings" activeTab={activeTab} setActiveTab={setActiveTab} />
                            <TabButton name="User Management" tabId="users" activeTab={activeTab} setActiveTab={setActiveTab} />
                        </div>
                    </nav>

                    <div className="flex-grow overflow-y-auto p-6 bg-gray-950/50">
                       {isOpen && (
                           <>
                                {activeTab === 'dashboard' && <DashboardTab />}
                                {activeTab === 'settings' && <SettingsTab isMockUser={isMockUser} />}
                                {activeTab === 'users' && <UserManagementTab isMockUser={isMockUser} />}
                           </>
                       )}
                    </div>
                </div>
            </aside>
        </>
    );
};

// --- Helper & Sub-components ---

const StatCard: React.FC<{icon: React.ReactNode, title: string, value: string, description: string}> = ({icon, title, value, description}) => (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-start space-x-4">
        <div className="bg-gray-700 p-3 rounded-lg text-blue-400">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500">{description}</p>
        </div>
    </div>
);

const LimitInput: React.FC<{label: string, id: string, value: number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, disabled?: boolean}> = ({ label, id, value, onChange, disabled }) => (
    <div>
        <label htmlFor={id} className="block mb-1 text-gray-400">{label}</label>
        <input type="number" id={id} value={value} onChange={onChange} disabled={disabled} className="w-full bg-gray-700 border-gray-600 rounded-md px-2 py-1.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed" />
    </div>
);

export default AdminPanel;
