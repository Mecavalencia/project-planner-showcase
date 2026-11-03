import type { GlobalRole } from "@planner/shared";

export interface AuthenticatedUser {
  sub: string;
  email: string;
  username: string;
  name: string;
  firstName?: string;
  lastName?: string;
  locale?: string;
  roles: GlobalRole[];
}
