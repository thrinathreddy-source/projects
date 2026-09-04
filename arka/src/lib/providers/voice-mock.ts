import type {
  SynthesisRequest,
  SynthesisResult,
  VoiceProvider,
} from "@/lib/providers/voice-types";

/**
 * Zero-cost narration.
 *
 * Emits a real, playable 16-bit PCM WAV — one soft tone per word of the script,
 * pitched by voice. It is obviously a placeholder rather than speech, which is
 * the point: it proves the whole narration path (synthesis, storage, muxing,
 * playback, cost accounting) without a TTS bill or an API key, and nobody could
 * mistake the output for a finished product.
 */

const SAMPLE_RATE = 22_050;

/** Rough base pitch per catalog voice, so the voices are distinguishable. */
const VOICE_PITCH: Record<string, number> = {
  meera: 262,
  kavya: 330,
  arjun: 165,
  vikram: 131,
};

export class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock";
  readonly label = "Mock narration (no cost)";

  isConfigured(): boolean {
    return true;
  }

  supports(): boolean {
    return true;
  }

  estimateCostUsdMicro(): number {
    return 0;
  }

  modelFor(): string {
    return "mock/tone-narration";
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const wav = renderTones(request);
    const base64 = wav.toString("base64");

    return {
      url: `data:audio/wav;base64,${base64}`,
      contentType: "audio/wav",
      durationSec: request.targetDurationSec,
      sizeBytes: wav.byteLength,
      costUsdMicro: 0,
      model: this.modelFor(),
    };
  }
}

function renderTones(request: SynthesisRequest): Buffer {
  const duration = Math.max(1, request.targetDurationSec);
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Int16Array(totalSamples);

  const words = request.text.split(/\s+/).filter(Boolean);
  const basePitch = VOICE_PITCH[request.voiceId] ?? 220;

  if (words.length > 0) {
    // Spread the words across the clip so the audio lines up with the video
    // rather than bunching at the start.
    const slot = totalSamples / words.length;
    const toneLength = Math.min(slot * 0.6, SAMPLE_RATE * 0.18);

    words.forEach((word, index) => {
      // Vary pitch a little per word so it reads as speech-like cadence.
      const frequency = basePitch * (1 + ((word.length % 5) - 2) * 0.04);
      const start = Math.floor(index * slot);

      for (let n = 0; n < toneLength; n += 1) {
        const position = start + n;
        if (position >= totalSamples) break;

        // Raised-cosine envelope, so tones fade in and out instead of clicking.
        const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * n) / toneLength));
        const value = Math.sin((2 * Math.PI * frequency * n) / SAMPLE_RATE);

        // Quiet on purpose — this is a placeholder, not something to listen to.
        samples[position] = Math.round(value * envelope * 0.09 * 32767);
      }
    });
  }

  return encodeWav(samples);
}

/** Minimal canonical WAV container: RIFF / fmt / data, 16-bit mono PCM. */
function encodeWav(samples: Int16Array): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // subchunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }

  return buffer;
}
