"""The PTY fixtures simulate a terminal; they never authorize a live action."""

from __future__ import annotations

import base64
import copy
import hashlib
import errno
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import runpy
import re
from types import SimpleNamespace
import unittest


HELPER = Path(__file__).resolve().parents[1] / ".apm/skills/human-interaction-safeguard/scripts/verify_attestation.py"
verifier = SimpleNamespace(**runpy.run_path(str(HELPER)))
LAUNCHER = HELPER.with_name("verify_interactively.sh")
REQUEST = {
    "session": "TEST-ONLY", "request": "TEST-ONLY", "chain_revision": "TEST-ONLY",
    "action": {"operation": "draft", "repository": "owner/repo", "item": 42,
               "thread": "T1", "comment": 7, "content": "TEST ONLY: one draft; no live action"},
}
BINDING = hashlib.sha256(verifier.canonical_request(REQUEST)).hexdigest()


def interactive_check(body: bytes, retry_body: bytes | None = None, existing_record: dict | None = None,
                      pending_request: dict | None = None, fault: str | None = None,
                      inherit_igncr: bool = False, expect_blocked: bool = False) -> dict:
    import pty
    import termios

    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "verification.json"
        status_output = Path(directory) / "status"
        request_path = Path(directory) / "request.json"
        pending_request = REQUEST if pending_request is None else pending_request
        request_path.write_text(json.dumps(pending_request))
        if existing_record is not None:
            output.write_text(json.dumps(existing_record))
        if fault not in (None, "after_dump", "fsync"):
            raise ValueError("Unknown test fault.")
        bin_path = Path(directory) / "bin"
        bin_path.mkdir()
        python = bin_path / "python3"
        python.write_text(
            f"#!{sys.executable}\n"
            "import json, os, runpy, signal, sys\n"
            "sys.argv = sys.argv[1:]\n"
            f"fault = {fault!r}\n"
            "if fault is None:\n"
            "    os.execv(sys.executable, [sys.executable, *sys.argv])\n"
            "module = runpy.run_path(sys.argv[0])\n"
            "original_dump = json.dump\n"
            "def after_dump(*args, **kwargs):\n"
            "    original_dump(*args, **kwargs)\n"
            "    os.kill(os.getpid(), signal.SIGTERM)\n"
            "def failed_sync(fd):\n"
            "    raise OSError('injected fsync failure')\n"
            "if fault == 'after_dump': json.dump = after_dump\n"
            "if fault == 'fsync': os.fsync = failed_sync\n"
            "raise SystemExit(module['main']())\n"
        )
        python.chmod(0o700)
        pid, master = pty.fork()
        if pid == 0:
            if inherit_igncr:
                attrs = termios.tcgetattr(0)
                attrs[0] |= termios.IGNCR
                termios.tcsetattr(0, termios.TCSANOW, attrs)
            env = dict(os.environ, PATH=str(bin_path) + os.pathsep + os.environ["PATH"])
            os.execve("/bin/sh", [
                "sh", str(LAUNCHER), "--status-output", str(status_output),
                "--request", str(request_path), "--output", str(output),
            ], env)
        transcript = bytearray()
        reaped = False
        cursor = 0

        def wait_for(marker: bytes):
            nonlocal cursor
            deadline = time.monotonic() + 5
            while marker not in transcript[cursor:]:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise AssertionError("Verifier did not reach the expected interactive state.")
                if not select.select([master], [], [], remaining)[0]:
                    continue
                transcript.extend(os.read(master, 4096))
            cursor = transcript.index(marker, cursor) + len(marker)

        try:
            if existing_record is not None or expect_blocked:
                wait_for(b"BLOCKED:")
            else:
                wait_for(verifier.PROMPT)
                os.write(master, body + b"\x04")
                if not verifier.matches(body):
                    wait_for(verifier.RETRY)
                    if output.read_bytes():
                        raise AssertionError("A mismatch created a verification record.")
                    wait_for(verifier.PROMPT)
                    os.write(master, b"\x03" if retry_body is None else retry_body + b"\x04")
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                # Drain the PTY while the child exits; macOS may wait for it.
                if select.select([master], [], [], 0.05)[0]:
                    try:
                        transcript.extend(os.read(master, 4096))
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    reaped = True
                    break
                time.sleep(0.01)
            else:
                raise AssertionError("Verifier did not exit.")
            record = json.loads(output.read_text()) if output.exists() and output.read_bytes() else None
            nonce = re.search(rb"(?:^|\r?\n)Verification: ([0-9a-f]{32})", transcript)
            return {
                "exit_code": os.waitstatus_to_exitcode(status),
                "status_code": int(status_output.read_text()) if status_output.exists() and status_output.read_bytes() else None,
                "record": record,
                "pending_request": pending_request,
                "verification_id": nonce.group(1).decode() if nonce else None,
                "transcript": transcript.decode("utf-8", errors="backslashreplace"),
                "mode": output.stat().st_mode & 0o777 if output.exists() else None,
            }
        finally:
            os.close(master)
            if not reaped:
                done, _ = os.waitpid(pid, os.WNOHANG)
                if not done:
                    try:
                        os.killpg(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    os.waitpid(pid, 0)


class LiteralTests(unittest.TestCase):
    def test_exact_bytes_only(self):
        expected = verifier.EXPECTED
        self.assertEqual(len(expected), 98)
        self.assertTrue(verifier.matches(expected))
        variants = [
            b"", b'"' + expected + b'"', expected.lower(), expected[:-1],
            b" " + expected, expected + b" ", expected + b"\n",
            expected + b"\r\n", expected.replace(b" ", b"\t", 1),
            expected.replace(b" ", b"\n", 1),
            expected.replace(b" ", b"\xc2\xa0", 1),
            b"```\n" + expected + b"\n```", b"> " + expected,
            expected + b" Proceed.", b"yes",
        ]
        for body in variants:
            with self.subTest(body=body):
                self.assertFalse(verifier.matches(body))
        for index in range(len(expected)):
            body = expected[:index] + bytes([expected[index] ^ 1]) + expected[index + 1:]
            self.assertFalse(verifier.matches(body))

    def test_no_implicit_text_conversion(self):
        with self.assertRaises(TypeError):
            verifier.matches(verifier.EXPECTED.decode("ascii"))

    def test_pipe_and_file_input_are_blocked(self):
        for file_input in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "record.json"
                request_path = Path(directory) / "request.json"
                request_path.write_text(json.dumps(REQUEST))
                args = [sys.executable, str(HELPER), "--request", str(request_path), "--output", str(output)]
                if file_input:
                    body = Path(directory) / "reply"
                    body.write_bytes(verifier.EXPECTED)
                    with body.open("rb") as stream:
                        result = subprocess.run(args, stdin=stream, capture_output=True)
                else:
                    result = subprocess.run(args, input=verifier.EXPECTED, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"BLOCKED", result.stderr)
                self.assertFalse(output.exists())

    @unittest.skipUnless(os.name == "posix", "Requires a POSIX PTY.")
    def test_missing_controlling_terminal_is_blocked(self):
        master, slave = os.openpty()
        try:
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "record.json"
                request_path = Path(directory) / "request.json"
                request_path.write_text(json.dumps(REQUEST))
                result = subprocess.run(
                    [sys.executable, str(HELPER), "--request", str(request_path), "--output", str(output)],
                    stdin=slave, capture_output=True, start_new_session=True, timeout=5,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(b"BLOCKED", result.stderr)
                self.assertFalse(output.exists())
        finally:
            os.close(master)
            os.close(slave)


@unittest.skipUnless(os.name == "posix", "Interactive verifier requires POSIX.")
class InteractiveTests(unittest.TestCase):
    def test_invalid_pending_request_is_blocked_before_capture(self):
        requests = [
            {**REQUEST, "request": " \t"},
            {**REQUEST, "chain_revision": " \t"},
            {**REQUEST, "action": {**REQUEST["action"], "repository": " \t"}},
            {**REQUEST, "actions": [REQUEST["action"]]},
            {**REQUEST, "scope": "session-wide"},
            {**REQUEST, "waiver": True},
            {**REQUEST, "action": {**REQUEST["action"], "also_resolve": True}},
            {**REQUEST, "action": {**REQUEST["action"], "scope": "global"}},
            {**REQUEST, "action": {**REQUEST["action"], "operation": "resolve"}},
        ]
        for request in requests:
            with self.subTest(request=request):
                result = interactive_check(verifier.EXPECTED, pending_request=request, expect_blocked=True)
                self.assertEqual(result["exit_code"], 2)
                self.assertEqual(result["status_code"], 2)
                self.assertIsNone(result["record"])
                self.assertNotIn(verifier.PROMPT.decode(), result["transcript"])

    def test_resolution_accepts_no_reply_payload(self):
        request = {**REQUEST, "action": {
            "operation": "resolve", "repository": "owner/repo", "item": 42, "thread": "T1",
        }}
        result = interactive_check(verifier.EXPECTED, pending_request=request)
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["status_code"], 0)
        self.assertEqual(result["record"]["binding_sha256"],
                         hashlib.sha256(verifier.canonical_request(request)).hexdigest())

    def test_real_capture_accepts_exact_body(self):
        for operation in ("draft", "post", "research", "implement"):
            with self.subTest(operation=operation):
                request = copy.deepcopy(REQUEST)
                request["action"]["operation"] = operation
                request["action"]["content"] = f"TEST ONLY: one {operation}; no live action"
                result = interactive_check(verifier.EXPECTED, pending_request=request)
                self.assertEqual(result["exit_code"], 0)
                self.assertEqual(result["status_code"], 0)
                self.assertEqual(result["record"]["literal_match"], True)
                self.assertEqual(result["record"]["binding_sha256"],
                                 hashlib.sha256(verifier.canonical_request(request)).hexdigest())
                self.assertEqual(result["record"]["input_channel"], "controlling_tty")
                self.assertEqual(result["record"]["byte_count"], 98)
                self.assertEqual(result["mode"], 0o600)

    def test_real_capture_rejects_raw_variants(self):
        for body in [
            b"",
            b'"' + verifier.EXPECTED + b'"',
            verifier.EXPECTED + b"\n", verifier.EXPECTED + b"\r\n",
            b" " + verifier.EXPECTED, verifier.EXPECTED + b" ",
            verifier.EXPECTED.lower(), verifier.EXPECTED[:-1],
            verifier.EXPECTED.replace(b"arielvalentin", b"arielvalentim"),
            verifier.EXPECTED.replace(b"do hereby", b"do  hereby"),
            verifier.EXPECTED.replace(b"authorize", b"authorize\r\n"),
            verifier.EXPECTED + b"\nextra text",
            verifier.EXPECTED + b" Proceed.",
            verifier.EXPECTED.replace(b" ", b"\t", 1),
            verifier.EXPECTED.replace(b" ", b"\n", 1),
            verifier.EXPECTED.replace(b" ", b"\xc2\xa0", 1),
            b"`" + verifier.EXPECTED + b"`",
            b"```\n" + verifier.EXPECTED + b"\n```",
            b"> " + verifier.EXPECTED,
            b"The user said: " + verifier.EXPECTED,
            b"yes",
        ]:
            with self.subTest(body=body):
                result = interactive_check(body)
                self.assertEqual(result["exit_code"], 130)
                self.assertEqual(result["status_code"], 130)
                self.assertIsNone(result["record"])
                self.assertIn(verifier.RETRY.decode(), result["transcript"])

    def test_mismatch_requires_a_new_exact_submission(self):
        result = interactive_check(b'"' + verifier.EXPECTED + b'"', retry_body=verifier.EXPECTED)
        self.assertEqual(result["exit_code"], 0)
        self.assertTrue(result["record"]["literal_match"])
        self.assertIn(verifier.RETRY.decode(), result["transcript"])

    def test_existing_verification_is_not_overwritten(self):
        existing = {"kind": "old record", "literal_match": True}
        result = interactive_check(verifier.EXPECTED, existing_record=existing)
        self.assertNotEqual(result["exit_code"], 0)
        self.assertEqual(result["record"], existing)

    def test_display_and_digest_come_from_the_same_request(self):
        changed = copy.deepcopy(REQUEST)
        changed["action"]["operation"] = "post"
        changed["action"]["content"] = "TEST ONLY: different payload"
        result = interactive_check(verifier.EXPECTED, pending_request=changed)
        canonical = verifier.canonical_request(changed)
        self.assertIn(canonical.decode(), result["transcript"])
        self.assertEqual(result["record"]["binding_sha256"], hashlib.sha256(canonical).hexdigest())
        self.assertNotEqual(result["record"]["binding_sha256"], BINDING)
        self.assertEqual(result["record"]["verification_id"], result["verification_id"])

    def test_failure_and_post_dump_cancellation_retire_record(self):
        for fault, code in (("fsync", 2), ("after_dump", 130)):
            with self.subTest(fault=fault):
                result = interactive_check(verifier.EXPECTED, fault=fault)
                self.assertEqual(result["exit_code"], code)
                self.assertEqual(result["status_code"], code)
                self.assertIsNone(result["record"])

    def test_inherited_ignore_cr_cannot_normalize_input(self):
        result = interactive_check(verifier.EXPECTED + b"\r", inherit_igncr=True)
        self.assertEqual(result["status_code"], 130)
        self.assertIsNone(result["record"])


class RequestAndOutputTests(unittest.TestCase):
    def test_invalid_or_oversized_request_is_rejected(self):
        for mutation in (
            {}, {**REQUEST, "action": []}, {**REQUEST, "session": ""},
            {**REQUEST, "session": " \t"}, {**REQUEST, "request": None},
            {**REQUEST, "chain_revision": ""},
        ):
            with self.assertRaises(ValueError):
                verifier.canonical_request(mutation)
        for field, value in (
            ("repository", ""), ("item", 0), ("thread", " \t"),
            ("review", " \t"), ("content", ""), ("content", " \t"),
        ):
            request = copy.deepcopy(REQUEST)
            request["action"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                verifier.canonical_request(request)
        missing_locator = copy.deepcopy(REQUEST)
        del missing_locator["action"]["thread"], missing_locator["action"]["comment"]
        with self.assertRaises(ValueError):
            verifier.canonical_request(missing_locator)
        large = copy.deepcopy(REQUEST)
        large["action"]["content"] = "x" * verifier.MAX_REQUEST_BYTES
        with self.assertRaises(ValueError):
            verifier.canonical_request(large)
        wide = copy.deepcopy(REQUEST)
        wide["action"]["operation"] = "session-wide-override"
        with self.assertRaises(ValueError):
            verifier.canonical_request(wide)

    def test_short_terminal_writes_are_completed(self):
        from unittest.mock import patch
        seen = bytearray()

        def short_write(_fd, data):
            seen.extend(data[:1])
            return 1

        with patch.object(verifier.os, "write", short_write):
            verifier.write_all(123, b"complete prompt")
        self.assertEqual(seen, b"complete prompt")


if __name__ == "__main__":
    if sys.argv[1:] == ["--fixture"]:
        fixture = json.load(sys.stdin)
        if any(fixture["pending_request"].get(k) != "TEST-ONLY" for k in ("session", "request", "chain_revision")):
            raise ValueError("Test fixtures cannot verify a live request.")
        result = interactive_check(base64.b64decode(fixture["body_b64"], validate=True),
                                   pending_request=fixture["pending_request"])
        print(json.dumps(result))
    else:
        unittest.main()
