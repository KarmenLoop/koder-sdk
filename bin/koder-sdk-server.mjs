#!/usr/bin/env node
import { startServer } from "../dist/server.mjs";

await startServer();
process.exit(0);
