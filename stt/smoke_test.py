"""Stream a 16 kHz mono PCM16 WAV to the deployed STT websocket in real time and report latency.

Usage: python smoke_test.py <wss-url> <file.wav>
"""

import asyncio
import json
import sys
import time
import wave

import websockets

CHUNK_SECS = 0.08


async def main(url: str, path: str) -> None:
    with wave.open(path) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2), "need 16 kHz mono PCM16"
        pcm = w.readframes(w.getnframes())
    chunk = int(16000 * CHUNK_SECS) * 2

    t_connect = time.perf_counter()
    async with websockets.connect(url, max_size=None, open_timeout=600) as ws:
        ready = json.loads(await ws.recv())
        t0 = time.perf_counter()
        print(f"ready after {t0 - t_connect:.1f}s: {ready}")

        first_text_at = None
        finals = []

        async def receive() -> None:
            nonlocal first_text_at
            async for msg in ws:
                now = time.perf_counter() - t0
                if msg == "END":
                    return
                data = json.loads(msg)
                if data.get("text") and first_text_at is None:
                    first_text_at = now
                if data.get("is_final") and data.get("text"):
                    # lag = wall time since stream start minus audio time the server says it has heard
                    finals.append((now, now - data["audio_timestamp"], data["text"]))
                    print(f"[{now:5.2f}s] FINAL lag={now - data['audio_timestamp']:.2f}s: {data['text']}")
                elif data.get("text"):
                    print(f"[{now:5.2f}s] partial: {data['text']}")

        receiver = asyncio.create_task(receive())
        for i in range(0, len(pcm), chunk):
            await ws.send(pcm[i:i + chunk])
            # pace to real time from the stream start, so drift doesn't accumulate
            await asyncio.sleep(max(0.0, t0 + (i // chunk + 1) * CHUNK_SECS - time.perf_counter()))
        audio_end = time.perf_counter() - t0
        await ws.send("END")
        await asyncio.wait_for(receiver, timeout=30)

    print(f"\naudio length {len(pcm) / 32000:.1f}s, sent by {audio_end:.1f}s")
    print(f"first text at {first_text_at:.2f}s after stream start" if first_text_at else "no text received")
    if finals:
        lags = sorted(lag for _, lag, _ in finals)
        print(f"finals: {len(finals)}, lag median {lags[len(lags) // 2]:.2f}s, max {lags[-1]:.2f}s")
    print("transcript:", " ".join(t for *_, t in finals))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
