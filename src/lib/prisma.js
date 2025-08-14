import { PrismaClient } from "@prisma/client";

let prisma = global._prisma || new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") global._prisma = prisma;

export { prisma };
