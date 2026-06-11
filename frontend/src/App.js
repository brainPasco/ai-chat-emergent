import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/components/Login";
import AuthCallback from "@/components/AuthCallback";
import Workspace from "@/components/Workspace";
import Settings from "@/components/Settings";
import Admin from "@/components/Admin";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#050505] text-white">
        <div className="font-mono-code text-xs text-white/50 uppercase tracking-widest">Loading workspace...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const location = useLocation();
  // CRITICAL: detect session_id in fragment during render to avoid race conditions
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <Workspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0A0A0A",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#FAFAFA",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
            },
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
