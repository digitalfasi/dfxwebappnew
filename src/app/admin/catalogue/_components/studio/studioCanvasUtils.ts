import type { CanvasDocument, CanvasLayer } from '@/services/catalogueService';

export type WatermarkPosition = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'CENTER';

/** A short random suffix so cloned/injected layers never collide with a
 * template's own layer ids. */
function layerId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const LOGO_BOX = { width: 160, height: 70 };

function positionToXY(
  position: WatermarkPosition,
  canvasW: number,
  canvasH: number,
  boxW: number,
  boxH: number,
  margin = 28
): { x: number; y: number } {
  switch (position) {
    case 'TOP_LEFT':
      return { x: margin, y: margin };
    case 'TOP_RIGHT':
      return { x: canvasW - boxW - margin, y: margin };
    case 'BOTTOM_LEFT':
      return { x: margin, y: canvasH - boxH - margin };
    case 'CENTER':
      return { x: (canvasW - boxW) / 2, y: (canvasH - boxH) / 2 };
    case 'BOTTOM_RIGHT':
    default:
      return { x: canvasW - boxW - margin, y: canvasH - boxH - margin };
  }
}

/**
 * Builds a real, renderable CanvasDocument from a template preset: clones
 * its layers, resolves the PRODUCT layer(s) to the currently selected image
 * (so the Studio's own edits are what actually shows, not just whichever
 * image happens to be primary), and applies the Watermark section's
 * settings (Jeweller Logo / DFX watermark / position / opacity).
 */
export function buildCanvasFromTemplate(
  template: CanvasDocument,
  productImageId: string | null,
  watermark: { jewellerLogoImageId: string | null; showDfxWatermark: boolean; position: WatermarkPosition; opacity: number }
): CanvasDocument {
  const canvasW = template.canvas_width;
  const canvasH = template.canvas_height;

  let layers: CanvasLayer[] = template.layers.map((layer) => {
    if (layer.type === 'PRODUCT') {
      return { ...layer, image_id: productImageId };
    }
    if (layer.type === 'OVERLAY' && layer.overlay_key === 'DFX_WATERMARK') {
      return { ...layer, visible: watermark.showDfxWatermark };
    }
    return { ...layer };
  });

  if (watermark.jewellerLogoImageId) {
    const { x, y } = positionToXY(watermark.position, canvasW, canvasH, LOGO_BOX.width, LOGO_BOX.height);
    layers = layers.filter((l) => l.id !== 'layer_jeweller_logo');
    layers.push({
      id: 'layer_jeweller_logo',
      type: 'LOGO',
      x,
      y,
      width: LOGO_BOX.width,
      height: LOGO_BOX.height,
      rotation: 0,
      scale: 1,
      opacity: watermark.opacity,
      visible: true,
      locked: false,
      z_index: 998,
      image_id: watermark.jewellerLogoImageId,
    });
  }

  return { canvas_width: canvasW, canvas_height: canvasH, layers };
}

export { layerId };
