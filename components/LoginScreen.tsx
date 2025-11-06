import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BoltIcon, SpinnerIcon } from './icons';

interface LoginScreenProps {
    isTestMode: boolean;
    onBypassLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ isTestMode, onBypassLogin }) => {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await signIn(email, password);
            // On success, the AuthProvider will handle the state change
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
            <div className="w-full max-w-md p-8 space-y-6 bg-gray-900 rounded-2xl shadow-2xl border border-gray-700">
                <div className="mx-auto w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4">
                    <BoltIcon className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-center">RO-PORTAL</h1>
                <p className="text-center text-gray-400">Sign in to your account to continue.</p>

                {error && <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 text-sm rounded-md">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-400">Email Address</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm shadow-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="you@example.com"
                        />
                    </div>
                    <div>
                        {/* Fix: The 'name' attribute is not valid on a <label> element and was causing a type error. */}
                        <label htmlFor="password" className="block text-sm font-medium text-gray-400">Password</label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm shadow-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : 'Sign In'}
                    </button>
                </form>

                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-gray-900 text-gray-500">Or for development</span>
                    </div>
                </div>

                <button
                    onClick={onBypassLogin}
                    className="w-full flex justify-center py-3 px-4 border border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500"
                >
                    Continue without Account (Test Mode)
                </button>

            </div>
        </div>
    );
};

export default LoginScreen;