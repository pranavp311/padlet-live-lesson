// Client for the Modal speech-to-text websocket (stt/nemotron_asr).
// The server sends append-only text pieces: {"text": " next words", "is_final": false, "audio_timestamp": s}.
// After a pause it also sends {"is_final": true, "text": <the whole phrase again, unpunctuated>}; we use that
// only as a "the teacher paused" signal, since the pieces already hold the text.
// Audio sent before the server says Ready is held here, so speech during a cold start isn't lost.

const STT_WS = process.env.NEXT_PUBLIC_STT_WS!;

// Any HTTP request to the app boots a GPU container; the Ready screen calls this on load.
export function warmStt() {
  void fetch(STT_WS.replace(/^wss:/, "https:").replace(/\/ws$/, "/"), { mode: "no-cors" }).catch(() => {});
}

export type Stt = { send: (pcm: ArrayBuffer) => void; end: () => Promise<void>; close: () => void };

export function connectStt(handlers: {
  onReady: () => void;
  onText: (piece: string, audioSecs: number) => void;
  onPause: () => void;
  onClose: (error?: string) => void;
}): Stt {
  const ws = new WebSocket(STT_WS);
  ws.binaryType = "arraybuffer";
  const held: ArrayBuffer[] = [];
  let ready = false;
  let ended: (() => void) | null = null;

  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    if (e.data === "END") {
      ended?.();
      ws.close();
      return;
    }
    const msg = JSON.parse(e.data);
    if (msg.type === "Ready") {
      ready = true;
      held.splice(0).forEach((f) => ws.send(f));
      handlers.onReady();
    } else if (msg.is_final) {
      if (msg.text) handlers.onPause();
    } else if (msg.text) {
      handlers.onText(msg.text, msg.audio_timestamp ?? 0);
    }
  };
  ws.onclose = (e) => {
    ended?.();
    handlers.onClose(e.wasClean ? undefined : "Connection lost");
  };

  return {
    send(pcm) {
      if (ws.readyState > WebSocket.OPEN) return; // closing or closed: nothing will flush the hold
      if (ready && ws.readyState === WebSocket.OPEN) ws.send(pcm);
      else held.push(pcm);
    },
    end() {
      return new Promise((resolve) => {
        if (!ready || ws.readyState !== WebSocket.OPEN) {
          ws.close();
          return resolve();
        }
        ended = resolve;
        // The server only feeds audio to the model in ~560 ms batches and stops replying once it
        // echoes END, so 1.2 s of silence first pushes the last real words through.
        for (let i = 0; i < 15; i++) ws.send(new ArrayBuffer(2560));
        ws.send("END");
        setTimeout(resolve, 4000);
      });
    },
    close() {
      ws.close();
    },
  };
}
