import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraType,
  type CameraViewProps,
} from 'expo-camera';
import {
  createCameraCaptureResultFromPicture,
  createPermissionGate,
  normalizePermissionStatus,
  type MediaCaptureResult,
  type PermissionGate,
} from './mediaRuntime';

const canUsePermission = (status: string | undefined) => status === 'granted' || status === 'limited';

interface NativeVideoCallCameraController {
  permissionGate: PermissionGate;
  isNativeAvailable: boolean;
  requestVideoCallPermissions: () => Promise<PermissionGate>;
  normalizePicture: (picture: Partial<CameraCapturedPicture>) => MediaCaptureResult;
}

export function useNativeVideoCallCamera(): NativeVideoCallCameraController {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const isNativeAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

  const permissionGate = useMemo(
    () => createPermissionGate('videoPreview', {
      camera: normalizePermissionStatus(cameraPermission || undefined),
    }),
    [cameraPermission],
  );

  const requestVideoCallPermissions = useCallback(async () => {
    if (!isNativeAvailable) return permissionGate;
    if (permissionGate.allowed) return permissionGate;

    const cameraStatus = normalizePermissionStatus(cameraPermission || undefined);
    const camera = canUsePermission(cameraStatus)
      ? cameraPermission
      : await requestCameraPermission();

    return createPermissionGate('videoPreview', {
      camera: normalizePermissionStatus(camera || undefined),
    });
  }, [cameraPermission, isNativeAvailable, permissionGate, requestCameraPermission]);

  const normalizePicture = useCallback((picture: Partial<CameraCapturedPicture>) => (
    createCameraCaptureResultFromPicture(picture)
  ), []);

  return {
    permissionGate,
    isNativeAvailable,
    requestVideoCallPermissions,
    normalizePicture,
  };
}

export function NativeSelfCameraPreview({
  active,
  muted,
  facing = 'front',
  style,
  onPermissionGate,
  onPreviewError,
}: {
  active: boolean;
  muted: boolean;
  facing?: CameraType;
  style?: StyleProp<ViewStyle>;
  onPermissionGate?: (gate: PermissionGate) => void;
  onPreviewError?: (message: string) => void;
}) {
  const {
    permissionGate,
    isNativeAvailable,
    requestVideoCallPermissions,
  } = useNativeVideoCallCamera();
  const hasRequestedRef = useRef(false);
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      hasRequestedRef.current = false;
      setMountError(null);
      return;
    }
    if (!isNativeAvailable || permissionGate.allowed || hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void requestVideoCallPermissions().then(onPermissionGate);
  }, [active, isNativeAvailable, onPermissionGate, permissionGate.allowed, requestVideoCallPermissions]);

  if (!active || !isNativeAvailable || !permissionGate.allowed || mountError) return null;

  const cameraProps: CameraViewProps = {
    style,
    facing,
    mode: 'video',
    mute: muted,
    mirror: facing === 'front',
    active,
    onMountError: (event) => {
      const message = event.message || 'Camera preview could not start';
      setMountError(message);
      onPreviewError?.(message);
      console.warn(message);
    },
  };

  return <CameraView {...cameraProps} />;
}
