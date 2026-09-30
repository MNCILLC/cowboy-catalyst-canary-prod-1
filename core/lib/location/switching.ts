import 'server-only';

export function isLocationSwitchingEnabled(): boolean {
  return process.env.ENABLE_LOCATION_SWITCHING !== 'false';
}
