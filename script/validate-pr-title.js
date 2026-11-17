const TITLE_PATTERN = /^(feat|fix|docs|refactor|test|chore|ci|perf|build|revert)(\([^()\s]+\))?!?:\s+\S.*$/;

function validateTitle(title) {
  const errors = [];
  if (typeof title !== "string" || !TITLE_PATTERN.test(title)) {
    errors.push("must match the repository's Conventional Commits format");
  }
  return errors;
}

if (require.main === module) {
  const errors = validateTitle(process.env.PR_TITLE);
  if (errors.length) {
    console.error(`Invalid PR title: ${errors.join("; ")}.`);
    process.exitCode = 1;
  } else {
    console.log("PR title is valid.");
  }
}

module.exports = { validateTitle };
