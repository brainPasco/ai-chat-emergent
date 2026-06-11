import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  Users,
  MessageSquare,
  Layers,
  Database,
  Trash2,
  Sparkles,
  Crown,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function StatCard({ icon: Icon, label, value, accent = "#007AFF" }) {
  return (
    <div className="border border-white/10 bg-[#0A0A0A] rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono-code text-[10px] uppercase tracking-widest text-white/40">
          {label}
        </div>
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </div>
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.adminMe();
        if (!m.is_admin) {
          setIsAdmin(false);
          return;
        }
        setIsAdmin(true);
        const [s, u] = await Promise.all([api.adminStats(), api.adminUsers()]);
        setStats(s);
        setUsers(u);
      } catch (e) {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (uid, email) => {
    if (!window.confirm(`Delete user ${email}? This removes all their workspaces, providers, and messages.`)) return;
    try {
      await api.adminDeleteUser(uid);
      toast.success("User deleted");
      const [s, u] = await Promise.all([api.adminStats(), api.adminUsers()]);
      setStats(s);
      setUsers(u);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#050505] grid place-items-center text-white/50 font-mono-code text-xs uppercase tracking-widest">
        Loading admin...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-screen w-screen bg-[#050505] grid place-items-center text-white" data-testid="admin-forbidden">
        <div className="text-center max-w-sm space-y-4 px-6">
          <Shield className="h-10 w-10 mx-auto text-red-400" />
          <div className="font-display text-2xl font-bold">Admin access only</div>
          <div className="text-white/50 text-sm">
            Your account ({user?.email}) is not an administrator.
          </div>
          <Button
            data-testid="back-from-forbidden"
            onClick={() => navigate("/workspace")}
            className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
          >
            Back to workspace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#050505] text-white overflow-y-auto" data-testid="admin-screen">
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between bg-[#050505] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            data-testid="back-to-workspace"
            onClick={() => navigate("/workspace")}
            className="h-8 w-8 grid place-items-center border border-white/10 hover:bg-white/5 rounded-md"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-white/70" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-[#FFFF00] grid place-items-center glow-yellow">
              <Shield className="h-4 w-4 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-bold tracking-tight text-[15px] leading-none">
                Admin Panel
              </div>
              <div className="font-mono-code text-[9.5px] uppercase tracking-widest text-white/40 leading-none mt-1">
                /admin · {user?.email}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-stats">
          <StatCard icon={Users} label="Users" value={stats?.users ?? 0} accent="#007AFF" />
          <StatCard icon={Layers} label="Workspaces" value={stats?.sessions ?? 0} accent="#00FFFF" />
          <StatCard icon={MessageSquare} label="Messages" value={stats?.messages ?? 0} accent="#39FF14" />
          <StatCard icon={Database} label="Providers" value={stats?.providers ?? 0} accent="#FFFF00" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList className="bg-[#0A0A0A] border border-white/10 h-9 p-0.5 rounded-md">
            <TabsTrigger
              value="users"
              data-testid="admin-tab-users"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs h-7 px-3 rounded-sm font-mono-code uppercase tracking-wider"
            >
              <Users className="h-3 w-3 mr-1.5" /> Users
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              data-testid="admin-tab-activity"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs h-7 px-3 rounded-sm font-mono-code uppercase tracking-wider"
            >
              <MessageSquare className="h-3 w-3 mr-1.5" /> Recent Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <div className="border border-white/10 rounded-md overflow-hidden" data-testid="admin-users-table">
              <div className="grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-3 px-4 py-2.5 bg-[#0A0A0A] border-b border-white/10 font-mono-code text-[10px] uppercase tracking-widest text-white/40">
                <div>User</div>
                <div>Workspaces</div>
                <div>Messages</div>
                <div>Providers</div>
                <div>Role</div>
                <div></div>
              </div>
              <div className="divide-y divide-white/5">
                {users.map((u) => (
                  <div
                    key={u.user_id}
                    data-testid={`admin-user-row-${u.user_id}`}
                    className="grid grid-cols-[1fr_120px_80px_80px_80px_60px] gap-3 px-4 py-3 items-center hover:bg-white/[0.02] transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.picture ? (
                        <img src={u.picture} alt="" className="h-7 w-7 rounded-md border border-white/10" />
                      ) : (
                        <div className="h-7 w-7 rounded-md bg-white/5 border border-white/10 grid place-items-center text-xs">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] text-white/90 truncate">{u.name}</div>
                        <div className="font-mono-code text-[10.5px] text-white/40 truncate">{u.email}</div>
                      </div>
                    </div>
                    <div className="font-mono-code text-[12px] text-white/80">{u.workspaces}</div>
                    <div className="font-mono-code text-[12px] text-white/80">{u.messages}</div>
                    <div className="font-mono-code text-[12px] text-white/80">{u.providers}</div>
                    <div>
                      {u.is_admin ? (
                        <Badge className="bg-[#FFFF00]/15 text-[#FFFF00] border-[#FFFF00]/30 hover:bg-[#FFFF00]/20 font-mono-code text-[9.5px] uppercase tracking-wider px-1.5 py-0 gap-1">
                          <Crown className="h-2.5 w-2.5" /> Admin
                        </Badge>
                      ) : (
                        <span className="font-mono-code text-[10.5px] text-white/40 uppercase tracking-wider">User</span>
                      )}
                    </div>
                    <div className="text-right">
                      {u.user_id !== user?.user_id && (
                        <button
                          data-testid={`admin-delete-user-${u.user_id}`}
                          onClick={() => handleDelete(u.user_id, u.email)}
                          className="h-7 w-7 grid place-items-center border border-red-500/20 hover:bg-red-500/10 rounded-md transition"
                          title="Delete user"
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {users.length === 0 && (
                <div className="px-4 py-8 text-center text-white/40 text-sm">No users yet.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="border border-white/10 rounded-md overflow-hidden" data-testid="admin-recent-activity">
              <div className="px-4 py-2.5 bg-[#0A0A0A] border-b border-white/10 font-mono-code text-[10px] uppercase tracking-widest text-white/40">
                Latest 10 messages across all users
              </div>
              <div className="divide-y divide-white/5">
                {(stats?.recent_messages || []).map((m, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${m.role === "user" ? "bg-white/5 border-white/10 text-white/70" : "bg-[#007AFF]/15 border-[#007AFF]/30 text-[#007AFF]"} font-mono-code text-[9.5px] uppercase tracking-wider px-1.5 py-0`}>
                        {m.role}
                      </Badge>
                      <span className="font-mono-code text-[10px] text-white/30">{m.session_id}</span>
                      {m.model && <span className="font-mono-code text-[10px] text-white/30">· {m.model}</span>}
                      <span className="ml-auto font-mono-code text-[10px] text-white/30">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-white/70 line-clamp-2 font-mono-code">
                      {(m.content || "").slice(0, 220)}
                    </div>
                  </div>
                ))}
                {(stats?.recent_messages || []).length === 0 && (
                  <div className="px-4 py-8 text-center text-white/40 text-sm">No activity yet.</div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-6 pb-12 border-t border-white/5 font-mono-code text-[10.5px] text-white/30 leading-relaxed">
          Admin access is granted via the <span className="text-white/60">ADMIN_EMAILS</span> environment variable on the backend.
          Deleting a user cascades workspaces, messages, providers, and active sessions.
        </div>
      </div>
    </div>
  );
}
