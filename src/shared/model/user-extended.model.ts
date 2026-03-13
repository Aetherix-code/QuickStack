import { User, UserGroup } from "@prisma/client";
import { UserGroupExtended } from "./sim-session.model";

export type UserExtended = {
    id: string;
    userGroup: UserGroup | null;
    userGroupId: string | null;
    email: string;
    githubAccessToken: string | null;
    githubUsername: string | null;
    githubId: string | null;
    createdAt: Date;
    updatedAt: Date;
};
