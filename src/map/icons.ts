/**
 * Íconos del mapa, dibujados en la app: sin sprites de terceros y siempre disponibles sin internet.
 * Las flechas miran hacia la derecha: MapLibre las gira para que sigan la línea.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

export const ARROW_ICON = 'arrow';
export const DOUBTFUL_ARROW_ICON = 'arrow-doubtful';

const SIZE = 48;
const PIXEL_RATIO = 2;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = SIZE;
  element.height = SIZE;
  const context = element.getContext('2d');
  if (!context) throw new Error('El navegador no puede dibujar los íconos del mapa');
  return [element, context];
}

function arrowPath(context: CanvasRenderingContext2D) {
  context.beginPath();
  context.moveTo(10, 12);
  context.lineTo(34, 24);
  context.lineTo(10, 36);
}

function drawArrow(color: string, halo: string): ImageData {
  const [, context] = canvas();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = halo;
  context.lineWidth = 12;
  arrowPath(context);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = 6;
  arrowPath(context);
  context.stroke();
  return context.getImageData(0, 0, SIZE, SIZE);
}

/** En duda: flecha punteada con un signo de pregunta. */
function drawDoubtfulArrow(color: string, halo: string): ImageData {
  const [, context] = canvas();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash([3, 8]);
  context.strokeStyle = halo;
  context.lineWidth = 10;
  arrowPath(context);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = 5;
  arrowPath(context);
  context.stroke();
  context.setLineDash([]);
  context.font = 'bold 26px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 5;
  context.strokeStyle = halo;
  context.strokeText('?', 16, 24);
  context.fillStyle = color;
  context.fillText('?', 16, 24);
  return context.getImageData(0, 0, SIZE, SIZE);
}

/** Agrega los íconos con los colores del tema. */
export function addIcons(
  map: MapLibreMap,
  colors: { arrow: string; doubtful: string; halo: string },
): void {
  const images = [
    [ARROW_ICON, drawArrow(colors.arrow, colors.halo)],
    [DOUBTFUL_ARROW_ICON, drawDoubtfulArrow(colors.doubtful, colors.halo)],
  ] as const;
  for (const [id, image] of images) {
    // MapLibre conserva los íconos al cambiar de estilo: hay que reemplazarlos.
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
  }
}
