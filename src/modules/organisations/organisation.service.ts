import { getUserModel } from "../../db/tenant-model";
import { OrganisationModel } from "../../db/models/organisation";
import { IUserRole } from "../../common/schema/enum";
import { AppError } from "../../common/filters/http-exception";
import { setUserRolesCache } from "../../common/guards/roles";
import { invalidateOrganisationCache } from "../../common/config/organisation-data";

export async function createOrganisation(input: {
  organisation_name: string;
  display_name?: string;
  owner: { email: string; name: string; password: string };
  allowed_domains?: string[];
}) {
  const slug = input.organisation_name.trim().toLowerCase();
  const existing = await OrganisationModel.findOne({ organisation_name: slug });
  if (existing) {
    throw new AppError(409, "Organisation already exists", "ORG_EXISTS");
  }

  const org = await OrganisationModel.create({
    organisation_name: slug,
    display_name: input.display_name || slug,
    allowed_domains: input.allowed_domains ?? [],
    is_active: true,
    owner: { email: input.owner.email.toLowerCase(), name: input.owner.name },
  });

  const User = getUserModel(slug);
  const owner = await User.create({
    email: input.owner.email.toLowerCase(),
    passwordHash: await Bun.password.hash(input.owner.password),
    name: { first: input.owner.name, last: "" },
    roles: [IUserRole.owner],
  });

  await setUserRolesCache(slug, owner.uid, [IUserRole.owner]);
  await invalidateOrganisationCache(slug);

  return { org, owner };
}
