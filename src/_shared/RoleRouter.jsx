"use client";
import App from "@/App";
import SuperAdminApp from "@/modules/superadmin/SuperAdminApp";
import { useAuth } from "@/_shared/AuthContext";

/** A SuperAdmin lands in DFX Control; every shop account gets the shop app. */
export default function RoleRouter() {
  const { backendRole } = useAuth();
  return backendRole === "SuperAdmin" ? <SuperAdminApp /> : <App />;
}
