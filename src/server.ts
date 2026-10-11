import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse
} from '@angular/ssr/node';

const configuredHosts = process.env['NG_ALLOWED_HOSTS']
  ?.split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const angularApp = new AngularNodeAppEngine(
  configuredHosts?.length ? { allowedHosts: configuredHosts } : undefined
);

const requestHandler = (request: IncomingMessage, response: ServerResponse): void => {
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env['PORT'] ?? 4000);
  createServer(requestHandler).listen(port, '0.0.0.0', () => {
    console.log(`Dollareus SSR listening on port ${port}`);
  });
}
