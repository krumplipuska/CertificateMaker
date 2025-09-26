#!/usr/bin/env python3
import sys, struct, json, os, tempfile, traceback, uuid
from urllib.parse import urlparse, unquote
from urllib.request import url2pathname

def base_dir():
    # When frozen by PyInstaller, put the log next to the EXE.
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def log(msg):
    # logging removed per user request (no-op)
    return

def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        log("stdin closed (no length)")
        sys.exit(0)
    msg_len = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    if len(data) != msg_len:
        log(f"short read: expected {msg_len}, got {len(data)}")
        sys.exit(0)
    return json.loads(data.decode("utf-8", "ignore"))

def send_message(obj):
    out = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(out)))
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()

def file_url_to_path(file_url):
    p = urlparse(file_url)
    if p.scheme != "file":
        raise Exception("fileUrl must use file://")
    # Decode %20 etc and convert to a Windows path
    path = url2pathname(unquote(p.path))
    if os.name == "nt" and path.startswith(("\\", "/")) and len(path) > 3 and path[2] == ":":
        path = path[1:]
    return path

def atomic_write(path, text):
    d = os.path.dirname(path) or "."
    if not os.path.isdir(d):
        raise Exception(f"Directory does not exist: {d}")
    with tempfile.NamedTemporaryFile("w", delete=False, dir=d, encoding="utf-8") as tmp:
        tmp.write(text)
        tmp_path = tmp.name
    os.replace(tmp_path, path)

def main():
    # logging removed per user request (no-op)
    while True:
        try:
            msg = read_message()
            req_id = uuid.uuid4().hex[:8]
            log(f"req={req_id} keys={list(msg.keys())} type={msg.get('type')} fileUrl={msg.get('fileUrl')} html_len={len(msg.get('html') or '')}")
            if msg.get("type") != "save":
                send_message({ "ok": False, "error": "Unknown message type" })
                continue
            path = file_url_to_path(msg.get("fileUrl",""))
            html = msg.get("html","")
            log(f"req={req_id} saving to: {path}")
            if not path.lower().endswith(".html"):
                raise Exception("Only .html files allowed")
            atomic_write(path, html)
            send_message({ "ok": True, "path": path })
            log(f"req={req_id} save ok")
        except SystemExit:
            raise
        except Exception:
            err = traceback.format_exc()
            log("ERROR:\n" + err)
            try:
                send_message({ "ok": False, "error": err.splitlines()[-1] })
            except Exception:
                break

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # logging removed per user request (no-op)
        pass
