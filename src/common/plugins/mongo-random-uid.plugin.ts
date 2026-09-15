import type mongoose from "mongoose";
import { RandomUIDUtils } from "../utils/gen-random-uid";

export const randomUidPlugin =
  (prefix: string) => (schema: mongoose.Schema) => {
    schema.pre("validate", function (next) {
      const doc = this as mongoose.Document & { uid?: string };
      if (!doc.uid) doc.uid = RandomUIDUtils.generateRandomUid(prefix);
      next();
    });
  };
