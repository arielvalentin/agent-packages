"""Capture a literal attestation from a foreground POSIX controlling terminal."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import sys


EXPECTED = b"I, arielvalentin, do hereby authorize this agent to override my human-interaction-safeguard skill."
PROMPT = b"Reply (Ctrl-D submits; Ctrl-C cancels): "
RETRY = b"You must enter the attestation exactly, without quotation marks."
MAX_REQUEST_BYTES = 16384


def canonical_request(request: dict) -> bytes:
    def text(value):
        return isinstance(value, str) and bool(value) and not value.isspace()

    if not isinstance(request, dict) or set(request) != {"session", "request", "chain_revision", "action"}:
        raise ValueError("Only session, request, chain_revision, and one action are allowed.")
    if not all(text(request.get(k)) for k in ("session", "request", "chain_revision")):
        raise ValueError("Pending session, request, and chain revision are required.")
    action = request.get("action")
    if not isinstance(action, dict):
        raise ValueError("One pending action object is required.")
    if action.get("operation") not in ("draft", "research", "implement", "post", "resolve"):
        raise ValueError("One supported operation is required.")
    allowed = {"operation", "repository", "item", "thread", "review", "comment"}
    if action["operation"] != "resolve":
        allowed.add("content")
    if set(action) - allowed:
        raise ValueError("Unknown action fields or a resolution reply payload are not allowed.")
    if not text(action.get("repository")) or type(action.get("item")) is not int or action["item"] <= 0:
        raise ValueError("A concrete repository and item are required.")
    locators = {"thread": text, "review": text, "comment": lambda v: type(v) is int and v > 0}
    if any(k in action and not valid(action[k]) for k, valid in locators.items()):
        raise ValueError("Supplied target identifiers must be concrete.")
    if action["operation"] == "resolve":
        if not text(action.get("thread")):
            raise ValueError("Resolution requires a thread.")
    elif not text(action.get("content")) or not any(valid(action.get(k)) for k, valid in locators.items()):
        raise ValueError("The action requires target identifiers and bounded content/scope.")
    data = json.dumps(request, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")
    if len(data) > MAX_REQUEST_BYTES:
        raise ValueError("The canonical pending request exceeds 16 KiB.")
    return data


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate pending-request JSON keys are not allowed.")
        result[key] = value
    return result


def load_request(path: Path) -> bytes:
    with path.open("rb") as source:
        data = source.read(MAX_REQUEST_BYTES + 1)
    if len(data) > MAX_REQUEST_BYTES:
        raise ValueError("The pending-request file exceeds 16 KiB.")
    return canonical_request(json.loads(data.decode("utf-8"), object_pairs_hook=unique_keys))


def write_all(fd: int, data: bytes):
    remaining = memoryview(data)
    while remaining:
        written = os.write(fd, remaining)
        if written <= 0:
            raise OSError("The terminal did not accept the complete message.")
        remaining = remaining[written:]


def matches(body: bytes) -> bool:
    if not isinstance(body, bytes):
        raise TypeError("The comparison requires original bytes.")
    return body == EXPECTED


def read_body(fd: int) -> tuple[bytes | None, int]:
    body = bytearray()
    count = 0
    while True:
        char = os.read(fd, 1)
        if not char:
            raise OSError("Interactive input closed before submission.")
        if char == b"\x03":
            raise KeyboardInterrupt
        if char == b"\x04":
            return (bytes(body) if count <= len(EXPECTED) else None), count
        count += 1
        if count <= len(EXPECTED):
            body.extend(char)
        # Overlong submissions are rejected outright, never compared as a prefix.
        shown = char if 32 <= char[0] <= 126 else f"<{char[0]:02X}>".encode("ascii")
        write_all(fd, shown)


def capture(fd: int, pending: bytes, binding: str, verification_id: str) -> int:
    import termios

    heading = (
        f"Pending request: {pending.decode('ascii')}\r\n"
        f"Binding: {binding}\r\nVerification: {verification_id}\r\n"
        f"Verifier PID: {os.getpid()}\r\n"
        "Enter the sentence below. Ctrl-D submits; Enter and editing keys are data.\r\n"
    ).encode("ascii")
    first = True
    while True:
        previous = termios.tcgetattr(fd)
        try:
            raw = previous[:]
            raw[6] = previous[6][:]
            for name in ("IGNBRK", "BRKINT", "IGNPAR", "PARMRK", "INPCK", "ISTRIP",
                         "INLCR", "IGNCR", "ICRNL", "IXON", "IXOFF", "IXANY", "IUCLC"):
                raw[0] &= ~getattr(termios, name, 0)
            raw[1] &= ~termios.OPOST
            raw[2] = (raw[2] & ~(termios.CSIZE | termios.PARENB)) | termios.CS8
            raw[3] &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN)
            raw[6][termios.VMIN], raw[6][termios.VTIME] = 1, 0
            termios.tcsetattr(fd, termios.TCSANOW, raw)
            termios.tcflush(fd, termios.TCIFLUSH)
            write_all(fd, heading if first else RETRY + b"\r\n")
            write_all(fd, EXPECTED + b"\r\n" + PROMPT)
            body, count = read_body(fd)
            write_all(fd, b"\r\n")
        finally:
            termios.tcsetattr(fd, termios.TCSAFLUSH, previous)
        if body is not None and matches(body):
            return count
        first = False


def cancel(_signum, _frame):
    raise KeyboardInterrupt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path, help="Private pending-request JSON metadata, never a reply body.")
    parser.add_argument("--output", required=True, type=Path, help="New absolute private verification-record path.")
    args = parser.parse_args()
    if not args.output.is_absolute():
        parser.error("The output path must be absolute.")

    terminal = record_fd = created = None
    exit_code = 2
    try:
        if os.name != "posix" or not sys.stdin.isatty():
            raise OSError("A directly user-controlled foreground POSIX terminal is required.")
        terminal = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
        if not os.isatty(terminal) or os.tcgetpgrp(terminal) != os.getpgrp():
            raise OSError("The verifier must own its controlling terminal's foreground.")
        pending = load_request(args.request)
        binding = hashlib.sha256(pending).hexdigest()
        record_fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        info = os.fstat(record_fd)
        created = (info.st_dev, info.st_ino)
        verification_id = secrets.token_hex(16)
        signal.signal(signal.SIGTERM, cancel)
        count = capture(terminal, pending, binding, verification_id)
        record = {
            "kind": "literal-attestation-verification-v1",
            "literal_match": True,
            "input_channel": "controlling_tty",
            "binding_sha256": binding,
            "verification_id": verification_id,
            "byte_count": count,
        }
        with os.fdopen(record_fd, "w", encoding="utf-8") as output:
            record_fd = None
            json.dump(record, output, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        print("Literal input verified. No action has been executed or authorized by this helper.")
        exit_code = 0
    except KeyboardInterrupt:
        print("BLOCKED: interactive verification cancelled.", file=sys.stderr)
        exit_code = 130
    except (OSError, UnicodeError, ValueError, RecursionError) as error:
        print(f"BLOCKED: {json.dumps(str(error), ensure_ascii=True)}", file=sys.stderr)
    finally:
        if record_fd is not None:
            os.close(record_fd)
        if terminal is not None:
            os.close(terminal)
        if exit_code != 0 and created is not None:
            try:
                current = args.output.lstat()
                if (current.st_dev, current.st_ino) == created:
                    args.output.unlink()
                else:
                    print("BLOCKED: output path changed; do not use any record.", file=sys.stderr)
            except FileNotFoundError:
                pass
            except OSError as error:
                print(f"BLOCKED: cannot retire failed record: {error}", file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
