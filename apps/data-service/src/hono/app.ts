import { Hono } from 'hono';
import credentials from './handlers/credential-handlers';
import health from './handlers/health-handlers';
import portfolio from './handlers/portfolio-handlers';
import status from './handlers/status-handlers';
import tokens from './handlers/token-handlers';
import tradingConfig from './handlers/trading-config-handlers';
import { createCorsMiddleware } from './middleware/cors';
import { onErrorHandler } from './middleware/error-handler';
import { requestId } from './middleware/request-id';

export const App = new Hono<{ Bindings: Env }>();

App.use('*', requestId());
App.onError(onErrorHandler);
App.use('*', createCorsMiddleware());

App.route('/health', health);
App.route('/api/status', status);
App.route('/api/tokens', tokens);
App.route('/api/credentials', credentials);
App.route('/api/trading-config', tradingConfig);
App.route('/api/portfolio', portfolio);
