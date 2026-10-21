// Client for the Modal speech-to-text websocket (stt/nemotron_asr).
// The server sends append-only text pieces: {"text": " next words", "is_final": false, "audio_timestamp": s}.
// After a pause it also sends {"is_final": true, "text": <the whole phrase again, unpunctuated>}; we use that
// only as a "the teacher paused" signal, since the pieces already hold the text.
// Audio sent before the server says Ready is held here, so speech during a cold start isn't lost.
// After a cold start the server works through that backlog faster than real time; onCatchUp reports how far it
// has got, so the UI can show the held speech as one chunk instead of a slow stream.

const STT_WS = process.env.NEXT_PUBLIC_STT_WS!;
// At End, give up if the server sends nothing for this long. Batches during a cold-start catch-up can be
// several seconds apart, and the server itself waits up to 60 s to drain, so this is generous.
const IDLE_MS = 15000;

// Any HTTP request to the app boots a GPU container; the Ready screen calls this on load.
export function warmStt() {
  void fetch(STT_WS.replace(/^wss:/, "https:").replace(/\/ws$/, "/"), { mode: "no-cors" }).catch(() => {});
}

const FRAME_S = 0.08; // mic.ts sends 80 ms frames
const CAUGHT_UP_S = 1.5; // live text runs ~0.9 s behind the audio sent; within this the backlog is done

export type Stt = { send: (pcm: ArrayBuffer) => void; end: () => Promise<void>; close: () => void };

export function connectStt(handlers: {
  onReady: () => void;
  onText: (piece: string, audioSecs: number) => void;
  onPause: () => void;
  onCatchUp: (progress: number) => void; // 0 at Ready if speech was held, then rising, 1 once caught up
  onClose: (error?: string) => void;
}): Stt {
  const ws = new WebSocket(STT_WS);
  ws.binaryType = "arraybuffer";
  const held: ArrayBuffer[] = [];
  let ready = false;
  let frames = 0; // every frame handed to send(), held or not
  let catchingUp = false;
  let ended: (() => void) | null = null;
  let closedByUs = false;
  let idle: ReturnType<typeof setTimeout> | undefined;

  ws.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    if (ended) {
      // Ending: the server may still be catching up, so keep waiting while text keeps coming.
      clearTimeout(idle);
      idle = setTimeout(stop, IDLE_MS);
    }
    if (e.data === "END") {
      stop();
      return;
    }
    const msg = JSON.parse(e.data);
    if (msg.type === "Ready") {
      ready = true;
      const heldSecs = held.length * FRAME_S;
      catchingUp = heldSecs > CAUGHT_UP_S;
      held.splice(0).forEach((f) => ws.send(f));
      handlers.onReady();
      if (catchingUp) {
        handlers.onCatchUp(0);
        // A warm L4 clears a backlog ~4.5x faster than real time; if it hasn't within the held time, it's
        // struggling, so show what has arrived rather than hide the transcript, and let the rest stream in.
        setTimeout(() => {
          if (!catchingUp) return;
          catchingUp = false;
          handlers.onCatchUp(1);
        }, heldSecs * 1000);
      }
      return;
    }
    if (catchingUp) {
      // Every message, even an empty one sent during silence, says how much audio has been processed.
      const done = msg.audio_timestamp ?? 0;
      const target = frames * FRAME_S - CAUGHT_UP_S;
      catchingUp = done < target;
      handlers.onCatchUp(catchingUp ? done / target : 1);
    }
    if (msg.is_final) {
      if (msg.text) handlers.onPause();
    } else if (msg.text) {
      handlers.onText(msg.text, msg.audio_timestamp ?? 0);
    }
  };
  ws.onclose = () => {
    ended?.();
    // Any close we didn't ask for is a lost lesson connection, even a "clean" one from the server.
    handlers.onClose(closedByUs ? undefined : "Connection lost");
  };

  function stop() {
    closedByUs = true;
    clearTimeout(idle);
    ws.close();
    ended?.();
  }

  return {
    send(pcm) {
      if (ws.readyState > WebSocket.OPEN) return; // closing or closed: nothing will flush the hold
      frames++;
      if (ready && ws.readyState === WebSocket.OPEN) ws.send(pcm);
      else held.push(pcm);
    },
    end() {
      return new Promise((resolve) => {
        if (!ready || ws.readyState !== WebSocket.OPEN) {
          stop();
          return resolve();
        }
        ended = () => {
          ended = null;
          resolve();
        };
        // The server feeds audio to the model in ~560 ms batches, so 1.2 s of silence pushes the
        // last real words through. It echoes END once it has processed everything.
        for (let i = 0; i < 15; i++) ws.send(new ArrayBuffer(2560));
        closedByUs = true;
        ws.send("END");
        idle = setTimeout(stop, IDLE_MS);
      });
    },
    close: stop,
  };
}
