import React, { useState, useEffect, useRef } from 'react';
import { AppUser, TestStatus, SystemStatusState, SystemCheck, CheckStatus } from '../types';
import { ArrowRightOnRectangleIcon, UserCircleIcon, ShieldCheckIcon, SpinnerIcon, DatabaseIcon, SparklesIcon, DocumentTextIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, ResetIcon, QuestionMarkCircleIcon, Cog6ToothIcon } from './icons';
import { useDebugActions } from './DebugContext';

interface HeaderProps {
    title: string;
    setTitle: (newTitle: string) => void;
    status: TestStatus;
    elapsedTime: number;
    shutdownRemainingTime: number | null;
    customLogo: string | null;
    onLogoChange: (logoDataUrl: string) => void;
    onToggleHistory: () => void;
    isHistoryOpen: boolean;
    onToggleAdmin: () => void;
    isAdminOpen: boolean;
    onToggleHelp: () => void;
    isHelpOpen: boolean;
    onToggleAccountSettings: () => void;
    user: AppUser | null;
    logout: ((actionId: string) => Promise<any>) | null;
    systemStatus: SystemStatusState;
    onRerunChecks: () => void;
}

const formatTime = (seconds: number) => {
    const flooredSeconds = Math.floor(seconds);
    const mins = Math.floor(flooredSeconds / 60).toString().padStart(2, '0');
    const secs = (flooredSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};


const StatusIndicatorIcon: React.FC<{ check: SystemCheck }> = ({ check }) => {
    const statusConfig: { [key in CheckStatus]: { color: string; icon: React.ReactNode } } = {
        PENDING: { color: 'text-gray-500 animate-pulse', icon: <SpinnerIcon className="w-4 h-4" /> },
        OK: { color: 'text-green-500', icon: <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div> },
        WARN: { color: 'text-yellow-500', icon: <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div> },
        ERROR: { color: 'text-red-500', icon: <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div> },
    };
    
    const { icon } = statusConfig[check.status];
    return <div className="flex items-center justify-center w-4 h-4" title={`${check.name}: ${check.status}`}>{icon}</div>;
};

const SystemStatusIndicator: React.FC<{ status: SystemStatusState; onRerun: () => void; }> = ({ status, onRerun }) => {
    const [isRerunning, setIsRerunning] = useState(false);

    const handleRerun = async () => {
        setIsRerunning(true);
        await onRerun();
        // Keep spinner for a short duration for better UX
        setTimeout(() => setIsRerunning(false), 500);
    };

    const overallStatus = status.some(s => s.status === 'ERROR') ? 'ERROR'
        : status.some(s => s.status === 'WARN') ? 'WARN'
        : status.some(s => s.status === 'PENDING') ? 'PENDING'
        : 'OK';
        
    const checkIcons: { [key in SystemCheck['name']]: React.ReactNode } = {
        'Supabase DB': <DatabaseIcon className="w-5 h-5" />,
        'Gemini API': <SparklesIcon className="w-5 h-5" />,
        'API Spec': <DocumentTextIcon className="w-5 h-5" />,
    };
    
    const statusIcons: { [key in CheckStatus]: React.ReactNode } = {
        PENDING: <SpinnerIcon className="w-5 h-5 text-gray-400 animate-spin" />,
        OK: <CheckCircleIcon className="w-5 h-5 text-green-400" />,
        WARN: <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />,
        ERROR: <XCircleIcon className="w-5 h-5 text-red-400" />,
    };

    return (
        <div className="relative group">
            <div className="flex items-center space-x-1.5 bg-gray-800/50 border border-gray-700 rounded-full px-2 py-1">
                {status.map(check => <StatusIndicatorIcon key={check.name} check={check} />)}
            </div>
            
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 p-4 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50 pointer-events-none group-hover:pointer-events-auto">
                <div className="absolute bg-gray-800 border-t border-l border-gray-600 h-2 w-2 left-1/2 -translate-x-1/2 -top-1.5 rotate-45"></div>
                <h4 className="font-bold text-white mb-3">System Status</h4>
                <ul className="space-y-3">
                    {status.map(check => (
                        <li key={check.name}>
                             <div className="flex items-center justify-between">
                                 <div className="flex items-center space-x-2 text-sm font-medium text-gray-300">
                                     {checkIcons[check.name]}
                                     <span>{check.name}</span>
                                 </div>
                                 {statusIcons[check.status]}
                             </div>
                             <p className="text-xs text-gray-400 mt-1 pl-7">{check.message}</p>
                             {check.solution && <p className="text-xs text-blue-300 mt-1 pl-7 bg-blue-900/20 p-1.5 rounded-md">Solution: {check.solution}</p>}
                        </li>
                    ))}
                </ul>
                <button 
                    onClick={handleRerun}
                    disabled={isRerunning}
                    className="w-full mt-4 flex items-center justify-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50"
                >
                    {isRerunning ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <ResetIcon className="w-4 h-4" />}
                    <span>Re-run Checks</span>
                </button>
            </div>
        </div>
    );
};


export const Header: React.FC<HeaderProps> = (props) => {
    const { title, setTitle, status, elapsedTime, shutdownRemainingTime, customLogo, onLogoChange, onToggleHistory, isHistoryOpen, onToggleAdmin, isAdminOpen, onToggleHelp, isHelpOpen, onToggleAccountSettings, user, logout, systemStatus, onRerunChecks } = props;
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const { log } = useDebugActions();
    
    const isMockUser = user?.id === 'test-user-id';

    useEffect(() => {
        setEditText(title);
    }, [title]);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        if (editText.trim()) {
            setTitle(editText.trim());
        } else {
            setEditText(title); // Revert if empty
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setEditText(title);
            setIsEditing(false);
        }
    };
    
    const handleLogoClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                onLogoChange(result);
            };
            reader.readAsDataURL(file);
        }
        event.target.value = '';
    };

    const handleLogout = async () => {
        const actionId = crypto.randomUUID();
        log('ACTION', 'Logout button clicked.', undefined, actionId);
    
        if (!window.confirm('Are you sure you want to log out?')) {
            log('INFO', 'User cancelled logout dialog.', undefined, actionId);
            return;
        }
    
        // Assign the prop to a local constant. This provides a stable reference
        // for the TypeScript compiler to perform type narrowing on.
        const logoutFn = logout;
    
        if (!logoutFn) {
            log('ERROR', 'Logout function is not available on Header component props.', undefined, actionId);
            return;
        }
    
        setIsLoggingOut(true);
        log('STATE', 'isLoggingOut set to true.', undefined, actionId);
        try {
            // Call the local constant, which is guaranteed to be a function here.
            await logoutFn(actionId);
            log('SUCCESS', 'logout() promise resolved.', undefined, actionId);
        } catch (error) {
            log('ERROR', "Logout failed in Header component.", { error }, actionId);
            alert("Logout failed. Please check the console and debug panel for more details.");
        } finally {
            setIsLoggingOut(false);
            log('STATE', 'isLoggingOut set to false.', undefined, actionId);
        }
    };

    return (
    <header className="bg-gray-900 border-b border-gray-700 shadow-md">
      <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleLogoClick}
              title="Click to upload a custom logo"
            >
                {customLogo ? (
                  <img src={customLogo} alt="Custom Logo" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="white" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                )}
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/png, image/jpeg, image/gif, image/svg+xml"
            />
            <div className="flex items-center space-x-4">
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        className="text-xl md:text-2xl font-bold text-white bg-gray-800 border border-blue-500 rounded-md px-2 -my-1"
                    />
                ) : (
                    <h1 
                        className="text-xl md:text-2xl font-bold text-white cursor-pointer hover:bg-gray-800 rounded-md px-2 -my-1 transition-colors"
                        onClick={() => setIsEditing(true)}
                        title="Click to edit title"
                    >
                        {title}
                    </h1>
                )}
                 {(status === TestStatus.RUNNING || status === TestStatus.FINISHING) && (
                    <div className="flex items-center space-x-2">
                        <span className="relative flex h-3 w-3">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status === TestStatus.FINISHING ? 'bg-yellow-400' : 'bg-green-400'} opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${status === TestStatus.FINISHING ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                        </span>
                        <span className={`text-sm font-mono ${status === TestStatus.FINISHING ? 'text-yellow-400' : 'text-green-400'}`}>
                            {status === TestStatus.FINISHING ? `Finishing... (${shutdownRemainingTime}s)` : formatTime(elapsedTime)}
                        </span>
                    </div>
                )}
            </div>
        </div>
        {user && (
            <div className="flex items-center space-x-4">
                 <SystemStatusIndicator status={systemStatus} onRerun={onRerunChecks} />
                 <button 
                    onClick={onToggleHelp}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-white rounded-md transition ${isHelpOpen ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    title="Help Guide"
                >
                    <QuestionMarkCircleIcon className="w-4 h-4" />
                    <span>Help</span>
                </button>
                <button 
                    onClick={onToggleHistory}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-white rounded-md transition ${isHistoryOpen ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                    title="View Test History"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>History</span>
                </button>
                 {user.profile?.role === 'admin' && (
                    <button 
                        onClick={onToggleAdmin}
                        className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-white rounded-md transition ${isAdminOpen ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
                        title="Admin Panel"
                    >
                        <ShieldCheckIcon className="w-4 h-4" />
                    </button>
                )}
                <div className="relative group">
                    <button className="flex items-center space-x-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors">
                        <UserCircleIcon className="w-6 h-6" />
                    </button>
                    <div className="absolute top-full right-0 w-48 p-2 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50 pointer-events-none group-hover:pointer-events-auto">
                        <div className="px-2 py-1">
                            <p className="text-sm font-medium text-white truncate">{user.email}</p>
                            <p className="text-xs text-gray-400 capitalize">{user.profile?.role}</p>
                        </div>
                        <div className="h-px bg-gray-600 my-2"></div>
                        {!isMockUser && (
                            <button
                                onClick={onToggleAccountSettings}
                                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-left text-gray-300 hover:bg-gray-700 rounded-md transition-colors"
                            >
                                <Cog6ToothIcon className="w-4 h-4" />
                                <span>Account Settings</span>
                            </button>
                        )}
                        <button 
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-left text-red-400 hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50"
                        >
                            {isLoggingOut ? 
                                <SpinnerIcon className="w-4 h-4 animate-spin" /> : 
                                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                            }
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </header>
  );
};