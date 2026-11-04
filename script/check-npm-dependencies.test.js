const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");

const fromPromptfoo = createRequire(require.resolve("promptfoo"));

test("overridden glob preserves promptfoo file discovery", () => {
  const { escape, globSync, hasMagic } = fromPromptfoo("glob");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "npm-glob-"));
  try {
    fs.mkdirSync(path.join(directory, "nested"));
    fs.writeFileSync(path.join(directory, "nested", "case.yaml"), "");
    fs.writeFileSync(path.join(directory, "literal[1].yaml"), "");
    assert.equal(hasMagic("**/*.yaml"), true);
    assert.deepEqual(globSync("**/*.yaml", {
      cwd: directory, windowsPathsNoEscape: true,
    }).sort(), ["literal[1].yaml", "nested/case.yaml"]);
    assert.deepEqual(globSync(escape("literal[1].yaml", {
      windowsPathsNoEscape: true,
    }), { cwd: directory, windowsPathsNoEscape: true }), ["literal[1].yaml"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("overridden minimatch preserves scanner and filesystem patterns", () => {
  const { minimatch } = fromPromptfoo("minimatch");
  assert.equal(minimatch("nested/node_modules/pkg/index.js", "**/node_modules/**"), true);
  assert.equal(minimatch("nested/package-lock.json", "**/package-lock.json"), true);
  assert.equal(minimatch("src/index.js", "**/node_modules/**"), false);
  assert.equal(minimatch(".hidden/case.txt", "**/*.txt", { dot: true }), true);
  assert.equal(minimatch("nested/case.yaml", "**/*.{yaml,yml}"), true);
});

test("filesystem semver release preserves MCP tools and directory boundaries", {
  timeout: 15000,
}, async () => {
  const { Client } = fromPromptfoo("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = fromPromptfoo("@modelcontextprotocol/sdk/client/stdio.js");
  const serverManifest = fromPromptfoo.resolve("@modelcontextprotocol/server-filesystem/package.json");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "npm-mcp-"));
  const allowed = path.join(directory, "allowed");
  fs.mkdirSync(allowed);
  fs.writeFileSync(path.join(allowed, "case.txt"), "fixture");
  const outside = path.join(directory, "outside.txt");
  fs.writeFileSync(outside, "outside");
  const client = new Client({ name: "dependency-check", version: "1.0.0" });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(path.dirname(serverManifest), "dist/index.js"), allowed],
      stderr: "pipe",
    }));
    const { tools } = await client.listTools();
    assert.ok(tools.some(({ name }) => name === "read_file"));
    assert.ok(tools.some(({ name }) => name === "search_files"));
    const result = await client.callTool({
      name: "read_file", arguments: { path: path.join(allowed, "case.txt") },
    });
    assert.notEqual(result.isError, true);
    assert.ok(result.content.some(({ text }) => text === "fixture"));
    const search = await client.callTool({
      name: "search_files", arguments: { path: allowed, pattern: "**/*.txt" },
    });
    assert.notEqual(search.isError, true);
    assert.ok(search.content.some(({ text }) => text.includes("case.txt")));
    const denied = await client.callTool({
      name: "read_file", arguments: { path: outside },
    });
    assert.equal(denied.isError, true);
  } finally {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("FTP override retains get-uri's Client API and listing parser", async () => {
  const fromGetUri = createRequire(fromPromptfoo.resolve("get-uri"));
  const { Client } = fromGetUri("basic-ftp");
  const client = new Client();
  try {
    for (const method of ["access", "lastMod", "list", "downloadTo", "close"]) {
      assert.equal(typeof client[method], "function");
    }
    const listing = client.parseList("-rw-r--r-- 1 owner group 7 Jan 01 2026 case.txt");
    assert.equal(listing[0].name, "case.txt");
    assert.equal(listing[0].size, 7);
    const getUri = await import(fromPromptfoo.resolve("get-uri"));
    assert.equal(typeof getUri.getUri, "function");
  } finally {
    client.close();
  }
});

test("approved esbuild script supports tsx transformations", () => {
  const fromTsx = createRequire(fromPromptfoo.resolve("tsx"));
  const { transformSync } = fromTsx("esbuild");
  const { code } = transformSync("const value: number = 1", { loader: "ts" });
  assert.match(code, /const value = 1/);
});

test("fsevents ships a usable macOS binding without an install script", {
  skip: process.platform !== "darwin",
}, () => {
  const fromTsx = createRequire(fromPromptfoo.resolve("tsx"));
  assert.equal(typeof fromTsx("fsevents").watch, "function");
});
