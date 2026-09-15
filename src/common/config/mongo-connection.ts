import mongoose from "mongoose";

const states: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export function attachMongoListeners() {
  const connection = mongoose.connection;
  connection.on("connected", () => console.log("MongoDB connected"));
  connection.on("reconnected", () => console.log("MongoDB reconnected"));
  connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  connection.on("error", (err) =>
    console.error("MongoDB connection error:", err.message),
  );
}

export function mongoState() {
  return states[mongoose.connection.readyState] ?? "unknown";
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
