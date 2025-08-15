// config.js
// DO NOT put your real Azure key here!

module.exports = {
  endpoint: process.env.AZURE_FORM_RECOGNIZER_ENDPOINT || "https://your-resource-name.cognitiveservices.azure.com/",
  apiKey: process.env.AZURE_FORM_RECOGNIZER_KEY || "fake-key-for-testing-only"
};
