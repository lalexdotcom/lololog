#!/usr/bin/env python3
"""Give every Claude transcript back its real date. Written to run as a SessionStart hook.

A Claude Code update, which every container rebuild brings, rewrites transcript files in
bulk (observed once: dozens of files pushed up to ten days into the future, clustered on a
handful of exact instants). The file's mtime then says when the migration ran, not when the
conversation happened — which breaks sorting, `find -mtime`, and any judgement about a
session's age.

The real date is inside the file: every message record carries an ISO `timestamp`, and the
log is append-only, so the LAST timestamp is the conversation's last activity. This hook
re-derives it and resets the mtime.

Cost control: a full parse of every transcript would read hundreds of MB at each session
start. Instead each file is stat'ed, and only files whose (size, mtime) differ from what the
cache recorded are opened — and then only their last 64 KiB is scanned by regex. Steady state
is one stat per transcript.

Never fails a session: every error path exits 0.
"""

import datetime
import json
import os
import re
import sys
import time

TAIL_BYTES = 64 * 1024
TOLERANCE_SECONDS = 3600  # a bulk rewrite drifts by days; an hour of slack costs nothing
LIVE_GRACE_SECONDS = 60  # a file written this recently is probably still being appended to
TIMESTAMP = re.compile(rb'"timestamp":"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"')


def last_timestamp(path, size):
    """The last ISO timestamp in the file, as epoch seconds, or None."""
    try:
        with open(path, "rb") as handle:
            if size > TAIL_BYTES:
                handle.seek(-TAIL_BYTES, os.SEEK_END)
            chunk = handle.read()
            found = TIMESTAMP.findall(chunk)
            if not found and size > TAIL_BYTES:
                # A transcript whose tail carries no timestamped record — read it whole.
                handle.seek(0)
                found = TIMESTAMP.findall(handle.read())
    except OSError:
        return None
    if not found:
        return None
    try:
        # Parsed as explicit UTC, never through local time: time.mktime would read the
        # stamp in whatever TZ the container happens to carry, and its DST offset too.
        naive = datetime.datetime.strptime(found[-1].decode()[:19], "%Y-%m-%dT%H:%M:%S")
        return naive.replace(tzinfo=datetime.timezone.utc).timestamp()
    except ValueError:
        return None


def main():
    config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
    if not config_dir:
        # Deliberately NO fallback to ~/.claude: this devcontainer keeps the config on a
        # separate volume, and guessing the wrong tree would silently do nothing at best.
        return
    projects = os.path.join(config_dir, "projects")
    if not os.path.isdir(projects):
        return

    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    live_session = payload.get("session_id") or ""

    cache_path = os.path.join(config_dir, ".transcript-dates-cache.json")
    try:
        with open(cache_path) as handle:
            cache = json.load(handle)
    except Exception:
        cache = {}

    now = time.time()
    fixed = 0
    seen = {}

    for root, _dirs, files in os.walk(projects):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            if live_session and name.startswith(live_session):
                continue
            path = os.path.join(root, name)
            try:
                info = os.stat(path)
            except OSError:
                continue
            age = now - info.st_mtime
            # Only a file touched in the recent PAST may still be being appended to. The
            # bug this hook exists for pushes mtimes into the FUTURE, where `age` goes
            # negative — an unguarded `age < GRACE` skipped exactly those files.
            if 0 <= age < LIVE_GRACE_SECONDS:
                continue

            fingerprint = f"{info.st_size}:{info.st_mtime_ns}"
            if cache.get(path) == fingerprint:
                seen[path] = fingerprint
                continue

            real = last_timestamp(path, info.st_size)
            if real is None:
                seen[path] = fingerprint
                continue
            if abs(real - info.st_mtime) <= TOLERANCE_SECONDS:
                seen[path] = fingerprint
                continue

            try:
                os.utime(path, (real, real))
                fixed += 1
                seen[path] = f"{info.st_size}:{os.stat(path).st_mtime_ns}"
            except OSError:
                seen[path] = fingerprint

    try:
        with open(cache_path, "w") as handle:
            json.dump(seen, handle)
    except OSError:
        pass

    if fixed:
        print(json.dumps({"systemMessage": f"Restored the real date of {fixed} transcript file(s)."}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # A hook must never be why a session fails to start.
        pass
