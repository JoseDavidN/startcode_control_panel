/**
 * Cómo reproducir un video en el webview con el menor trabajo posible:
 *
 * - `direct`: el webview ya lo reproduce. Se sirve el archivo a tramos, sin ffmpeg.
 * - `remux`: los códecs valen pero el contenedor no (MKV, AVI, TS… con
 *   H.264). ffmpeg solo re-empaqueta a MP4 (`-c copy`): casi no gasta CPU.
 *   El audio se convierte a AAC si hace falta, que es barato.
 * - `transcode`: el video no lo decodifica el webview (MPEG-4/Xvid, WMV,
 *   MPEG-2, H.264 de 10 bits, HEVC donde no hay soporte…). Se convierte a
 *   H.264, la única opción pesada.
 */

export type PlaybackMode = 'direct' | 'remux' | 'transcode';

/** Lo que el webview dice poder reproducir (`canPlayType`), además de H.264 y AAC. */
export interface ClientCaps {
  hevc?: boolean;
  vp9?: boolean;
  av1?: boolean;
  webm?: boolean;
}

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  height?: number;
}

export interface ProbeResult {
  format?: { format_name?: string; duration?: string };
  streams?: ProbeStream[];
}

export interface PlaybackPlan {
  mode: PlaybackMode;
  /** Pista de video: copiarla, convertirla a H.264 o no hay. */
  video: 'copy' | 'h264' | 'none';
  audio: 'copy' | 'aac' | 'none';
  /** `-tag:v hvc1`: Safari/WebKit solo reproduce HEVC en MP4 con esa etiqueta. */
  hevcTag: boolean;
  duration: number | null;
}

const MP4_FAMILY = /(^|,)(mov|mp4|m4a|3gp|3g2|mj2)(,|$)/;
const EIGHT_BIT_420 = new Set(['yuv420p', 'yuvj420p']);

function videoCopyable(s: ProbeStream, caps: ClientCaps): boolean {
  switch (s.codec_name) {
    /* H.264 de 10 bits o 4:2:2 no lo decodifica ningún navegador. */
    case 'h264': return EIGHT_BIT_420.has(s.pix_fmt ?? 'yuv420p');
    case 'hevc': return Boolean(caps.hevc) && (EIGHT_BIT_420.has(s.pix_fmt ?? '') || s.pix_fmt === 'yuv420p10le');
    case 'av1': return Boolean(caps.av1);
    case 'vp9': return Boolean(caps.vp9);
    default: return false;
  }
}

/* Audio que va tal cual dentro de MP4 en todos los webviews. */
const MP4_AUDIO = new Set(['aac', 'mp3']);
const WEBM_VIDEO = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO = new Set(['opus', 'vorbis']);

export function planPlayback(probe: ProbeResult, fileName: string, caps: ClientCaps): PlaybackPlan {
  const streams = probe.streams ?? [];
  const v = streams.find(s => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
  const a = streams.find(s => s.codec_type === 'audio');
  const format = probe.format?.format_name ?? '';
  const parsed = Number(probe.format?.duration);
  const duration = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const hevcTag = v?.codec_name === 'hevc';

  if (v && MP4_FAMILY.test(format) && videoCopyable(v, caps) && (!a || MP4_AUDIO.has(a.codec_name ?? ''))) {
    return { mode: 'direct', video: 'copy', audio: a ? 'copy' : 'none', hevcTag: false, duration };
  }
  if (
    v && /\.webm$/i.test(fileName) && /webm/.test(format) && caps.webm &&
    WEBM_VIDEO.has(v.codec_name ?? '') && (v.codec_name === 'vp8' || videoCopyable(v, caps)) &&
    (!a || WEBM_AUDIO.has(a.codec_name ?? ''))
  ) {
    return { mode: 'direct', video: 'copy', audio: a ? 'copy' : 'none', hevcTag: false, duration };
  }

  const audio = !a ? 'none' : MP4_AUDIO.has(a.codec_name ?? '') ? 'copy' : 'aac';
  if (!v) return { mode: 'remux', video: 'none', audio, hevcTag: false, duration };
  if (videoCopyable(v, caps)) return { mode: 'remux', video: 'copy', audio, hevcTag, duration };
  return { mode: 'transcode', video: 'h264', audio, hevcTag: false, duration };
}

/**
 * Argumentos de ffmpeg para el MP4 fragmentado que se envía mientras se
 * genera (empieza a verse con el primer fragmento). `start` salta antes de
 * leer (`-ss` de entrada, rápido): el reproductor suma ese desfase.
 */
export function ffmpegArgs(input: string, plan: PlaybackPlan, opts: { start: number; threads: number; maxHeight: number; preset: string }): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (opts.start > 0) args.push('-ss', opts.start.toFixed(3));
  args.push('-i', input);
  if (plan.video !== 'none') args.push('-map', '0:v:0');
  if (plan.audio !== 'none') args.push('-map', '0:a:0');
  args.push('-sn', '-dn');

  if (plan.video === 'copy') {
    args.push('-c:v', 'copy');
    if (plan.hevcTag) args.push('-tag:v', 'hvc1');
  } else if (plan.video === 'h264') {
    args.push(
      /* `zerolatency` quita la espera de fotogramas futuros: arranca antes y gasta menos. */
      '-c:v', 'libx264', '-preset', opts.preset, '-tune', 'zerolatency', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      /* Sin agrandar: solo baja lo que pase del alto máximo; ancho par. */
      '-vf', `scale=-2:'min(${opts.maxHeight},ih)'`,
      /* Un fotograma clave cada 2 s: fragmentos cortos, el video empieza antes. */
      '-force_key_frames', 'expr:gte(t,n_forced*2)',
      '-threads', String(opts.threads),
    );
  }
  if (plan.audio === 'copy') args.push('-c:a', 'copy');
  else if (plan.audio === 'aac') args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');

  args.push(
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1',
  );
  return args;
}
