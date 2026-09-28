// Client-side audio forensics + conversion for uploads.
//
// Voice Memos on iOS has a "Lossless" quality setting that records ALAC
// (Apple Lossless) into a normal-looking .m4a — same extension, same
// audio/x-m4a MIME as an AAC memo, but only Safari can decode it. Chrome,
// Firefox, Edge, and Android all fail silently: the media element reports
// 0:00 and decodeAudioData throws. So uploads sniff the actual codec from
// the container bytes (works in every browser — it's just bytes) and, when
// the uploader's own browser can decode the file, convert it to WAV so every
// member can play it.

// Walk the MP4 box tree down to each track's stsd (sample description) box
// and collect the sample-entry fourccs ('mp4a' = AAC, 'alac' = Apple
// Lossless, …). A proper walk, not a byte-scan — 'alac' can occur by chance
// inside compressed audio data.
export function findMp4SampleCodecs(bytes: ArrayBuffer): string[] {
  const dv = new DataView(bytes);
  const codecs: string[] = [];
  const fourcc = (off: number): string =>
    String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));

  // Containers to descend into on the way to stsd.
  const DESCEND = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

  function walk(start: number, end: number): void {
    let off = start;
    while (off + 8 <= end) {
      let size = dv.getUint32(off);
      const type = fourcc(off + 4);
      let header = 8;
      if (size === 1) {
        if (off + 16 > end) return;
        size = Number(dv.getBigUint64(off + 8));
        header = 16;
      } else if (size === 0) {
        size = end - off; // box runs to end of enclosing scope
      }
      if (size < header || !Number.isFinite(size)) return; // corrupt — bail
      const boxEnd = Math.min(off + size, end);
      if (DESCEND.has(type)) {
        walk(off + header, boxEnd);
      } else if (type === 'stsd' && off + header + 8 <= boxEnd) {
        // stsd: version+flags (4 bytes), entry count (4), then sample entries.
        const count = dv.getUint32(off + header + 4);
        let entry = off + header + 8;
        for (let i = 0; i < count && entry + 8 <= boxEnd; i++) {
          const entrySize = dv.getUint32(entry);
          codecs.push(fourcc(entry + 4));
          if (entrySize < 8) break;
          entry += entrySize;
        }
      }
      off += size;
    }
  }

  try {
    walk(0, dv.byteLength);
  } catch {
    // Malformed container — treat as "no codecs found"; the caller falls
    // back to its normal path.
  }
  return codecs;
}

export function isMp4Container(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  const dv = new DataView(bytes);
  return (
    String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7)) === 'ftyp'
  );
}

// Encode a decoded AudioBuffer as 16-bit PCM WAV — no dependencies, plays in
// every browser. Bigger than AAC on disk, but tracks are private and the
// upload cap (250 MB) dwarfs any real recording.
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(out);
  const writeAscii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  dv.setUint32(40, dataSize, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

// Decode + codec-sniff a file ahead of upload (shared by the Song Club track
// form and both Yellow Ostrich upload flows): peaks/duration for the waveform
// player, and an ALAC→WAV swap when the file would only play in Safari.
// Throws with an actionable fix when the file is ALAC and this browser can't
// decode it either; decode failures on non-ALAC files stay best-effort (null
// peaks, the player falls back to the native element).
export async function prepareAudioForUpload(
  f: File
): Promise<{ uploadFile: File; peaks: number[] | null; durationSeconds: number | null }> {
  const bytes = await f.arrayBuffer();
  const alac = isMp4Container(bytes) && findMp4SampleCodecs(bytes).includes('alac');

  let decoded: AudioBuffer | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      decoded = await ctx.decodeAudioData(bytes);
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch {
    decoded = null;
  }

  if (alac) {
    if (!decoded) {
      throw new Error(
        'This is an Apple Lossless recording, which won’t play on Chrome or Android. ' +
          'In Voice Memos, set Settings → Voice Memos → Audio Quality to “Compressed”, ' +
          'or convert the file to mp3/wav and upload that.'
      );
    }
    const wav = audioBufferToWav(decoded);
    const uploadFile = new File([wav], f.name.replace(/\.[^.]+$/, '') + '.wav', {
      type: 'audio/wav',
    });
    return {
      uploadFile,
      peaks: computePeaksFromBuffer(decoded),
      durationSeconds: decoded.duration,
    };
  }

  return {
    uploadFile: f,
    peaks: decoded ? computePeaksFromBuffer(decoded) : null,
    durationSeconds: decoded ? decoded.duration : null,
  };
}

// Downsample a decoded buffer to a compact peak array for the waveform
// player (drawn without re-downloading/decoding the audio on every view).
export function computePeaksFromBuffer(buffer: AudioBuffer, samples = 800): number[] {
  const channel = buffer.getChannelData(0);
  const block = Math.floor(channel.length / samples) || 1;
  const peaks: number[] = [];
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(channel[start + j] || 0);
      if (v > max) max = v;
    }
    peaks.push(Math.round(max * 1000) / 1000);
  }
  // Normalize so the loudest peak fills the height.
  const peak = Math.max(...peaks, 0.01);
  return peaks.map((p) => Math.round((p / peak) * 1000) / 1000);
}
