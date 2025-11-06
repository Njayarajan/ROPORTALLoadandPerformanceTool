import React, { useState, useEffect, useCallback } from 'react';
import { listUsers, inviteUser, updateUserRole, deleteUser } from '../services/adminService';
import type { AdminUserWithProfile } from '../types';
import { SpinnerIcon, UserPlusIcon, ResetIcon, PencilSquareIcon, TrashIcon, InformationCircleIcon, ExclamationTriangleIcon, ChevronDownIcon, DocumentDuplicateIcon } from './icons';

const UserManagementTab: React.FC<{ isMockUser: boolean }> = ({ isMockUser }) => {
    const [users, setUsers] = useState<AdminUserWithProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBackendMisconfigured, setIsBackendMisconfigured] = useState(false);
    
    // Invite form state
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'user' | 'admin'>('user');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setIsBackendMisconfigured(false);
        try {
            const userList = await listUsers();
            setUsers(userList);
        } catch (err: any) {
            const errorMessage = err.message || 'An unknown error occurred';
            if (errorMessage.includes("Backend Action Required")) {
                setIsBackendMisconfigured(true);
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isMockUser) {
            setError("User management is not available in Test Mode.");
            setIsLoading(false);
            return;
        }
        fetchUsers();
    }, [fetchUsers, isMockUser]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        setError(null);
        setInviteSuccess(null);
        try {
            await inviteUser(inviteEmail, inviteRole);
            setInviteSuccess(`Successfully sent an invitation to ${inviteEmail}.`);
            setInviteEmail('');
            setInviteRole('user');
            fetchUsers();
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation.');
        } finally {
            setIsInviting(false);
        }
    };

    if (isBackendMisconfigured) {
        return <EdgeFunctionInstructions onRetry={fetchUsers} />;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-semibold text-white">User Management</h3>
                    <p className="text-sm text-gray-400 mt-1">Invite new users and manage roles for existing accounts.</p>
                </div>
                <button onClick={fetchUsers} disabled={isLoading} className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded-md transition disabled:opacity-50">
                    {isLoading ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <ResetIcon className="w-4 h-4"/>}
                    <span>Refresh List</span>
                </button>
            </div>

            {error && <div className="p-3 bg-red-900/30 border border-red-500/50 text-red-300 text-sm rounded-md">{error}</div>}
            {inviteSuccess && <div className="p-3 bg-green-900/30 border border-green-500/50 text-green-300 text-sm rounded-md">{inviteSuccess}</div>}

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h4 className="font-semibold text-white mb-3">Invite New User</h4>
                <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label htmlFor="invite-email" className="block text-xs font-medium text-gray-400 mb-1">Email Address</label>
                        <input type="email" id="invite-email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="new.user@example.com" className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                         <label htmlFor="invite-role" className="block text-xs font-medium text-gray-400 mb-1">Role</label>
                         <select id="invite-role" value={inviteRole} onChange={e => setInviteRole(e.target.value as 'user' | 'admin')} className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500">
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                         </select>
                    </div>
                    <div className="md:col-span-3">
                         <button type="submit" disabled={isInviting} className="w-full md:w-auto flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition disabled:opacity-50 min-w-[120px]">
                            {isInviting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <><UserPlusIcon className="w-5 h-5" /><span>Send Invite</span></>}
                        </button>
                    </div>
                </form>
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-800">
                        <tr>
                            <th className="px-6 py-3">User</th>
                            <th className="px-6 py-3">Role</th>
                            <th className="px-6 py-3">Joined</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {isLoading ? (
                            <tr><td colSpan={4} className="text-center py-8"><SpinnerIcon className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                        ) : users.map(user => (
                            <UserRow key={user.id} user={user} onUpdate={fetchUsers} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const UserRow: React.FC<{ user: AdminUserWithProfile; onUpdate: () => void }> = ({ user, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [role, setRole] = useState(user.profile?.role || 'user');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleSaveRole = async () => {
        setIsSaving(true);
        try {
            await updateUserRole(user.id, role);
            onUpdate();
        } catch (err) {
            alert(`Failed to update role: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
            setIsEditing(false);
        }
    };
    
    const handleDelete = async () => {
        if (window.confirm(`Are you sure you want to permanently delete user ${user.email}?`)) {
            setIsDeleting(true);
            try {
                await deleteUser(user.id);
                onUpdate();
            } catch (err) {
                 alert(`Failed to delete user: ${err instanceof Error ? err.message : 'Unknown error'}`);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    return (
        <tr className="bg-gray-800/50 hover:bg-gray-800">
            <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{user.email}</td>
            <td className="px-6 py-4">
                {isEditing ? (
                    <select value={role} onChange={e => setRole(e.target.value as 'user' | 'admin')} className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-xs">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                ) : (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.profile?.role === 'admin' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300'}`}>
                        {user.profile?.role || 'user'}
                    </span>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</td>
            <td className="px-6 py-4 text-right space-x-2">
                {isEditing ? (
                    <>
                        <button onClick={() => setIsEditing(false)} className="px-2 py-1 text-xs bg-gray-600 rounded">Cancel</button>
                        <button onClick={handleSaveRole} disabled={isSaving} className="px-2 py-1 text-xs bg-blue-600 rounded w-14">
                            {isSaving ? <SpinnerIcon className="w-3 h-3 animate-spin mx-auto" /> : 'Save'}
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={() => setIsEditing(true)} title="Edit Role" className="p-2 hover:bg-gray-700 rounded"><PencilSquareIcon className="w-4 h-4"/></button>
                        <button onClick={handleDelete} disabled={isDeleting} title="Delete User" className="p-2 hover:bg-red-900/40 rounded">
                            {isDeleting ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <TrashIcon className="w-4 h-4"/>}
                        </button>
                    </>
                )}
            </td>
        </tr>
    );
};

const EdgeFunctionInstructions: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 text-yellow-300 text-sm rounded-lg flex items-start space-x-4">
        <ExclamationTriangleIcon className="w-8 h-8 flex-shrink-0" />
        <div>
          <h3 className="font-bold text-lg">Backend Action Required</h3>
          <p className="mt-1">User management requires secure backend Supabase Edge Functions. The application couldn't connect to them. Please follow the steps below to deploy them, then click "Retry Connection".</p>
        </div>
      </div>

      <div className="space-y-4">
        <InstructionStep number={1} title="Install CLI & Link Project">
            <p>If you haven't already, open a terminal, install the Supabase CLI, and link it to your project.</p>
            <CodeBlock language="bash" code={`npm install -g supabase\nsupabase login\nsupabase link --project-ref <YOUR_PROJECT_ID>`} />
        </InstructionStep>
        
        <InstructionStep number={2} title="Create Function Files">
            <p>In your project, you should have a `supabase/functions` directory. Inside it, create the four folders and `index.ts` files shown below, and paste the corresponding code into each file.</p>
            <FunctionCodeAccordion name="list-users" />
            <FunctionCodeAccordion name="invite-user" />
            <FunctionCodeAccordion name="update-user-role" />
            <FunctionCodeAccordion name="delete-user" />
        </InstructionStep>

        <InstructionStep number={3} title="Deploy All Functions">
             <p>Once all files are created and saved, run this single command from your terminal to deploy them to Supabase.</p>
            <CodeBlock language="bash" code="supabase functions deploy" />
        </InstructionStep>

        <InstructionStep number={4} title="Retry Connection">
            <p>After deployment succeeds, click the button below to re-check the connection.</p>
            <button onClick={onRetry} className="mt-2 flex items-center space-x-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition">
                <ResetIcon className="w-5 h-5"/>
                <span>Retry Connection</span>
            </button>
        </InstructionStep>
      </div>
    </div>
);

const InstructionStep: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
    <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center">
            <div className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm mr-3 flex-shrink-0">{number}</div>
            <h4 className="font-semibold text-lg text-white">{title}</h4>
        </div>
        <div className="mt-3 pl-9 text-sm text-gray-300 space-y-2">{children}</div>
    </div>
);

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
    const [isCopied, setIsCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };
    return (
        <div className="bg-gray-900 rounded-md p-3 relative font-mono text-xs border border-gray-600">
            <button onClick={handleCopy} className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md">{isCopied ? 'Copied!' : 'Copy'}</button>
            <pre><code className={`language-${language}`}>{code}</code></pre>
        </div>
    );
};

const FunctionCodeAccordion: React.FC<{ name: string }> = ({ name }) => {
    const [isOpen, setIsOpen] = useState(false);
    const code = getFunctionCode(name);
    return (
        <div className="border border-gray-700 rounded-lg bg-gray-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 text-left">
                <span className="font-mono text-sm text-white">{`supabase/functions/${name}/index.ts`}</span>
                <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="p-3 border-t border-gray-700">
                    <CodeBlock language="typescript" code={code} />
                </div>
            )}
        </div>
    );
};

const getFunctionCode = (name: string): string => {
    const commonHeader = `
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Required for all functions to handle CORS and authenticate the admin user
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function checkAdmin(req: Request) {
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("User not found");
    const { data: profile, error } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
    if (error || !profile || profile.role !== 'admin') throw new Error("Permission denied: Not an admin");
    return user;
}
`.trim();

    const functionBodies: Record<string, string> = {
        'list-users': `
serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        await checkAdmin(req);
        const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
        if (error) throw error;
        const userIds = users.map(u => u.id);
        const { data: profiles, error: profileError } = await supabaseAdmin.from('profiles').select('*').in('id', userIds);
        if (profileError) throw profileError;
        const profileMap = new Map(profiles.map(p => [p.id, p]));
        const usersWithProfiles = users.map(u => ({ ...u, profile: profileMap.get(u.id) || null }));
        return new Response(JSON.stringify({ users: usersWithProfiles }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});`,
        'invite-user': `
serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        await checkAdmin(req);
        const { email, role } = await req.json();
        const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
        if (error) throw error;
        // The profiles table is populated by a trigger, but we need to set the role.
        if (data.user) {
            const { error: profileError } = await supabaseAdmin.from('profiles').update({ role }).eq('id', data.user.id);
            if (profileError) throw new Error(\`User invited, but failed to set role: \${profileError.message}\`);
        }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});`,
        'update-user-role': `
serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        await checkAdmin(req);
        const { userId, role } = await req.json();
        const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { error } = await supabaseAdmin.from('profiles').update({ role }).eq('id', userId);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});`,
        'delete-user': `
serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
        await checkAdmin(req);
        const { userId } = await req.json();
        const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});`,
    };
    return (commonHeader + '\n\n' + functionBodies[name]).trim();
};

export default UserManagementTab;