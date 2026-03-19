import { hasEligibleChangesetEntries } from "./changeset-entries.mjs";

const eligible = await hasEligibleChangesetEntries();
process.stdout.write(eligible ? "true" : "false");
