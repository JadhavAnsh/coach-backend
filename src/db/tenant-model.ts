import mongoose, { type Model } from "mongoose"
import { UserSchema, type UserDoc } from "./models/user"

export function getTenantModel<T>(
  orgId: string,
  name: string,
  schema: mongoose.Schema
): Model<T> {
  const collectionName = `${orgId}.${name}`
  return (
    (mongoose.models[collectionName] as Model<T>) ||
    mongoose.model<T>(collectionName, schema, collectionName)
  )
}

export function getUserModel(orgId: string) {
  return getTenantModel<UserDoc>(orgId, "users", UserSchema)
}
