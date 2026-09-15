import { Schema } from "mongoose";
import { IUserRole } from "../../common/schema/enum";
import { randomUidPlugin } from "../../common/plugins/mongo-random-uid.plugin";
import { softDeletePlugin } from "../../common/plugins/mongoose-soft-delete.plugin";

const AccountSchema = new Schema(
  {
    provider: { type: String, required: true },
    providerId: { type: String, required: true },
  },
  { _id: false },
);

export const UserSchema = new Schema(
  {
    uid: { type: String },
    email: { type: String, required: true, lowercase: true },
    name: {
      first: { type: String, default: "" },
      last: { type: String, default: "" },
    },
    passwordHash: { type: String },
    avatar: { type: String },
    accounts: { type: [AccountSchema], default: [] },
    roles: { type: [String], default: [IUserRole.member] },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UserSchema.plugin(randomUidPlugin("user"));
UserSchema.plugin(softDeletePlugin);
UserSchema.index({ email: 1 }, { unique: true });

export type UserAccount = { provider: string; providerId: string };

export type UserDoc = {
  uid: string;
  email: string;
  name: { first: string; last: string };
  passwordHash?: string;
  avatar?: string;
  accounts: UserAccount[];
  roles: string[];
  is_active: boolean;
};
