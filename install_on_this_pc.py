import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
import shutil
from typing import Optional

try:
    import winreg  # type: ignore
except ImportError:
    winreg = None


HOST_NAME = "com.your.savehost"
CHROME_HOST_REG = r"Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME
EDGE_HOST_REG = r"Software\\Microsoft\\Edge\\NativeMessagingHosts\\" + HOST_NAME


def find_repo_root() -> Path:
    return Path(__file__).resolve().parent


def find_native_host_manifest(root: Path) -> Path:
    manifest_path = root / "native-host" / "com.your.savehost.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Native host manifest not found: {manifest_path}")
    return manifest_path


def find_host_executable(root: Path) -> Path:
    candidates = [
        root / "native-host" / "save_host.exe",
        root / "native-host" / "dist" / "save_host.exe",
    ]
    for c in candidates:
        if c.exists():
            return c.resolve()
    raise FileNotFoundError("Could not find save_host.exe next to manifest or in native-host\\dist.")


def update_manifest_path(manifest_path: Path, exe_path: Path) -> None:
    with manifest_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data["path"] = str(exe_path)
    with manifest_path.open("w", encoding="ascii", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=True)
        f.write("\n")


def register_native_host_in_registry(manifest_path: Path, chrome: bool = True, edge: bool = True) -> None:
    if winreg is None:
        raise RuntimeError("winreg is not available. This script must run on Windows with Python for Windows.")
    manifest_str = str(manifest_path)
    to_write = []
    if chrome:
        to_write.append((winreg.HKEY_CURRENT_USER, CHROME_HOST_REG))
    if edge:
        to_write.append((winreg.HKEY_CURRENT_USER, EDGE_HOST_REG))
    for root, subkey in to_write:
        with winreg.CreateKeyEx(root, subkey, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, None, 0, winreg.REG_SZ, manifest_str)


def find_chrome_executable() -> str | None:
    if winreg is not None:
        reg_paths = [
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"),
        ]
        for root, sub in reg_paths:
            try:
                with winreg.OpenKey(root, sub) as k:
                    val, _ = winreg.QueryValueEx(k, None)
                    if val and Path(val).exists():
                        return val
            except FileNotFoundError:
                pass

    common_envs = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
    for env in common_envs:
        base = os.environ.get(env)
        if not base:
            continue
        candidate = Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe"
        if candidate.exists():
            return str(candidate)
    return None


def find_edge_executable() -> str | None:
    if winreg is not None:
        reg_paths = [
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"),
        ]
        for root, sub in reg_paths:
            try:
                with winreg.OpenKey(root, sub) as k:
                    val, _ = winreg.QueryValueEx(k, None)
                    if val and Path(val).exists():
                        return val
            except FileNotFoundError:
                pass
    common_envs = ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
    for env in common_envs:
        base = os.environ.get(env)
        if not base:
            continue
        candidate = Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        if candidate.exists():
            return str(candidate)
    return None


def launch_chrome_with_extension(chrome_exe: str, extension_dir: Path, new_window: bool) -> None:
    args = [
        chrome_exe,
        f"--load-extension={extension_dir}",
    ]
    if new_window:
        args.append("--new-window")
    # Open extensions page so user can verify it's loaded
    args.append("chrome://extensions/")
    try:
        subprocess.Popen(args)
    except Exception as e:
        print(f"Warning: Failed to launch Chrome with extension: {e}")


def update_allowed_origins(manifest_path: Path, extension_id: str) -> None:
    origin = f"chrome-extension://{extension_id}/"
    with manifest_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    allowed = data.get("allowed_origins") or []
    if origin not in allowed:
        allowed.append(origin)
        data["allowed_origins"] = allowed
        with manifest_path.open("w", encoding="ascii", newline="\n") as f:
            json.dump(data, f, indent=2, ensure_ascii=True)
            f.write("\n")


def print_menu() -> None:
    print()
    print("Choose an action:")
    print("  0) Run install (recommended)")
    print("  1) Update native host manifest path")
    print("  2) Register native host in registry (Chrome/Edge)")
    print("  3) Open Chrome extensions page")
    print("  4) Print extension folder path")
    print("  5) Set allowed_origins (enter extension ID)")
    print("  6) Scan for installed extension ID (profiles)")
    print("  7) Exit")


def find_chrome_profiles() -> list[Path]:
    candidates = []
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        base = Path(local_appdata) / "Google" / "Chrome" / "User Data"
        if base.exists():
            for child in base.iterdir():
                if child.is_dir() and (child.name == "Default" or child.name.startswith("Profile")):
                    candidates.append(child)
    return candidates


def scan_extension_ids_in_profile(profile_dir: Path) -> list[str]:
    results: list[str] = []
    ext_root = profile_dir / "Extensions"
    if not ext_root.exists():
        return results
    try:
        for ext_id_dir in ext_root.iterdir():
            if ext_id_dir.is_dir() and len(ext_id_dir.name) == 32:
                results.append(ext_id_dir.name)
    except Exception:
        pass
    return results


def find_edge_profiles() -> list[Path]:
    candidates: list[Path] = []
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        base = Path(local_appdata) / "Microsoft" / "Edge" / "User Data"
        if base.exists():
            for child in base.iterdir():
                if child.is_dir() and (child.name == "Default" or child.name.startswith("Profile")):
                    candidates.append(child)
    return candidates


def scan_all_extension_ids() -> set[str]:
    all_ids: set[str] = set()
    for p in find_chrome_profiles():
        all_ids.update(scan_extension_ids_in_profile(p))
    for p in find_edge_profiles():
        all_ids.update(scan_extension_ids_in_profile(p))
    return all_ids


def open_in_explorer(path: Path) -> None:
    try:
        subprocess.Popen(["explorer", str(path)])
    except Exception as e:
        print(f"Warning: Could not open Explorer at {path}: {e}")


def open_url_with_browser(exe_path: Optional[str], url: str) -> None:
    if exe_path:
        try:
            subprocess.Popen([exe_path, url])
            return
        except Exception as e:
            print(f"Warning: Failed to open {url} with {exe_path}: {e}")
    try:
        os.startfile(url)  # type: ignore[attr-defined]
    except Exception as e:
        print(f"Warning: Failed to open {url}: {e}")


def run_install_flow(
    manifest_path: Path,
    exe_path: Path,
    ext_dir: Path,
    register_chrome: bool,
    register_edge: bool,
) -> None:
    print("\n[1/4] Updating native host manifest path...")
    update_manifest_path(manifest_path, exe_path)
    print("Updated manifest path.")

    print("[2/4] Registering native host in registry...")
    if winreg is None:
        print("Skipping registry registration: winreg not available.")
    else:
        register_native_host_in_registry(manifest_path, chrome=register_chrome, edge=register_edge)
        print("Registered native host under HKCU for:")
        if register_chrome:
            print(f"  {CHROME_HOST_REG}")
        if register_edge:
            print(f"  {EDGE_HOST_REG}")

    print("[3/4] Please load the unpacked extension in your browser.")
    print(" - Extension folder:")
    print(f"   {ext_dir}")
    open_in_explorer(ext_dir)
    chrome_exe = find_chrome_executable()
    edge_exe = find_edge_executable()
    print(" - Opening extensions page (Chrome). If Chrome doesn't open, open chrome://extensions manually.")
    open_url_with_browser(chrome_exe, "chrome://extensions/")
    # Also open Edge page if requested
    if register_edge:
        print(" - Opening extensions page (Edge). If Edge doesn't open, open edge://extensions manually.")
        open_url_with_browser(edge_exe, "edge://extensions/")

    before_ids = scan_all_extension_ids()
    input("\nAfter you click 'Load unpacked' and select the folder, press Enter here...")
    after_ids = scan_all_extension_ids()
    new_ids = sorted(list(after_ids - before_ids))

    chosen_id: Optional[str] = None
    if len(new_ids) == 1:
        chosen_id = new_ids[0]
        print(f"Detected new extension ID: {chosen_id}")
    elif len(new_ids) > 1:
        print("Detected multiple new extension IDs:")
        for i, eid in enumerate(new_ids, start=1):
            print(f"  {i}) {eid}")
        sel = input("Choose one (number), or press Enter to paste manually: ").strip()
        if sel.isdigit():
            idx = int(sel) - 1
            if 0 <= idx < len(new_ids):
                chosen_id = new_ids[idx]

    if not chosen_id:
        manual = input("Paste the extension ID (or leave empty to skip): ").strip()
        if manual:
            chosen_id = manual

    if chosen_id:
        print("[4/4] Updating allowed_origins...")
        update_allowed_origins(manifest_path, chosen_id)
        print(f"Added origin: chrome-extension://{chosen_id}/")
    else:
        print("[4/4] Skipped allowed_origins update (no ID provided). You can run option 5 later.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up native host and load the extension for this PC.")
    parser.add_argument("--auto", action="store_true", help="Run automatic install flow (recommended)")
    parser.add_argument("--skip-launch", action="store_true", help="Do not launch Chrome after setup")
    parser.add_argument("--chrome", default=None, help="Path to chrome.exe if auto-detect fails")
    parser.add_argument("--no-edge", action="store_true", help="Skip Edge registry registration")
    parser.add_argument("--no-chrome-reg", action="store_true", help="Skip Chrome registry registration")
    parser.add_argument("--extension-id", default=None, help="If provided, set native host allowed_origins to this extension ID")
    parser.add_argument("--ext-dir", default=None, help="Path to the unpacked extension folder (defaults to 'SaveHelper Chrome Extension' under repo root)")
    parser.add_argument("--new-window", action="store_true", help="Launch Chrome in a new window")
    args = parser.parse_args()

    repo = find_repo_root()
    manifest_path = find_native_host_manifest(repo)
    exe_path = find_host_executable(repo)

    print(f"Repo: {repo}")
    print(f"Manifest: {manifest_path}")
    print(f"Host exe: {exe_path}")

    ext_dir = Path(args.ext_dir) if args.ext_dir else (repo / "SaveHelper Chrome Extension")
    chrome_exe = args.chrome or find_chrome_executable()

    if args.auto:
        run_install_flow(
            manifest_path=manifest_path,
            exe_path=exe_path,
            ext_dir=ext_dir,
            register_chrome=not args.no_chrome_reg,
            register_edge=not args.no_edge,
        )
        return 0

    while True:
        print_menu()
        choice = input("> ").strip()
        if choice == "1":
            update_manifest_path(manifest_path, exe_path)
            print("Updated manifest path.")
        elif choice == "2":
            if winreg is None:
                print("Registry not available on this Python. Skipping.")
            else:
                register_native_host_in_registry(
                    manifest_path,
                    chrome=not args.no_chrome_reg,
                    edge=not args.no_edge,
                )
                print("Registered native host for:")
                if not args.no_chrome_reg:
                    print(f"  HKCU\\{CHROME_HOST_REG}")
                if not args.no_edge:
                    print(f"  HKCU\\{EDGE_HOST_REG}")
        elif choice == "3":
            if not chrome_exe:
                print("Could not find chrome.exe automatically. Use --chrome to provide the path.")
            else:
                print("Opening Chrome extensions page...")
                try:
                    subprocess.Popen([chrome_exe, "chrome://extensions/"])
                except Exception as e:
                    print(f"Failed to open Chrome: {e}")
                print("Load your unpacked extension manually (Developer Mode → Load unpacked) from:")
                print(f"  {ext_dir}")
        elif choice == "4":
            print(f"Extension folder: {ext_dir}")
        elif choice == "5":
            manual_id = args.extension_id or input("Paste the extension ID (e.g., abcdef...): ").strip()
            if manual_id:
                update_allowed_origins(manifest_path, manual_id)
                print(f"Updated allowed_origins with: chrome-extension://{manual_id}/")
            else:
                print("No ID entered. Skipped.")
        elif choice == "6":
            print("Scanning Chrome profiles for extension IDs...")
            profiles = find_chrome_profiles()
            if not profiles:
                print("No Chrome profiles found under LOCALAPPDATA.")
            else:
                all_ids: set[str] = set()
                for p in profiles:
                    ids = scan_extension_ids_in_profile(p)
                    if ids:
                        print(f"Profile {p.name}: {', '.join(ids)}")
                        all_ids.update(ids)
                if all_ids:
                    use_id = input("Enter one of the IDs above to set allowed_origins (or blank to skip): ").strip()
                    if use_id and use_id in all_ids:
                        update_allowed_origins(manifest_path, use_id)
                        print(f"Updated allowed_origins with: chrome-extension://{use_id}/")
                    elif use_id:
                        print("That ID wasn't found in scan. Skipped.")
                else:
                    print("No extension IDs found in profiles.")
        elif choice == "0":
            run_install_flow(
                manifest_path=manifest_path,
                exe_path=exe_path,
                ext_dir=ext_dir,
                register_chrome=not args.no_chrome_reg,
                register_edge=not args.no_edge,
            )
        elif choice == "7":
            print("Exiting.")
            break
        else:
            print("Invalid choice. Enter 1-7.")

    return 0


if __name__ == "__main__":
    sys.exit(main())


