/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer body lines for code-heavy commits.
    "body-max-line-length": [1, "always", 100],
    // Permitted type prefixes — Angular convention.
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "chore",
        "refactor",
        "test",
        "perf",
        "build",
        "ci",
        "style",
        "revert",
      ],
    ],
    // Scopes are free-form but lowercase.
    "scope-case": [2, "always", "lower-case"],
    // Subject capitalisation: relaxed — `feat(renderer): Add ...` and `feat(renderer): add ...` both fine.
    "subject-case": [0, "never"],
  },
};
