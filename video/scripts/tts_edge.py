"""
Narration with a Microsoft neural voice (default en-US-AvaNeural) through edge-tts.

    python tts_edge.py lines.json out_dir [voice] [rate]

lines.json is a list of {"id": ..., "text": ...}; each line is written to out_dir/<id>.mp3.
The service is asked for 96 kbps audio instead of the library's 48 kbps default.
"""
import asyncio, inspect, json, os, sys
import edge_tts.communicate as communicate

# Re-run the module with the higher-bitrate output format; nothing on disk is changed.
source = inspect.getsource(communicate).replace("audio-24khz-48kbitrate-mono-mp3", "audio-24khz-96kbitrate-mono-mp3")
exec(compile(source, communicate.__file__, "exec"), communicate.__dict__)

lines_file, out_dir = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "en-US-AvaNeural"
rate = sys.argv[4] if len(sys.argv) > 4 else "+6%"


async def main():
    os.makedirs(out_dir, exist_ok=True)
    for line in json.load(open(lines_file)):
        for attempt in range(4):
            try:
                await communicate.Communicate(line["text"], voice, rate=rate).save(os.path.join(out_dir, f"{line['id']}.mp3"))
                break
            except Exception as error:  # the service occasionally drops a connection
                if attempt == 3:
                    raise
                print(f"retrying {line['id']}: {error}", file=sys.stderr, flush=True)
                await asyncio.sleep(1.5)
        print(line["id"], flush=True)

asyncio.run(main())
