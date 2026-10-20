import { hasThumbnail, nativeFallback, NATIVE_FALLBACK_MAX_BYTES, thumbFormat, thumbnailArgs } from '@/files/thumbnail-plan';

describe('thumbnail-plan', () => {
  it('solo imágenes y videos tienen miniatura', () => {
    expect(hasThumbnail('foto.JPG')).toBe(true);
    expect(hasThumbnail('clip.mkv')).toBe(true);
    expect(hasThumbnail('cancion.mp3')).toBe(false);
    expect(hasThumbnail('notas.txt')).toBe(false);
  });

  it('PNG para formatos con transparencia y JPEG para el resto y los videos', () => {
    expect(thumbFormat('logo.png')).toBe('png');
    expect(thumbFormat('icono.svg')).toBe('png');
    expect(thumbFormat('foto.jpeg')).toBe('jpg');
    expect(thumbFormat('video.webm')).toBe('jpg');
  });

  it('sin ffmpeg solo envía el original de imágenes que pinta el webview y no son enormes', () => {
    expect(nativeFallback('foto.jpg', 1000)).toBe(true);
    expect(nativeFallback('foto.jpg', NATIVE_FALLBACK_MAX_BYTES + 1)).toBe(false);
    expect(nativeFallback('dibujo.svg', 1000)).toBe(false);
    expect(nativeFallback('foto.heic', 1000)).toBe(false);
    expect(nativeFallback('clip.mp4', 1000)).toBe(false);
  });

  it('un fotograma reducido sin deformar; el salto va antes de -i', () => {
    const args = thumbnailArgs('/s/a.mp4', '/c/x.part', 'jpg', 3);
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2']));
    expect(args.join(' ')).toContain('force_original_aspect_ratio=decrease');
    expect(args[args.length - 1]).toBe('/c/x.part');
    expect(thumbnailArgs('/s/a.png', '/c/x.part', 'png', 0)).not.toContain('-ss');
    expect(thumbnailArgs('/s/a.png', '/c/x.part', 'png', 0)).toEqual(expect.arrayContaining(['-c:v', 'png']));
  });
});
