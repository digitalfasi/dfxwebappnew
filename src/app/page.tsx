"use client";
import RoleRouter from "@/_shared/RoleRouter";
import AuthGate from "@/_shared/AuthGate";
import { AuthProvider } from "@/_shared/AuthContext";

export default function Page() {
  return (
    <AuthProvider>
      <AuthGate>
        <RoleRouter />
      </AuthGate>
    </AuthProvider>
  );
}
