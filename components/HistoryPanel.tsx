import React, { useState, useMemo } from 'react';
import type { TestRun, TestRunSummary, ApiSpecMetadata } from '../types';
import { SpinnerIcon, GlobeAltIcon, ScaleIcon, ClockIcon, UsersIcon, TrashIcon, PencilSquareIcon, CheckIcon, ChevronDownIcon } from './icons';
import { cleanupDuplicateTestRuns, updateTestRun } from '../services/historyService';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    history: TestRunSummary[];
    isLoading: boolean;
    onView: (run: TestRunSummary) => void;
    onRerun: (run: TestRunSummary) => void;
    onDelete: (id: string) => void;
    onRefresh: () => void;
    onCompare: (runA: TestRunSummary, runB: TestRunSummary) => void;
    onAnalyzeTrends: (runIds: string[]) => void;
    loadingStates: Record<string, boolean>;
    apiSpecs: ApiSpecMetadata[];
}

const StatPill: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="text-center">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
    </div>
);

const HistoryCard: React.FC<{ 
    run: TestRunSummary; 
    onView: (run: TestRunSummary) => void; 
    onRerun: (run: TestRunSummary) => void; 
    onDelete: (id: string) => void; 
    onRename: (id: string, newTitle: string) => Promise<void>;
    onSelect: (id: string, isSelected: boolean) => void;
    isSelected: boolean;
    isLoading: boolean;
}> = ({ run, onView, onRerun, onDelete, onRename, onSelect, isSelected, isLoading }) => {
    const hasErrors = (run.stats?.errorCount ?? 0) > 0;
    const [isEditing, setIsEditing] = useState(false);
    const [newTitle, setNewTitle] = useState(run.title);
    const [isSaving, setIsSaving] = useState(false);

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete the test run "${run.title}"? This action cannot be undone.`)) {
            onDelete(run.id);
        }
    };
    
    const handleRename = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSaving(true);
        try {
            await onRename(run.id, newTitle);
            setIsEditing(false);
        } catch (err) {
            alert('Failed to rename test run.');
        } finally {
            setIsSaving(false);
        }
    };

    const isApiScan = run.config?.endpoints && run.config.endpoints.length > 0;
    const runMode = run.config?.runMode ?? 'duration';
    
    // Safely get the pathname to prevent crashes on invalid URLs
    const getPathname = (url: string | undefined) => {
        if (!url) return 'N/A';
        try {
            return new URL(url).pathname;
        } catch (e) {
            return url; // Fallback to showing the invalid string
        }
    };

    return (
        <div className={`bg-gray-800/70 rounded-lg border ${isSelected ? 'border-blue-500' : 'border-gray-700'} p-4 transition-all hover:bg-gray-800 hover:border-gray-600 relative overflow-hidden`}>
             <div className={`absolute left-0 top-0 h-full w-1 ${hasErrors ? 'bg-red-500' : 'bg-green-500'}`}></div>
             <div className="pl-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-3 flex-grow min-w-0">
                        <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => onSelect(run.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={isLoading}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 mt-1"
                        />
                        <div className="flex-grow min-w-0">
                            {isEditing ? (
                                <input 
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full bg-gray-700 border border-blue-500 rounded-md px-2 py-0.5 text-sm"
                                    autoFocus
                                />
                            ) : (
                                <h3 className="font-bold text-white truncate" title={run.title}>{run.title}</h3>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{new Date(run.created_at).toLocaleString()}</p>
                        </div>
                    </div>
                     <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                        {isEditing ? (
                             <button onClick={handleRename} disabled={isSaving} className="p-1.5 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                {isSaving ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <CheckIcon className="w-4 h-4"/>}
                            </button>
                        ) : (
                            <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded" title="Rename">
                                <PencilSquareIcon className="w-4 h-4"/>
                            </button>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${hasErrors ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
                            {hasErrors ? 'Errors' : 'Success'}
                        </span>
                    </div>
                </div>

                <div className="mt-3 text-xs font-mono bg-gray-900/50 p-2 rounded-md flex items-center text-gray-300">
                    {isApiScan ? (
                        <>
                           <GlobeAltIcon className="w-4 h-4 mr-2 text-blue-400 flex-shrink-0" />
                           <span className="truncate">API Scan ({(run.config?.endpoints?.length ?? 0)} endpoints)</span>
                        </>
                    ) : (
                        <>
                           <span className={`font-bold mr-2 ${run.config?.method === 'GET' ? 'text-green-400' : 'text-yellow-400'}`}>{run.config?.method ?? 'N/A'}</span>
                           <span className="truncate" title={run.config?.url}>{getPathname(run.config?.url)}</span>
                        </>
                    )}
                </div>
                 
                 <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                    <div className="flex items-center space-x-2">
                        <ScaleIcon className="w-4 h-4"/>
                        <span>Mode: <span className="font-semibold text-gray-300 capitalize">{runMode.replace('-', ' ')}</span></span>
                    </div>
                    {runMode === 'duration' ? (
                        <div className="flex items-center space-x-2">
                            <ClockIcon className="w-4 h-4"/>
                            <span>Duration: <span className="font-semibold text-gray-300">{run.config?.duration ?? 'N/A'}s</span></span>
                        </div>
                    ) : (
                        <div className="flex items-center space-x-2">
                             <ClockIcon className="w-4 h-4"/>
                             <span>Iterations: <span className="font-semibold text-gray-300">{(run.config?.iterations ?? 0).toLocaleString()}</span></span>
                        </div>
                    )}
                     <div className="flex items-center space-x-2">
                        <UsersIcon className="w-4 h-4"/>
                        <span>Users: <span className="font-semibold text-gray-300">{run.config?.users ?? 'N/A'}</span></span>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-700/50 pt-3">
                    <StatPill label="Throughput" value={`${(run.stats?.throughput ?? 0).toFixed(1)}/s`} />
                    <StatPill label="Avg. Latency" value={`${(run.stats?.avgResponseTime ?? 0).toFixed(0)}ms`} />
                    <StatPill label="Errors" value={run.stats?.errorCount ?? 0} />
                </div>
                
                <div className="mt-4 flex items-center justify-end space-x-2">
                     <button
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                        title="Delete"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onRerun(run)}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50"
                    >
                        Rerun
                    </button>
                    <button
                        onClick={() => onView(run)}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition w-[60px] flex justify-center items-center"
                    >
                        {isLoading ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : 'View'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, history, isLoading, onView, onRerun, onDelete, onRefresh, onCompare, onAnalyzeTrends, loadingStates, apiSpecs }) => {
    const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
    const [isCleaning, setIsCleaning] = useState(false);
    const [baseUrlFilter, setBaseUrlFilter] = useState<string>('');
    const [apiSpecFilter, setApiSpecFilter] = useState<string>('');
    const [isSelectionMenuOpen, setIsSelectionMenuOpen] = useState(false);

    const uniqueBaseUrls = useMemo(() => {
        const urls = new Set<string>();
        history.forEach(run => {
            try {
                if (run.config?.url) {
                    urls.add(new URL(run.config.url).origin);
                }
            } catch (e) { /* Ignore invalid URLs */ }
        });
        return Array.from(urls).sort();
    }, [history]);

    const usedApiSpecs = useMemo(() => {
        const specIds = new Set<string>();
        history.forEach(run => {
            if (run.api_spec_id) {
                specIds.add(run.api_spec_id);
            }
        });
        return apiSpecs.filter(spec => specIds.has(spec.id));
    }, [history, apiSpecs]);

    const filteredHistory = useMemo(() => {
        return history.filter(run => {
            const baseUrlMatch = !baseUrlFilter || (run.config?.url && new URL(run.config.url).origin === baseUrlFilter);
            const apiSpecMatch = !apiSpecFilter || run.api_spec_id === apiSpecFilter;
            return baseUrlMatch && apiSpecMatch;
        });
    }, [history, baseUrlFilter, apiSpecFilter]);
    
    const handleSelectRun = (id: string, isSelected: boolean) => {
        if (isSelected) {
            setSelectedRuns(prev => [...prev, id]);
        } else {
            setSelectedRuns(prev => prev.filter(runId => runId !== id));
        }
    };
    
    const handleRenameRun = async (id: string, newTitle: string) => {
        await updateTestRun(id, { title: newTitle });
        onRefresh(); // Refresh the list to show the new title
    };

    const handleSelectLatest = (count: number) => {
        const latestIds = filteredHistory.slice(0, count).map(r => r.id);
        setSelectedRuns(latestIds);
        setIsSelectionMenuOpen(false);
    };

    const handleUnselectAll = () => {
        setSelectedRuns([]);
    };

    const handleCompare = () => {
        if (selectedRuns.length !== 2) return;
        const runA = history.find(r => r.id === selectedRuns[0]);
        const runB = history.find(r => r.id === selectedRuns[1]);
        if (runA && runB) {
            // Ensure the older run is always runA
            if (new Date(runA.created_at) > new Date(runB.created_at)) {
                onCompare(runB, runA);
            } else {
                onCompare(runA, runB);
            }
            setSelectedRuns([]);
        }
    };

    const handleCleanup = async () => {
        if (window.confirm(
            `This will scan for and permanently delete duplicate test runs based on their configuration and results.\n\nThe oldest entry in a set of duplicates will be kept.\n\nAre you sure you want to proceed?`
        )) {
            setIsCleaning(true);
            try {
                const deletedCount = await cleanupDuplicateTestRuns();
                alert(`${deletedCount} duplicate run(s) found and removed.`);
                onRefresh(); // Refresh the list to show the cleaned-up history
            } catch (error) {
                alert(`An error occurred during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } finally {
                setIsCleaning(false);
            }
        }
    };

    return (
        <>
            <div 
                className={`fixed inset-0 bg-gray-950/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <aside className={`fixed top-0 right-0 h-full w-full max-w-xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <h2 className="text-lg font-bold text-white">Test History</h2>
                        <div className="flex items-center space-x-2">
                             <button
                                onClick={handleCleanup}
                                disabled={isLoading || isCleaning}
                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
                                title="Clean up duplicate entries"
                            >
                                {isCleaning ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <TrashIcon className="w-5 h-5" />}
                            </button>
                             <button onClick={onRefresh} disabled={isLoading || isCleaning} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait">
                                {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-3.181-4.991v-4.992a8.25 8.25 0 00-11.664 0l-3.181 3.183m3.181 4.991h4.992" />
                                </svg>
                                )}
                            </button>
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </header>
                    <div className="p-4 border-b border-gray-700 flex-shrink-0 space-y-3 bg-gray-800/50">
                        <div className="grid grid-cols-2 gap-3">
                            <select value={baseUrlFilter} onChange={e => setBaseUrlFilter(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-1.5 text-xs text-white">
                                <option value="">Filter by Environment...</option>
                                {uniqueBaseUrls.map(url => <option key={url} value={url}>{url}</option>)}
                            </select>
                             <select value={apiSpecFilter} onChange={e => setApiSpecFilter(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-1.5 text-xs text-white">
                                <option value="">Filter by API Spec...</option>
                                {usedApiSpecs.map(spec => <option key={spec.id} value={spec.id}>{spec.description}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto p-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                                <p className="font-semibold">No Test History</p>
                                <p className="text-sm">Run a test to see its results here.</p>
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-xs text-gray-400">{selectedRuns.length} of {filteredHistory.length} selected</p>
                                    <div className="flex space-x-2">
                                        <div className="relative">
                                            <button 
                                                onClick={() => setIsSelectionMenuOpen(!isSelectionMenuOpen)}
                                                className="flex items-center space-x-1 px-2 py-1 text-xs font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md"
                                            >
                                                <span>Select Latest...</span>
                                                <ChevronDownIcon className="w-3 h-3"/>
                                            </button>
                                            {isSelectionMenuOpen && (
                                                <div className="absolute right-0 mt-1 w-32 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
                                                    <button onClick={() => handleSelectLatest(10)} className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-700">Latest 10</button>
                                                    <button onClick={() => handleSelectLatest(20)} className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-700">Latest 20</button>
                                                    <button onClick={() => handleSelectLatest(40)} className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-700">Latest 40</button>
                                                    <div className="border-t border-gray-700 my-1"></div>
                                                    <button onClick={() => handleSelectLatest(filteredHistory.length)} className="block w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-700">Select All</button>
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={handleUnselectAll} disabled={selectedRuns.length === 0} className="px-2 py-1 text-xs font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md disabled:opacity-50">Unselect</button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {filteredHistory.map(run => (
                                        <HistoryCard 
                                        key={run.id} 
                                        run={run} 
                                        onView={onView} 
                                        onRerun={onRerun} 
                                        onDelete={onDelete}
                                        onRename={handleRenameRun}
                                        onSelect={handleSelectRun}
                                        isSelected={selectedRuns.includes(run.id)}
                                        isLoading={loadingStates[run.id] || false}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                     <footer className="p-4 border-t border-gray-700 flex-shrink-0 space-y-2">
                        <button
                            onClick={handleCompare}
                            disabled={selectedRuns.length !== 2}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-bold text-white bg-gray-700 rounded-md shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ScaleIcon className="w-5 h-5 mr-2" />
                            <span>Compare (2 selected)</span>
                        </button>
                        <button
                            onClick={() => onAnalyzeTrends(selectedRuns)}
                            disabled={selectedRuns.length < 2}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ScaleIcon className="w-5 h-5 mr-2" />
                            <span>Analyze Trends ({selectedRuns.length} selected)</span>
                        </button>
                    </footer>
                </div>
            </aside>
        </>
    );
};

export default HistoryPanel;