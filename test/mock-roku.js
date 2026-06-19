'use strict';

/**
 * Mock Roku ECP device for testing without hardware.
 *
 * Implements just enough of the Roku ECP HTTP API (port 8060) for RokuPi to
 * talk to: device-info / active-app / apps queries and keypress / launch posts.
 * Records what it received so tests (and humans) can assert behavior.
 *
 * Run standalone:   node test/mock-roku.js          (listens on :8060)
 * Use in tests:     const { startMockRoku } = require('./mock-roku')
 */

const http = require('http');

function startMockRoku({ port = 8060 } = {}) {
  const received = { keypresses: [], launches: [] };

  const deviceInfoXml =
    '<device-info><udn>mock-roku</udn><serial-number>MOCK123</serial-number>' +
    '<model-name>Mock Roku</model-name><friendly-device-name>Living Room TV</friendly-device-name>' +
    '<power-mode>PowerOn</power-mode></device-info>';

  const activeAppXml =
    '<active-app><app id="12" type="appl" version="1.0.0">Netflix</app></active-app>';

  const appsXml =
    '<apps>' +
    '<app id="12" type="appl" version="1.0.0">Netflix</app>' +
    '<app id="837" type="appl" version="2.0.0">YouTube</app>' +
    '<app id="13535" type="appl" version="3.0.0">Plex</app>' +
    '</apps>';

  const server = http.createServer((req, res) => {
    const url = req.url || '';

    if (req.method === 'GET' && url === '/query/device-info') {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(deviceInfoXml);
    }
    if (req.method === 'GET' && url === '/query/active-app') {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(activeAppXml);
    }
    if (req.method === 'GET' && url === '/query/apps') {
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(appsXml);
    }
    if (req.method === 'POST' && url.startsWith('/keypress/')) {
      received.keypresses.push(decodeURIComponent(url.slice('/keypress/'.length)));
      res.writeHead(200);
      return res.end();
    }
    if (req.method === 'POST' && url.startsWith('/launch/')) {
      received.launches.push(decodeURIComponent(url.slice('/launch/'.length)));
      res.writeHead(200);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });

  const ready = new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    received,
    ready,
    url: `http://127.0.0.1:${port}`,
    reset() { received.keypresses.length = 0; received.launches.length = 0; },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { startMockRoku };

// Standalone mode
if (require.main === module) {
  const mock = startMockRoku({ port: Number(process.env.MOCK_PORT) || 8060 });
  mock.ready.then(() => {
    // eslint-disable-next-line no-console
    console.log(`Mock Roku listening on ${mock.url}`);
  });
}
