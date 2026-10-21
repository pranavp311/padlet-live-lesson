export type Mic = { stop: () => void };

// Captures the mic as 16 kHz PCM16 frames of 80 ms. `onFrame` gets each frame and its RMS level (0–1).
export async function startMic(onFrame: (pcm: ArrayBuffer, level: number) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let ctx: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode;
  let node: AudioWorkletNode;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, "pcm-worklet");
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    throw e;
  }
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => onFrame(e.data.pcm, e.data.level);
  source.connect(node);

  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
