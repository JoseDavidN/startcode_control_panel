import { ffmpegArgs, planPlayback, type ProbeResult } from './media-plan';

const probe = (format: string, video?: [string, string?], audio?: string): ProbeResult => ({
  format: { format_name: format, duration: '120.5' },
  streams: [
    ...(video ? [{ codec_type: 'video', codec_name: video[0], pix_fmt: video[1] ?? 'yuv420p', height: 1080 }] : []),
    ...(audio ? [{ codec_type: 'audio', codec_name: audio }] : []),
  ],
});
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';
const MKV = 'matroska,webm';

describe('planPlayback', () => {
  it('MP4 con H.264 y AAC: directo, sin ffmpeg', () => {
    expect(planPlayback(probe(MP4, ['h264'], 'aac'), 'a.mp4', {})).toMatchObject({ mode: 'direct', duration: 120.5 });
  });

  it('MKV con H.264 y AC-3: se re-empaqueta y solo el audio se convierte', () => {
    expect(planPlayback(probe(MKV, ['h264'], 'ac3'), 'a.mkv', {})).toMatchObject({ mode: 'remux', video: 'copy', audio: 'aac' });
  });

  it('AVI con Xvid: se convierte a H.264', () => {
    expect(planPlayback(probe('avi', ['mpeg4'], 'mp3'), 'a.avi', {})).toMatchObject({ mode: 'transcode', video: 'h264', audio: 'copy' });
  });

  it('H.264 de 10 bits: se convierte', () => {
    expect(planPlayback(probe(MP4, ['h264', 'yuv420p10le'], 'aac'), 'a.mp4', {}).mode).toBe('transcode');
  });

  it('HEVC: directo si el webview lo admite, si no se convierte', () => {
    expect(planPlayback(probe(MP4, ['hevc'], 'aac'), 'a.mp4', { hevc: true }).mode).toBe('direct');
    expect(planPlayback(probe(MP4, ['hevc'], 'aac'), 'a.mp4', {}).mode).toBe('transcode');
    expect(planPlayback(probe(MKV, ['hevc'], 'aac'), 'a.mkv', { hevc: true })).toMatchObject({ mode: 'remux', hevcTag: true });
  });

  it('WebM: directo solo si el webview reproduce WebM', () => {
    expect(planPlayback(probe(MKV, ['vp9'], 'opus'), 'a.webm', { webm: true, vp9: true }).mode).toBe('direct');
    expect(planPlayback(probe(MKV, ['vp9'], 'opus'), 'a.webm', {})).toMatchObject({ mode: 'transcode', audio: 'aac' });
  });

  it('MP4 con audio que el webview no reproduce: se re-empaqueta', () => {
    expect(planPlayback(probe(MP4, ['h264'], 'ac3'), 'a.mp4', {})).toMatchObject({ mode: 'remux', audio: 'aac' });
  });
});

describe('ffmpegArgs', () => {
  it('salta con -ss antes de -i y sale como MP4 fragmentado', () => {
    const args = ffmpegArgs('/x.mkv', planPlayback(probe(MKV, ['h264'], 'aac'), 'x.mkv', {}), { start: 30, threads: 2, maxHeight: 1080, preset: 'superfast' });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy', '-c:a', 'copy', 'pipe:1']));
    expect(args.join(' ')).toContain('frag_keyframe+empty_moov');
  });

  it('al convertir limita hilos y alto', () => {
    const args = ffmpegArgs('/x.avi', planPlayback(probe('avi', ['mpeg4'], 'mp3'), 'x.avi', {}), { start: 0, threads: 3, maxHeight: 720, preset: 'superfast' });
    expect(args).not.toContain('-ss');
    expect(args).toEqual(expect.arrayContaining(['libx264', '-threads', '3', '-preset', 'superfast']));
    expect(args.join(' ')).toContain("min(720,ih)");
  });
});
