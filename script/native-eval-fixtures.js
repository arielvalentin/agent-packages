"use strict";

const fs = require("node:fs");
const path = require("node:path");
const recipes = require("./native-eval-fixtures.json");
const managedDirectories = new Set(Object.keys(recipes).map((fixture) => path.posix.dirname(fixture)));

function isPolicyInput(file) {
  return /^packages\/[^/]+\/\.apm\/(?:skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md)|agents\/[^/]+\.agent\.md|instructions\/[^/]+\.instructions\.md)$/.test(file);
}

function isManagedFixture(fixture) {
  return [...managedDirectories].some((directory) => fixture.startsWith(`${directory}/`));
}

function fixtureSources(fixture) {
  const recipe = recipes[fixture];
  return recipe ? [...recipe.parts, ...(recipe.append || [])].filter(Boolean) : [];
}

function fixtureContent(root, fixture, resolveRepositoryFile) {
  const recipe = recipes[fixture];
  if (!recipe) throw new Error(`Missing fixture provenance: ${fixture}`);
  const read = (file) => {
    if (file === null) return "";
    if (!isPolicyInput(file) || path.posix.normalize(file) !== file) {
      throw new Error(`Fixture source is not a canonical APM policy file: ${file}`);
    }
    return fs.readFileSync(resolveRepositoryFile(root, root, file, "Fixture source"), "utf8");
  };
  let content = recipe.parts.map(read).join("\n");
  if (recipe.append) content += `\n\n${recipe.append.map(read).join("\n\n")}`;
  return content.replace(/\n{2,}$/, "\n");
}

module.exports = { recipes, fixtureSources, fixtureContent, isManagedFixture, isPolicyInput };
