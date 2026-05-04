import { PassThrough } from 'node:stream';
import type { AppLoadContext, EntryContext } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { renderToPipeableStream } from 'react-dom/server';
import { isbot } from 'isbot';
import { logger } from '~/lib/logger';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const start = Date.now();
  const { pathname } = new URL(request.url);
  const readyEvent = isbot(request.headers.get('user-agent') ?? '') ? 'onAllReady' : 'onShellReady';

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyEvent]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          logger.info({
            event: 'http.request',
            method: request.method,
            path: pathname,
            status: responseStatusCode,
            ms: Date.now() - start,
          });
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            logger.error({ event: 'http.error', method: request.method, path: pathname, err: error });
          }
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
