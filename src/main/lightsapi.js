import http from 'http';
import { LayerError, CALL_PRIORITY } from './lightlayers';

// Only this Mac can reach it; see README, "Local lights API".
export const LIGHTS_PORT = 47820;
const MAX_BODY_BYTES = 64 * 1024;

// The attention wave: an orange band rolls across the desk and back, three times, over the call lights.
export const ATTENTION = {
  id: 'attention',
  region: 'desk',
  effect: 'wave',
  color: [255, 90, 20],
  period: 2.6,
  duration: 7.8,
  priority: CALL_PRIORITY + 10,
};

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new LayerError('body too large', 413));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body.trim() === '' ? {} : JSON.parse(body));
      } catch {
        reject(new LayerError('body is not valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

/**
 * The local lights API on 127.0.0.1. Every request needs the X-Desk-Lights
 * header: a web page cannot send a custom header cross-origin without a
 * preflight, which this server never answers, so only local programs get in.
 *
 *   POST   /show        { region, color, effect, duration, priority, id, group, period } -> { id, shown }
 *   DELETE /show/<id>   fade that layer out
 *   GET    /status      what the desk shows, every layer, which devices answer
 *   POST   /attention   the attention wave (ATTENTION); ignored while one is rolling
 *
 * `route` adds more (Claude Code's states).
 */
export class LightsApi {
  constructor(lights) {
    this.lights = lights;
    this.routes = [];
    this.route('POST', /^\/show$/, async request => {
      const layer = this.lights.show(await readJson(request));
      return { id: layer.id, shown: this.lights.layersShown() };
    });
    this.route('DELETE', /^\/show\/([^/]+)$/, (_, [id]) => {
      if (!this.lights.cancel(decodeURIComponent(id))) {
        throw new LayerError('no layer with that id', 404);
      }
    });
    this.route('GET', /^\/status$/, () => this.lights.status());
    this.route('POST', /^\/attention$/, () => {
      if (!this.lights.layers.has(ATTENTION.id, Date.now())) {
        this.lights.show(ATTENTION);
      }
    });
  }

  // `handle(request, captures)` returns what to send back as JSON, or nothing for 204.
  route(method, path, handle) {
    this.routes.push({ method, path, handle });
  }

  start(port = LIGHTS_PORT) {
    this.server = http.createServer((request, response) => this.serve(request, response));
    this.server.on('error', error => console.warn(`Lights API unavailable on port ${port}:`, error.message));
    this.server.listen(port, '127.0.0.1');
    return this.server;
  }

  stop() {
    this.server?.close();
  }

  async serve(request, response) {
    const send = (status, body) => {
      response.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const path = request.url.split('?')[0];
    const match = this.routes
      .map(route => ({ route, captures: route.method === request.method && path.match(route.path) }))
      .find(({ captures }) => captures);
    if (!request.headers['x-desk-lights'] || !match) {
      send(404);
      return;
    }
    try {
      const result = await match.route.handle(request, match.captures.slice(1));
      send(result === undefined ? 204 : 200, result);
    } catch (error) {
      if (error instanceof LayerError) {
        send(error.status, { error: error.message });
      } else {
        console.warn(`Lights API ${request.method} ${path} failed:`, error?.message ?? error);
        send(500, { error: 'failed; see the log' });
      }
    }
  }
}
