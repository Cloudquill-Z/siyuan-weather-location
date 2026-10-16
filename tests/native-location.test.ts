import { parseNativeLocationPayload } from '../src/nativeLocation';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const location = parseNativeLocationPayload(JSON.stringify({
  ok: true,
  lat: 28.12273,
  lon: 112.965048,
  accuracy: 42,
  timestamp: 1781234567890,
  source: 'macos-corelocation'
}));

assert(location.lat === 28.12273, 'expected latitude from native helper payload');
assert(location.lon === 112.965048, 'expected longitude from native helper payload');
assert(location.accuracy === 42, 'expected accuracy from native helper payload');
assert(location.source === 'macos-corelocation', 'expected source from native helper payload');

try {
  parseNativeLocationPayload(JSON.stringify({
    ok: false,
    error: 'permission-denied',
    message: 'Location permission denied'
  }));
  throw new Error('expected helper error payload to throw');
} catch (error) {
  assert((error as Error).message.includes('Location permission denied'), 'expected helper error message');
}

try {
  parseNativeLocationPayload(JSON.stringify({
    ok: true,
    lat: 0,
    lon: 0,
    accuracy: 10,
    timestamp: 1781234567890,
    source: 'windows-geolocation'
  }));
  throw new Error('expected zero coordinate payload to throw');
} catch (error) {
  assert((error as Error).message.includes('无效'), 'expected invalid coordinate message');
}
