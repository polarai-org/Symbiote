// @ts-nocheck
import { getSqliteUrl } from "@symbiote/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getSqliteUrl(),
  },
});
