import mongoose from "mongoose";
import { env } from "../config/env";
import { attachMongoListeners } from "../common/config/mongo-connection";

let connected = false;

export async function connectMongo() {
  if (connected) return;
  attachMongoListeners();
  await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 240000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    retryReads: true,
  });
  connected = true;
}

export async function disconnectMongo() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
