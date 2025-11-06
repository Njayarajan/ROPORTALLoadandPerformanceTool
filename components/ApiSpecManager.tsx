import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiSpecMetadata } from '../types';
import { getApiSpecsMetadata, uploadApiSpec, deleteApiSpec } from '../services/apiSpecService';
import { SpinnerIcon, XMarkIcon, DocumentDuplicateIcon, CloudArrowUpIcon, InformationCircleIcon } from './icons';

interface ApiSpecManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onSpecSelected: (spec: ApiSpecMetadata) => void;
}

type Tab = 'select' | 'upload';

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }
    return date.toLocaleString();
};

const ApiSpecManager: React.FC<ApiSpecManagerProps> = ({ isOpen, onClose, onSpecSelected }) => {
    const [activeTab, setActiveTab] = useState<Tab>('select');
    const [specs, setSpecs] = useState<ApiSpecMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Upload state
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchSpecs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getApiSpecsMetadata();
            setSpecs(data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load specifications.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchSpecs();
            // Reset upload form when opening
            setFile(null);
            setDescription('');
            setActiveTab('select');
        }
    }, [isOpen, fetchSpecs]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            if (!description) {
                // Pre-fill description with filename minus extension
                setDescription(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
            }
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !description.trim()) {
            setError('Please select a file and provide a description.');
            return;
        }
        setIsUploading(true);
        setError(null);
        try {
            const newSpec = await uploadApiSpec(file, description.trim());
            setSpecs(prev => [newSpec, ...prev]);
            setActiveTab('select'); // Switch back to the list view
            setFile(null);
            setDescription('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload file.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (spec: ApiSpecMetadata) => {
        if (window.confirm(`Are you sure you want to delete "${spec.description}"? This cannot be undone.`)) {
            try {
                await deleteApiSpec(spec);
                setSpecs(prev => prev.filter(s => s.id !== spec.id));
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete specification.');
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-gray-900 w-full max-w-2xl rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <DocumentDuplicateIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">API Specification Manager</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                       <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                <nav className="flex-shrink-0 border-b border-gray-700 px-6">
                    <div className="flex space-x-6">
                        <button onClick={() => setActiveTab('select')} className={`py-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === 'select' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'}`}>Select Saved Spec</button>
                        <button onClick={() => setActiveTab('upload')} className={`py-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 ${activeTab === 'upload' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'}`}>Upload New</button>
                    </div>
                </nav>

                <div className="flex-grow overflow-y-auto p-6">
                    {error && <div className="p-3 mb-4 bg-red-900/30 border border-red-500/50 text-red-300 text-sm rounded-md">{error}</div>}

                    {activeTab === 'select' && (
                        isLoading ? (
                            <div className="flex items-center justify-center h-full text-gray-400"><SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" /></div>
                        ) : specs.length === 0 ? (
                            <div className="text-center text-gray-500 py-10">
                                <p className="font-semibold">No saved specifications found.</p>
                                <p className="text-sm">Use the 'Upload New' tab to add one.</p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {specs.map(spec => (
                                    <li key={spec.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center hover:bg-gray-700/50 transition-colors">
                                        <div>
                                            <p className="font-semibold text-white">{spec.description}</p>
                                            <p className="text-xs text-gray-400 mt-1">Uploaded on {formatDate(spec.created_at)}</p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button onClick={() => handleDelete(spec)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors" title="Delete"><XMarkIcon className="w-4 h-4" /></button>
                                            <button onClick={() => onSpecSelected(spec)} className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">Load</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}

                    {activeTab === 'upload' && (
                        <form onSubmit={handleUpload} className="space-y-4">
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description / Version Name</label>
                                <input 
                                    type="text"
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="e.g., Production v2.1"
                                    required
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                />
                                 <p className="text-xs text-gray-500 mt-1">A memorable name to identify this specification later.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Specification File</label>
                                <div onClick={() => fileInputRef.current?.click()} className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-blue-500 transition-colors">
                                    <div className="space-y-1 text-center">
                                        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                                        <div className="flex text-sm text-gray-400">
                                            <p className="pl-1">{file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'Click to select a .json file'}</p>
                                        </div>
                                    </div>
                                </div>
                                <input ref={fileInputRef} onChange={handleFileChange} type="file" className="hidden" accept=".json" />
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button type="submit" disabled={isUploading || !file || !description.trim()} className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-bold text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isUploading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CloudArrowUpIcon className="w-5 h-5" />}
                                    <span>{isUploading ? 'Uploading...' : 'Upload and Save'}</span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ApiSpecManager;