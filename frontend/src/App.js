import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import Workspace from "@/components/Workspace";
import Settings from "@/components/Settings";
import Admin from "@/components/Admin";

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
        <Routes>
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
