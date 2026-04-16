import { PermissionsAndroid, Platform } from 'react-native';

export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Permission',
        message: 'We need access to your camera to capture content.',
        buttonPositive: 'Allow',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  // For iOS we assume permission is handled by the native prompt when accessing the camera.
  return true;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'We need access to your microphone to record audio.',
        buttonPositive: 'Allow',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!perm) {
      return true;
    }
    const result = await PermissionsAndroid.request(perm, {
      title: 'Notifications Permission',
      message: 'Allow notifications to stay updated.',
      buttonPositive: 'Allow',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}
