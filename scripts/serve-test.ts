// Disposable local instance for packaged Electron tests. Never connects to configured .env databases.
Object.assign(process.env,{NODE_ENV:"test",MONGO_URI:"mongodb://127.0.0.1:27017/coach-desktop-smoke?replicaSet=rs0&directConnection=true",REDIS_HOST:"127.0.0.1",REDIS_PORT:"6381",REDIS_PASSWORD:"",JWT_SECRET:"desktop-smoke-secret-not-for-production",API_KEY:"desktop-smoke-api",ORG_BOOTSTRAP_TOKEN:"desktop-smoke-bootstrap",EMAIL_ENCRYPTION_PASSWORD:"desktop-smoke-encryption",PROVIDER_MODE:"mock",DEEPGRAM_API_KEY:"",GEMINI_API_KEY:"",PORT:"18000"});
const {connectMongo}=await import("../src/db/mongo");await connectMongo();
const {OrganisationModel}=await import("../src/db/models/organisation");
const {createOrganisation}=await import("../src/modules/organisations/organisation.service");
if(!await OrganisationModel.exists({organisation_name:"smoke"}))await createOrganisation({organisation_name:"smoke",owner:{email:"smoke@example.test",name:"Smoke Test",password:"smoke-test-password"}});
const {app}=await import("../src/app");app.listen({port:18000,maxRequestBodySize:60*1024*1024,idleTimeout:120});
const worker=Bun.spawn(["bun","run","src/worker.ts"],{env:process.env,stdout:"inherit",stderr:"inherit"});
process.on("SIGTERM",()=>{worker.kill();process.exit(0);});process.on("SIGINT",()=>{worker.kill();process.exit(0);});
console.log("Disposable Coach test API on http://localhost:18000");
