#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const packages = path.resolve(process.argv[2] || path.join(__dirname, "../packages"));

function primitiveKind(file) {
  if (file.endsWith(".agent.md")) return "agent";
  if (path.basename(file) === "SKILL.md") return "skill";
  if (file.endsWith(".instructions.md")) return "instructions";
}

function primitiveFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return primitiveFiles(file);
      return entry.isFile() && primitiveKind(file) ? [file] : [];
    });
}

function validate(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("missing opening frontmatter delimiter at line 1");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("missing closing frontmatter delimiter");
  const frontmatter = lines.slice(1, end).join("\n");
  if (!frontmatter.trim()) throw new Error("frontmatter must be a YAML mapping");

  let metadata;
  try {
    metadata = yaml.load(frontmatter, {
      filename: file,
      onWarning: (warning) => { throw warning; },
    });
  } catch (error) {
    throw new Error(`invalid YAML frontmatter: ${error.message}`);
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("frontmatter must be a YAML mapping");
  }

  // Instructions are unconditional unless applyTo is supplied. Agent mode,
  // invocation controls, and tools are optional in the current package schemas.
  const required = primitiveKind(file) === "instructions"
    ? ["description"] : ["name", "description"];
  const invalid = required.filter((field) =>
    !Object.hasOwn(metadata, field)
    || typeof metadata[field] !== "string"
    || !metadata[field].trim()
  );
  if (invalid.length) {
    throw new Error(`${invalid.join(", ")} must be a nonempty string`);
  }
}

let files;
try {
  files = primitiveFiles(packages);
} catch (error) {
  console.error(`Unable to discover primitives in ${packages}: ${error.message}`);
  process.exit(1);
}
if (!files.length) {
  console.error(`No primitive files found in ${packages}; refusing to report success.`);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  try {
    validate(file);
  } catch (error) {
    console.error(`${path.relative(process.cwd(), file)}: ${error.message}`);
    failures++;
  }
}
if (failures) {
  console.error(`${failures} primitive file(s) failed frontmatter validation.`);
  process.exitCode = 1;
} else {
  console.log(`Validated frontmatter in ${files.length} primitive file(s).`);
}
