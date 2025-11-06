import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { XMarkIcon, SpinnerIcon, CheckCircleIcon, XCircleIcon, Cog6ToothIcon } from './icons';

interface AccountSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose }) => {
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [loading, setLoading] = useState<'email' | 'password' | null>(null);
    const [error, setError] = useState<{ type: 'email' | 'password'; message: string } | null>(null);
    const [success, setSuccess] = useState<{ type: 'email' | 'password'; message: string } | null>(null);

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading('email');
        setError(null);
        setSuccess(null);
        
        const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });

        if (updateError) {
            setError({ type: 'email', message: updateError.message });
        } else {
            setSuccess({ type: 'email', message: 'A confirmation link has been sent to both your old and new email addresses. Please check both to complete the change.' });
            setNewEmail('');
        }
        setLoading(null);
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError({ type: 'password', message: 'Passwords do not match.' });
            return;
        }
        if (newPassword.length < 6) {
            setError({ type: 'password', message: 'Password must be at least 6 characters long.' });
            return;
        }

        setLoading('password');
        setError(null);
        setSuccess(null);

        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        
        if (updateError) {
            setError({ type: 'password', message: updateError.message });
        } else {
            setSuccess({ type: 'password', message: 'Password updated successfully!' });
            setNewPassword('');
            setConfirmPassword('');
        }
        setLoading(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-gray-900 w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                        <Cog6ToothIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-lg font-bold text-white">Account Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="p-6 space-y-6">
                    {/* Change Email Section */}
                    <form onSubmit={handleUpdateEmail} className="space-y-3">
                        <h3 className="font-semibold text-white">Change Email Address</h3>
                        {error?.type === 'email' && <p className="text-sm text-red-400">{error.message}</p>}
                        {success?.type === 'email' && <p className="text-sm text-green-400">{success.message}</p>}
                        <div>
                            <label htmlFor="new-email" className="block text-sm font-medium text-gray-400 mb-1">New Email</label>
                            <input
                                id="new-email"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                required
                                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="text-right">
                            <button type="submit" disabled={loading === 'email'} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition min-w-[100px] flex justify-center">
                                {loading === 'email' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : 'Save Email'}
                            </button>
                        </div>
                    </form>

                    <div className="border-t border-gray-700"></div>

                    {/* Change Password Section */}
                    <form onSubmit={handleUpdatePassword} className="space-y-3">
                        <h3 className="font-semibold text-white">Change Password</h3>
                        {error?.type === 'password' && <p className="text-sm text-red-400">{error.message}</p>}
                        {success?.type === 'password' && <p className="text-sm text-green-400">{success.message}</p>}
                        <div>
                            <label htmlFor="new-password" className="block text-sm font-medium text-gray-400 mb-1">New Password</label>
                            <input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                         <div>
                            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-400 mb-1">Confirm New Password</label>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="text-right">
                            <button type="submit" disabled={loading === 'password'} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition min-w-[120px] flex justify-center">
                                {loading === 'password' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : 'Save Password'}
                            </button>
                        </div>
                    </form>
                </main>

                 <footer className="p-4 bg-gray-800/50 rounded-b-xl flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default AccountSettingsModal;
