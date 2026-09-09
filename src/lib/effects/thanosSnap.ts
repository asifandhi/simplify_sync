import domtoimage from 'dom-to-image';

export interface ThanosSnapOptions {
  /**
   * Number of sub-canvases (dust layers) to distribute pixels across.
   * Default: 12
   */
  count?: number;

  /**
   * Duration of the disintegration animation in milliseconds.
   * Default: 1100
   */
  duration?: number;
}

/**
 * Triggers a Thanos-snap disintegration effect on an HTMLElement.
 *
 * Algorithm:
 * 1. Takes a raster snapshot of the target DOM element via `dom-to-image`.
 * 2. Distributes pixel data into N layered canvases using in-memory ImageData buffers.
 * 3. Appends fixed-position canvases directly over the element.
 * 4. Fades the original element and scatters the dust canvases upward/outward.
 * 5. Removes all temporary canvases from the DOM after the animation finishes.
 *
 * @returns Promise that resolves once the disintegration animation is complete.
 */
export async function thanosSnap(
  element: HTMLElement | null,
  options?: ThanosSnapOptions
): Promise<void> {
  if (!element || typeof window === 'undefined') {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const count = options?.count ?? 12;
  const duration = options?.duration ?? 2000;
  const d2i = (domtoimage as any)?.default || domtoimage;

  try {
    // 1. Snapshot DOM element to a high-quality data URL
    const imgDataUrl: string = await d2i.toPng(element, {
      quality: 1,
      width: rect.width,
      height: rect.height,
      style: {
        transform: 'none',
        margin: '0',
      },
    });

    // 2. Load the data URL into an offscreen image
    const image = new Image();
    image.src = imgDataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = (err) => reject(err);
    });

    // 3. Extract raw pixel data via a main canvas
    const mainCanvas = document.createElement('canvas');
    mainCanvas.width = rect.width;
    mainCanvas.height = rect.height;
    const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
    if (!mainCtx) return;

    mainCtx.drawImage(image, 0, 0, rect.width, rect.height);
    const mainImageData = mainCtx.getImageData(0, 0, rect.width, rect.height);
    const mainPixels = mainImageData.data;
    const totalPixels = mainPixels.length;

    // 4. Create sub-canvases and allocate in-memory ImageData buffers
    const canvases: HTMLCanvasElement[] = [];
    const canvasDataArray: ImageData[] = [];

    const computedStyle = window.getComputedStyle(element);
    const borderRadius = computedStyle.borderRadius || '0px';

    for (let i = 0; i < count; i++) {
      const c = document.createElement('canvas');
      c.width = rect.width;
      c.height = rect.height;
      c.style.pointerEvents = 'none';
      c.style.position = 'fixed';
      c.style.top = `${rect.top}px`;
      c.style.left = `${rect.left}px`;
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      c.style.borderRadius = borderRadius;
      c.style.zIndex = '99999';
      c.style.opacity = '1';
      c.style.transform = 'translate(0px, 0px) rotate(0deg)';
      c.style.willChange = 'transform, opacity';

      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;

      canvases.push(c);
      canvasDataArray.push(ctx.createImageData(rect.width, rect.height));
    }

    if (canvases.length === 0) return;

    // 5. Scatter pixels randomly across the sub-canvases (fast memory loop)
    for (let p = 0; p < totalPixels; p += 4) {
      // Skip transparent pixels
      if (mainPixels[p + 3] === 0) continue;

      const targetIdx = Math.floor(Math.random() * count);
      const targetData = canvasDataArray[targetIdx].data;

      targetData[p] = mainPixels[p];         // R
      targetData[p + 1] = mainPixels[p + 1]; // G
      targetData[p + 2] = mainPixels[p + 2]; // B
      targetData[p + 3] = mainPixels[p + 3]; // A
    }

    // 6. Paint each canvas buffer once and append to DOM
    canvases.forEach((c, i) => {
      const ctx = c.getContext('2d');
      if (ctx && canvasDataArray[i]) {
        ctx.putImageData(canvasDataArray[i], 0, 0);
      }
      document.body.appendChild(c);
    });

    // 7. Hide original element immediately
    const originalVisibility = element.style.visibility;
    element.style.visibility = 'hidden';

    // 8. Trigger particle drift animation on next animation frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        canvases.forEach((c, i) => {
          const ratio = i / count;
          // Upward and slightly randomized lateral dust drift
          const tx = (Math.random() - 0.3) * (50 + ratio * 40);
          const ty = -(30 + Math.random() * 60 + ratio * 50);
          const angle = (Math.random() - 0.5) * 30;
          const animDuration = Math.round(duration * (0.65 + ratio * 0.4));

          c.style.transition = `transform ${animDuration}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${animDuration}ms ease-out`;
          c.style.transform = `translate(${tx}px, ${ty}px) rotate(${angle}deg)`;
          c.style.opacity = '0';
        });
      });
    });

    // 9. Wait for animation to finish, then clean up canvases completely
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        canvases.forEach((c) => {
          if (c.parentNode) {
            c.parentNode.removeChild(c);
          }
        });
        element.style.visibility = originalVisibility;
        resolve();
      }, duration + 80);
    });
  } catch (err) {
    // Non-blocking fallback: if snapshotting fails (e.g. cross-origin image), resolve gracefully
    console.warn('[thanosSnap] Disintegration effect fallback:', err);
  }
}
