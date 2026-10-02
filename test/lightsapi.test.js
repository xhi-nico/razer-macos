import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
}));

import { DeskLights } from '../src/main/desklights';
import { LightsApi } from '../src/main/lightsapi';
import { fakeDesk, fakeSettings, fakeAddon, noDaylight } from './fakes';

describe('LightsApi', () => {
  let api, lights, base;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const devices = fakeDesk();
    lights = new DeskLights(fakeSettings(), fakeAddon(), () => devices, noDaylight);
    api = new LightsApi(lights);
    const server = api.start(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    api.stop();
    lights.setAuto(false);
    vi.restoreAllMocks();
  });

  const call = (method, path, body, headers = { 'X-Desk-Lights': '1' }) =>
    fetch(base + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

  it('turns away requests without the header', async () => {
    expect((await call('GET', '/status', undefined, {})).status).toBe(404);
    expect((await call('POST', '/attention', undefined, {})).status).toBe(404);
  });

  it('shows, reports and cancels a layer', async () => {
    const shown = await call('POST', '/show', { id: 'build', region: 'toprow', color: '#00ff00', effect: 'pulse', duration: 30 });
    expect(shown.status).toBe(200);
    expect(await shown.json()).toEqual({ id: 'build', shown: false }); // the desk starts red, until the Mac reports in

    const status = await (await call('GET', '/status')).json();
    expect(status.layers).toEqual([expect.objectContaining({ id: 'build', region: 'toprow', effect: 'pulse', color: '#00ff00' })]);
    expect(status.devices.map(device => device.name)).toEqual(['Keyboard', 'Mouse', 'Mat']);

    expect((await call('DELETE', '/show/build')).status).toBe(204);
    expect((await call('DELETE', '/show/missing')).status).toBe(404);
  });

  it('says what is wrong with a bad request', async () => {
    const response = await call('POST', '/show', { color: 'teal' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/color/);
    expect((await call('POST', '/show', '{not json')).status).toBe(400);
  });

  it('starts one attention wave at a time', async () => {
    expect((await call('POST', '/attention')).status).toBe(204);
    const first = lights.layers.layers.get('attention').endsAt;
    await new Promise(resolve => setTimeout(resolve, 5));
    await call('POST', '/attention');
    expect(lights.layers.layers.get('attention').endsAt).toBe(first);
  });
});
