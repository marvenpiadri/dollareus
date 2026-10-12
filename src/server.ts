import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AngularAppEngine } from '@angular/ssr';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import { app as fastifyApp } from '../apps/api/src/server.js';

// Disable host check to allow Cloud Run / AI Studio ingress proxies
(AngularAppEngine as any).ɵdisableAllowedHostsCheck = true;

const fastifyReady = (Promise.resolve(fastifyApp.ready()) as Promise<unknown>).catch((err: unknown) => {
  console.warn('[AI Studio] Fastify initialization warning:', err);
});

const configuredHosts = process.env['NG_ALLOWED_HOSTS']
  ?.split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const defaultAllowedHosts = ['localhost', '127.0.0.1', '*.run.app', '*.google.com', '*.aistudio.google'];
const angularApp = new AngularNodeAppEngine({
  allowedHosts: configuredHosts?.length ? configuredHosts : defaultAllowedHosts,
  trustProxyHeaders: true
});

const requestHandler = (request: IncomingMessage, response: ServerResponse): void => {
  const url = request.url ?? '/';
  if (url.startsWith('/api/') || url.startsWith('/auth/')) {
    fastifyReady.then(() => {
      fastifyApp.server.emit('request', request, response);
    }).catch((err: unknown) => {
      console.error('[AI Studio] Fastify request error:', err);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: { message: 'Internal Server Error' } }));
      }
    });
    return;
  }

  angularApp.handle(request)
    .then((renderedResponse) => {
      if (renderedResponse) {
        writeResponseToNodeResponse(renderedResponse, response);
        return;
      }

      response.statusCode = 404;
      response.end();
    })
    .catch((error: unknown) => {
      console.error('Dollareus SSR request failed', error);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.end('Internal Server Error');
      }
    });
};

export const reqHandler = createNodeRequestHandler(requestHandler);
export { AngularAppEngine };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env['PORT'] ?? 3000);
  createServer(requestHandler).listen(port, '0.0.0.0', () => {
    console.log(`Dollareus SSR listening on port ${port}`);
  });
}

