import React, { useState, useEffect } from 'react';
import { SavedUrl } from '../types';
import { XMarkIcon, BookmarkSquareIcon, SpinnerIcon, PlusIcon, InformationCircleIcon } from './icons';
import { addUrl, updateUrl, deleteUrl } from '../services/urlService';

interface UrlManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    savedUrls: SavedUrl[];
    onUrlsChanged: () => void;
}

const UrlManagerModal: React.FC<UrlManagerModalProps> = ({ isOpen, onClose, savedUrls, onUrlsChanged }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [url, setUrl] = useState('');
    const [comment, setComment] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Reset form when modal is closed or opened
        if (isOpen) {
            setEditingId(null);
            setUrl('');
            setComment('');
            setError(null);
        }
    }, [isOpen]);

    const handleEditClick = (savedUrl: SavedUrl) => {
        setEditingId(savedUrl.id);
        setUrl(savedUrl.url);
        setComment(savedUrl.comment);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setUrl('');
        setComment('');
        setError(null);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this saved URL?')) {
            deleteUrl(id);
            onUrlsChanged();
        }
    };

    const handleSave = () => {
        if (!comment.trim() || !url.trim()) {
            setError('Both comment and URL fields are required.');
            return;
        }
        try {
            new URL(url); // Validate URL format
        } catch (e) {
            setError('Please enter a valid URL.');
            return;
        }
        setError(null);
        
        if (editingId) {
            updateUrl({ id: editingId, url, comment });
        } else {
            addUrl({ url, comment });
        }
        onUrlsChanged();
        handleCancelEdit(); // Reset form
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
                        <BookmarkSquareIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">URL Manager</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                       <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                <div className="flex-grow overflow-y-auto p-6 space-y-4">
                    {savedUrls.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">No URLs saved yet. Use the form below to add one.</p>
                    ) : (
                        <ul className="space-y-2">
                            {savedUrls.map(savedUrl => (
                                <li key={savedUrl.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-white">{savedUrl.comment}</p>
                                        <p className="text-xs text-gray-400 font-mono mt-1 truncate" title={savedUrl.url}>{savedUrl.url}</p>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                        <button onClick={() => handleEditClick(savedUrl)} className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition">Edit</button>
                                        <button onClick={() => handleDelete(savedUrl.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors" title="Delete"><XMarkIcon className="w-4 h-4" /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                
                <footer className="p-6 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 rounded-b-xl">
                    <h3 className="text-md font-semibold text-white mb-3">{editingId ? 'Edit URL' : 'Add New URL'}</h3>
                     <div className="p-3 mb-4 text-xs text-blue-300 bg-blue-900/40 border border-blue-500/50 rounded-lg flex items-start space-x-3">
                        <InformationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                        The target URL must be publicly accessible on the internet for the test to work correctly. Private or VPN-only URLs cannot be reached by the test infrastructure.
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="url-comment" className="block text-xs font-medium text-gray-400 mb-1">Comment</label>
                            <input
                                id="url-comment"
                                type="text"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="e.g., Staging Server"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            />
                        </div>
                        <div>
                            <label htmlFor="url-input" className="block text-xs font-medium text-gray-400 mb-1">URL</label>
                            <input
                                id="url-input"
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://api.example.com"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end space-x-2">
                        {editingId && (
                             <button onClick={handleCancelEdit} className="px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md transition">Cancel</button>
                        )}
                        <button onClick={handleSave} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">{editingId ? 'Save Changes' : 'Add URL'}</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default UrlManagerModal;