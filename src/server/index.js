import { createServer, getServerPort } from "@devvit/server";
import { serverOnRequest } from "./handlers.mjs";

const server = createServer(serverOnRequest);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());
