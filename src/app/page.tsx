"use client";
import App from "@/App";
import AuthGate from "@/_shared/AuthGate";
import { AuthProvider } from "@/_shared/AuthContext";

export default function Page() {
  return (
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  );
}
