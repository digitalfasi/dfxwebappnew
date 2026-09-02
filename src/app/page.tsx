"use client";
import App from "../App";
import AuthGate from "../components/AuthGate";
import { AuthProvider } from "../context/AuthContext";

export default function Page() {
  return (
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  );
}
