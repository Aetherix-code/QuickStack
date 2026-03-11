import { PrismaClient, User } from "@prisma/client";
import NextAuth, { NextAuthOptions, Session } from "next-auth"
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { JWT } from "next-auth/jwt";
import { UserSession } from "@/shared/model/sim-session.model";
import dataAccess from "@/server/adapter/db.client";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import bcrypt from "bcrypt";
import userService from "@/server/services/user.service";
import { revalidatePath } from "next/cache";
import paramService, { ParamService } from "@/server/services/param.service";


const saltRounds = 10;

export async function getAuthOptions(): Promise<NextAuthOptions> {
    // Read GitHub OAuth credentials from DB, fall back to env vars
    const githubClientId = await paramService.getString(ParamService.GITHUB_CLIENT_ID) || process.env.GITHUB_CLIENT_ID;
    const githubClientSecret = await paramService.getString(ParamService.GITHUB_CLIENT_SECRET) || process.env.GITHUB_CLIENT_SECRET;

    // Resolve NEXTAUTH_URL from configured hostname, public IP, or env var
    if (!process.env.NEXTAUTH_URL) {
        const hostname = await paramService.getString(ParamService.QS_SERVER_HOSTNAME);
        const publicIp = await paramService.getString(ParamService.PUBLIC_IPV4_ADDRESS);
        if (hostname) {
            process.env.NEXTAUTH_URL = `https://${hostname}`;
        } else if (publicIp) {
            process.env.NEXTAUTH_URL = `http://${publicIp}:30000`;
        }
    }

    return {
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/auth",
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
                totpToken: { label: "TOTP Token", type: "text" },
            },
            async authorize(credentials, req) {
                if (!credentials) {
                    return null;
                }
                const authUserInfo = await userService.authorize(credentials);
                if (!authUserInfo) {
                    return null;
                }
                const user = await userService.getUserByEmail(authUserInfo.email);
                if (user.twoFaEnabled) {
                    if (!credentials.totpToken) {
                        return null;
                    }
                    const tokenValid = await userService.verifyTotpToken(authUserInfo.email, credentials.totpToken);
                    if (!tokenValid) {
                        return null;
                    }
                }
                return mapUser(user);
            }
        }),
        ...(githubClientId && githubClientSecret ? [
            GitHubProvider({
                clientId: githubClientId,
                clientSecret: githubClientSecret,
                authorization: {
                    params: {
                        scope: 'read:user user:email repo admin:repo_hook'
                    }
                }
            })
        ] : [])
    ],
    callbacks: {
        async signIn({ user, account, profile }) {
            // Handle GitHub OAuth account linking
            if (account?.provider === 'github' && account.access_token) {
                const existingUser = await dataAccess.client.user.findUnique({
                    where: { email: user.email! }
                });

                if (existingUser) {
                    // Update existing user with GitHub info
                    await dataAccess.client.user.update({
                        where: { email: user.email! },
                        data: {
                            githubAccessToken: account.access_token,
                            githubUsername: (profile as any)?.login,
                            githubId: account.providerAccountId,
                        }
                    });
                    revalidatePath('/settings/profile');
                }
            }
            return true;
        },
    },
    adapter: PrismaAdapter(dataAccess.client),
    };
}

function mapUser(user: User) {
    return {
        id: user.id,
        email: user.email
    };
}