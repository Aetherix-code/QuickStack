import NextAuth from "next-auth"
import { getAuthOptions } from "@/server/utils/auth-options";


async function handler(req: Request, ctx: any) {
    const authOptions = await getAuthOptions();
    return NextAuth(authOptions)(req as any, ctx);
}

export { handler as GET, handler as POST }