import React, { useState } from 'react';
import { databaseScripts } from '../services/databaseScripts';
import { XMarkIcon, DocumentDuplicateIcon, ResetIcon, SpinnerIcon, ExclamationTriangleIcon } from './icons';

interface DatabaseScriptsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DatabaseScriptsModal: React.FC<DatabaseScriptsModalProps> = ({ isOpen, onClose }) => {
    const [isReloading, setIsReloading] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    
    // Since there's only one script now, we can get it directly.
    const fullScript = databaseScripts[0];

    const handleCopy = () => {
        if (fullScript) {
            navigator.clipboard.writeText(fullScript.sql.trim());
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleReload = () => {
        setIsReloading(true);
        // Give the user a moment to see the feedback before the page reloads
        setTimeout(() => {
            window.location.reload();
        }, 500);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-gray-900 w-full max-w-3xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-bold text-white">Database Setup Script</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="flex-grow overflow-y-auto p-6 space-y-4">
                     <div className="text-sm text-gray-400 prose prose-invert prose-sm max-w-none prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white">
                        <p>
                            This is the <strong>consolidated, all-in-one script</strong> you need to set up your database.
                        </p>
                        <p>
                            It is "idempotent," which means it's completely safe to run on both a brand new project and an existing one that needs updating. It will intelligently create or update tables, functions, and security policies without causing errors.
                        </p>
                         <p className="font-bold text-white mt-2">Just copy, paste, and run this one script.</p>
                        <p className="font-bold text-white">How to Apply:</p>
                        <ol>
                            <li>In your Supabase project, go to the <strong>SQL Editor</strong> section.</li>
                            <li>Click the <strong>'Copy Script'</strong> button below.</li>
                            <li>Paste the entire script into the Supabase SQL Editor.</li>
                            <li>Click the <strong>'RUN'</strong> button in Supabase.</li>
                            <li>After the script succeeds, return here and click <strong>'Reload Application & Schema'</strong>. This is a critical step.</li>
                        </ol>
                    </div>

                    <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg space-y-3">
                        <div className="flex items-center">
                            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-400 mr-3 flex-shrink-0" />
                            <h3 className="text-lg font-bold text-yellow-300">Troubleshooting</h3>
                        </div>
                        <div className="text-sm text-yellow-200 pl-9">
                            <p className="font-semibold">Seeing an error like "Unable to run query: Connection string is missing" in Supabase?</p>
                            <p className="mt-1">This usually means your database is paused due to inactivity (common on the free tier). Follow these steps to fix it:</p>
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Go to your <a href="https://app.supabase.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Supabase project dashboard</a>.</li>
                                <li>If your project is paused, there will be a prominent "Restore" or "Resume" button. Click it.</li>
                                <li>Wait a few minutes for the project to become active again.</li>
                                <li>Return to the SQL Editor and try running the script again.</li>
                            </ul>
                        </div>
                    </div>

                    {fullScript && (
                         <div className="border border-gray-700 rounded-lg p-4 bg-gray-800/50 relative">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-white">{fullScript.title}</h3>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"
                                >
                                    <DocumentDuplicateIcon className="w-4 h-4" />
                                    <span>{isCopied ? 'Copied!' : 'Copy Script'}</span>
                                </button>
                            </div>
                            <pre className="text-xs font-mono text-gray-300 bg-gray-950 p-4 rounded-md overflow-x-auto max-h-60">
                                <code>{fullScript.sql.trim()}</code>
                            </pre>
                        </div>
                    )}
                </main>

                <footer className="p-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
                     <button
                        onClick={handleReload}
                        disabled={isReloading}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50"
                    >
                        {isReloading ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <ResetIcon className="w-5 h-5"/>}
                        <span>{isReloading ? 'Reloading...' : 'Reload Application & Schema'}</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DatabaseScriptsModal;
