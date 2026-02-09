import { Hono } from "hono";
import { requestId } from "./middleware/request-id";
import { createCorsMiddleware } from "./middleware/cors";
import { onErrorHandler } from "./middleware/error-handler";
import health from "./handlers/health-handlers";

export const App = new Hono<{ Bindings: Env }>();

App.use('*', requestId());
App.onError(onErrorHandler);
App.use('*', createCorsMiddleware());

App.route('/health', health);