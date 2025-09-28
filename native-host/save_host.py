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
            t = msg.get("type")
            log(f"req={req_id} keys={list(msg.keys())} type={t} fileUrl={msg.get('fileUrl')} html_len={len(msg.get('html') or '')}")

            if t == "save":
                path = file_url_to_path(msg.get("fileUrl",""))
                html = msg.get("html","")
                log(f"req={req_id} saving to: {path}")
                if not path.lower().endswith(".html"):
                    raise Exception("Only .html files allowed")
                atomic_write(path, html)
                send_message({ "ok": True, "path": path })
                log(f"req={req_id} save ok")
                continue

            if t == "rename":
                old_path = file_url_to_path(msg.get("fileUrl",""))
                new_base = str(msg.get("newBaseName") or "").strip()
                if not new_base:
                    raise Exception("Missing newBaseName")
                # Basic sanitization: allow letters, numbers, spaces, dashes, underscores, dots; collapse spaces; trim dots
                import re
                safe = re.sub(r"[^A-Za-z0-9 _\-\.]+", "", new_base)
                safe = re.sub(r"\s+", " ", safe).strip().strip('.')
                if not safe:
                    raise Exception("Invalid name")
                # Ensure .html extension
                if not safe.lower().endswith('.html'):
                    safe += '.html'
                new_path = os.path.join(os.path.dirname(old_path), safe)
                if os.path.abspath(new_path) == os.path.abspath(old_path):
                    send_message({ "ok": True, "path": old_path, "newPath": new_path, "fileUrl": msg.get("fileUrl") })
                    continue
                if os.path.exists(new_path):
                    # If target exists and is same file ignoring case (Windows), consider it a no-op
                    try:
                        same = os.path.samefile(old_path, new_path)
                    except Exception:
                        same = os.path.normcase(os.path.abspath(old_path)) == os.path.normcase(os.path.abspath(new_path))
                    if same:
                        from pathlib import Path
                        new_url = Path(new_path).resolve().as_uri()
                        send_message({ "ok": True, "path": new_path, "newFileUrl": new_url })
                        continue
                    raise Exception("File already exists")
                os.replace(old_path, new_path)
                # Build correct file:// URL for response (handles Windows drive letters)
                from pathlib import Path
                new_url = Path(new_path).resolve().as_uri()
                send_message({ "ok": True, "path": new_path, "newFileUrl": new_url })
                continue

            send_message({ "ok": False, "error": "Unknown message type" })
            continue
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
