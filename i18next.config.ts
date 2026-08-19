export default {
  locales: [
    "en",
    "de",
    "it"
  ],
  extract: {
    input: "*/src/**/*.{js,jsx,ts,tsx}",
    output: "shared/locales/{{language}}/translation.json"
  }
}