const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rgbToTint = (red: number, green: number, blue: number) => {
  const darken = 0.58;
  const mutedRed = Math.round(red * darken);
  const mutedGreen = Math.round(green * darken);
  const mutedBlue = Math.round(blue * darken);
  return `rgba(${mutedRed}, ${mutedGreen}, ${mutedBlue}, 0.9)`;
};

const rgbToGlow = (red: number, green: number, blue: number) => {
  const shadowRed = Math.round(red * 0.72);
  const shadowGreen = Math.round(green * 0.72);
  const shadowBlue = Math.round(blue * 0.72);
  return [
    `0 0 0 1px rgba(${shadowRed}, ${shadowGreen}, ${shadowBlue}, 0.5)`,
    `0 0 44px rgba(${shadowRed}, ${shadowGreen}, ${shadowBlue}, 0.62)`,
    `0 0 120px rgba(${shadowRed}, ${shadowGreen}, ${shadowBlue}, 0.36)`,
  ].join(', ');
};

const getAverageThumbnailColor = async (src: string) => {
  if (typeof window === 'undefined') return null;

  return await new Promise<[number, number, number] | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 24;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];
          if (alpha < 16) continue;
          red += data[index];
          green += data[index + 1];
          blue += data[index + 2];
          count += 1;
        }

        if (!count) {
          resolve(null);
          return;
        }

        resolve([
          clamp(Math.round(red / count), 0, 255),
          clamp(Math.round(green / count), 0, 255),
          clamp(Math.round(blue / count), 0, 255),
        ]);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
};

export const getThumbnailTint = async (src: string, fallback = 'rgba(24, 24, 28, 0.78)') => {
  const average = await getAverageThumbnailColor(src);
  if (!average) return fallback;

  const [red, green, blue] = average;
  return rgbToTint(red, green, blue);
};

export const getThumbnailGlow = async (src: string, fallback = '0 0 0 1px rgba(255, 255, 255, 0.06)') => {
  const average = await getAverageThumbnailColor(src);
  if (!average) return fallback;

  const [red, green, blue] = average;
  return rgbToGlow(red, green, blue);
};
