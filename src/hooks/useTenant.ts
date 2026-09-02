"use client";

// Re-exported from TenantProvider so every existing `@/hooks/useTenant`
// import keeps working unchanged. The hook now reads from a single shared
// context (fetched once per session) instead of each caller independently
// re-fetching branding — see src/providers/TenantProvider.tsx.
export { useTenant } from '@/providers/TenantProvider';
