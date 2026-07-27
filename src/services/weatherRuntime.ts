import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const WEATHER_CACHE_KEY = '@nana/weather-cache-v1';
const WEATHER_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const LAST_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
const LOCATION_REQUEST_TIMEOUT_MS = 7_000;
const WEATHER_REQUEST_TIMEOUT_MS = 8_000;

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

export type WeatherSource = 'live' | 'cache' | 'simulated';
export type WeatherPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface WeatherSnapshot {
  condition: WeatherCondition;
  temperatureC: number;
  apparentTemperatureC: number;
  isDay: boolean;
  precipitationMm: number;
  windSpeedKph: number;
  fetchedAt: number;
  source: WeatherSource;
  timezone?: string;
}

export interface WeatherLoadResult {
  snapshot: WeatherSnapshot;
  permission: WeatherPermissionState;
  error?: 'permission-denied' | 'location-disabled' | 'location-failed' | 'network-failed';
}

interface OpenMeteoCurrent {
  temperature_2m: number;
  apparent_temperature: number;
  weather_code: number;
  is_day: number;
  precipitation: number;
  wind_speed_10m: number;
}

interface OpenMeteoResponse {
  timezone?: string;
  current?: OpenMeteoCurrent;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function conditionFromWeatherCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'cloudy';
}

export function createSimulatedWeather(now = new Date()): WeatherSnapshot {
  const hour = now.getHours();
  const isDay = hour >= 6 && hour < 19;
  const daylightWave = Math.sin(((hour - 7) / 24) * Math.PI * 2);
  const temperatureC = Math.round(19 + daylightWave * 6);

  let condition: WeatherCondition;
  if (!isDay) {
    condition = hour >= 22 || hour < 4 ? 'clear' : 'partly-cloudy';
  } else if (hour < 9) {
    condition = 'partly-cloudy';
  } else if (hour < 16) {
    condition = 'clear';
  } else {
    condition = 'partly-cloudy';
  }

  return {
    condition,
    temperatureC,
    apparentTemperatureC: temperatureC,
    isDay,
    precipitationMm: 0,
    windSpeedKph: 8,
    fetchedAt: now.getTime(),
    source: 'simulated',
  };
}

function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<WeatherSnapshot>;
  return (
    typeof snapshot.condition === 'string'
    && finiteNumber(snapshot.temperatureC)
    && finiteNumber(snapshot.apparentTemperatureC)
    && typeof snapshot.isDay === 'boolean'
    && finiteNumber(snapshot.precipitationMm)
    && finiteNumber(snapshot.windSpeedKph)
    && finiteNumber(snapshot.fetchedAt)
  );
}

async function readCachedWeather(): Promise<WeatherSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isWeatherSnapshot(parsed)) return null;
    if (Date.now() - parsed.fetchedAt > WEATHER_CACHE_MAX_AGE_MS) return null;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

async function cacheWeather(snapshot: WeatherSnapshot) {
  try {
    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Weather remains useful without persistence.
  }
}

async function resolvePermission(requestPermission: boolean): Promise<Location.LocationPermissionResponse> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  return permission;
}

function permissionState(permission: Location.LocationPermissionResponse): WeatherPermissionState {
  if (permission.granted) return 'granted';
  if (permission.status === Location.PermissionStatus.UNDETERMINED) return 'undetermined';
  return 'denied';
}

async function getCurrentPositionWithTimeout(signal?: AbortSignal) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortFromCaller: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Location request timed out')),
      LOCATION_REQUEST_TIMEOUT_MS,
    );
  });
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal?.aborted) {
      reject(new Error('Location request aborted'));
      return;
    }
    abortFromCaller = () => reject(new Error('Location request aborted'));
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  });

  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutPromise,
      abortPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortFromCaller) signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  const current = [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'is_day',
    'precipitation',
    'wind_speed_10m',
  ].join(',');
  const query = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current,
    timezone: 'auto',
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Weather request failed with HTTP ${response.status}`);
    const payload = await response.json() as OpenMeteoResponse;
    const weather = payload.current;
    if (
      !weather
      || !finiteNumber(weather.temperature_2m)
      || !finiteNumber(weather.apparent_temperature)
      || !finiteNumber(weather.weather_code)
      || !finiteNumber(weather.is_day)
      || !finiteNumber(weather.precipitation)
      || !finiteNumber(weather.wind_speed_10m)
    ) {
      throw new Error('Weather response is incomplete');
    }

    return {
      condition: conditionFromWeatherCode(weather.weather_code),
      temperatureC: Math.round(weather.temperature_2m),
      apparentTemperatureC: Math.round(weather.apparent_temperature),
      isDay: weather.is_day === 1,
      precipitationMm: weather.precipitation,
      windSpeedKph: Math.round(weather.wind_speed_10m),
      fetchedAt: Date.now(),
      source: 'live',
      timezone: payload.timezone,
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function loadWeather(options?: {
  requestPermission?: boolean;
  signal?: AbortSignal;
}): Promise<WeatherLoadResult> {
  const simulated = createSimulatedWeather();

  if (Platform.OS === 'web') {
    return { snapshot: simulated, permission: 'unavailable' };
  }

  let permission: Location.LocationPermissionResponse;
  try {
    permission = await resolvePermission(options?.requestPermission === true);
  } catch {
    return { snapshot: simulated, permission: 'unavailable', error: 'location-failed' };
  }

  const resolvedPermission = permissionState(permission);
  if (!permission.granted) {
    return {
      snapshot: simulated,
      permission: resolvedPermission,
      error: permission.status === Location.PermissionStatus.DENIED ? 'permission-denied' : undefined,
    };
  }

  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { snapshot: simulated, permission: 'granted', error: 'location-disabled' };
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: LAST_LOCATION_MAX_AGE_MS,
      requiredAccuracy: 50_000,
    });
    const location = lastKnown ?? await getCurrentPositionWithTimeout(options?.signal);
    const snapshot = await fetchCurrentWeather(
      location.coords.latitude,
      location.coords.longitude,
      options?.signal,
    );
    await cacheWeather(snapshot);
    return { snapshot, permission: 'granted' };
  } catch {
    const cached = await readCachedWeather();
    if (cached) {
      return { snapshot: cached, permission: 'granted', error: 'network-failed' };
    }
    return { snapshot: simulated, permission: 'granted', error: 'network-failed' };
  }
}
