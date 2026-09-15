import mongoose, { Schema } from "mongoose";
import { randomUidPlugin } from "../../common/plugins/mongo-random-uid.plugin";

const OrganisationSchema = new Schema(
  {
    uid: { type: String },
    organisation_name: { type: String, required: true, unique: true },
    display_name: { type: String },
    organisation_uid: { type: String },
    allowed_domains: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
    owner: {
      email: { type: String, required: true },
      name: { type: String, required: true },
    },
  },
  { timestamps: true },
);

OrganisationSchema.plugin(randomUidPlugin("org"));
OrganisationSchema.pre("validate", function (next) {
  if (!this.organisation_uid && this.uid) this.organisation_uid = this.uid;
  next();
});

export type Organisation = mongoose.InferSchemaType<typeof OrganisationSchema> &
  mongoose.Document;

export const OrganisationModel =
  mongoose.models.Organisation ||
  mongoose.model("Organisation", OrganisationSchema);
