import React from 'react';

// No height/background wrapper here on purpose: each auth page already
// declares its own full-height, self-centering, background-painted root
// div. Stacking another min-h-screen wrapper around it just adds a
// redundant block-level ancestor for no visual benefit, and was one of
// three nested min-h-screen containers between this and the root layout.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
