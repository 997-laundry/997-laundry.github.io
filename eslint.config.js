// Lint config: catches real mistakes (undefined names, unreachable code), not style.
module.exports = [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly", document: "readonly", localStorage: "readonly", sessionStorage: "readonly", navigator: "readonly",
        crypto: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
        clearInterval: "readonly", Blob: "readonly", URL: "readonly", FileReader: "readonly", Event: "readonly", MutationObserver: "readonly",
        L997Enterprise: "readonly", alert: "readonly", confirm: "readonly", location: "readonly", history: "readonly",
        TextEncoder: "readonly", Intl: "readonly", getComputedStyle: "readonly", requestAnimationFrame: "readonly",
        module: "writable", self: "readonly", performance: "readonly", HTMLElement: "readonly", KeyboardEvent: "readonly",
        Storage: "readonly", AbortController: "readonly", atob: "readonly", File: "readonly",
      },
    },
    rules: { "no-undef": "error", "no-unreachable": "error", "no-dupe-keys": "error", "no-redeclare": "error", "no-const-assign": "error", "no-unused-vars": "off" },
  },
];
