"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { StudioProvider } from '../../_components/studio/StudioContext';
import { StudioShell } from '../../_components/studio/StudioShell';

export default function ProductStudioPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId;

  return (
    <StudioProvider productId={productId}>
      <StudioShell />
    </StudioProvider>
  );
}
