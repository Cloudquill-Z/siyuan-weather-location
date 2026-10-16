import { LocationService } from '../src/location';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const service = new LocationService({ amapKey: 'test-key' }, process.cwd());

  await service.shutdownNativeHelper();
  await waitForStatus(service, 'stopped');
  assert(await service.getNativeHelperStatus() === 'stopped', 'expected helper to start from stopped state');

  const started = await service.ensureNativeHelper();
  assert(started === true, 'expected ensureNativeHelper to return true after starting helper');
  assert(await service.getNativeHelperStatus() === 'running', 'expected helper status to be running after start');

  await service.shutdownNativeHelper();
}

async function waitForStatus(service: LocationService, expected: 'running' | 'stopped') {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3000) {
    if (await service.getNativeHelperStatus() === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
