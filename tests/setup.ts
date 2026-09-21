// Isolate integration tests from the developer's .env and provider credentials.
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGO_URI: `mongodb://127.0.0.1:27017/coach-integration-${process.pid}?replicaSet=rs0&directConnection=true`,
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "6381",
  REDIS_PASSWORD: "",
  JWT_SECRET: "integration-test-secret-not-for-production",
  API_KEY: "integration-api-key",
  ORG_BOOTSTRAP_TOKEN: "integration-bootstrap",
  EMAIL_ENCRYPTION_PASSWORD: "integration-encryption",
  PROVIDER_MODE: "mock",
  DEEPGRAM_API_KEY: "",
  GEMINI_API_KEY: "",
  SITE_URL: "http://localhost:3000",
})
