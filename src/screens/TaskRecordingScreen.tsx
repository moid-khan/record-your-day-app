import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  InteractionManager,
  Pressable,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import {
  HandCameraView,
  type HandCameraViewRef,
  type RecordingCompletedEvent,
  type ClapDetectedEvent,
} from '../components/HandCameraView';
import { useTaskStore } from '../state/useTaskStore';
import { useRecordingStore } from '../state/useRecordingStore';
import { colors, spacing } from '../theme';
import type { AppStackParamList } from '../navigation/AppNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Sound from 'react-native-nitro-sound';

const { width, height } = Dimensions.get('window');

type TaskRecordingNavigationProp = NativeStackNavigationProp<
  AppStackParamList,
  'TaskRecording'
>;

export function TaskRecordingScreen() {
  const navigation = useNavigation<TaskRecordingNavigationProp>();
  const [status, setStatus] = useState('Initializing...');
  const [cameraReady, setCameraReady] = useState(false);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const cameraRef = useRef<HandCameraViewRef>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [_recordedFilePath, setRecordedFilePath] = useState<string | null>(
    null,
  );
  const [handInFrame, setHandInFrame] = useState(true);
  const [showHandsCountdown, setShowHandsCountdown] = useState<number | null>(
    null,
  );
  const outOfFrameSinceRef = useRef<number | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false); // Prevents clap restart after completion
  const [voiceFilePath, setVoiceFilePath] = useState<string | null>(null);
  const [voiceMeterBars, setVoiceMeterBars] = useState<number[]>([]);
  const firedRolePlayCueIdsRef = useRef<Set<string>>(new Set());

  // Task from store
  const { currentTask, clearTask } = useTaskStore();
  const { setIsRecording: setGlobalRecording, setIsTabLocked } =
    useRecordingStore();
  const isVideoTask = currentTask?.taskType === 'video';
  const isVoiceTask = currentTask?.taskType === 'voice';
  const isRolePlayTask = currentTask?.taskType === 'rolePlay';

  // Control camera with isActive prop
  const [isActive, setIsActive] = useState(false);

  // Timer for recording elapsed time
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track if we're in the process of navigating away
  const isNavigatingAwayRef = useRef(false);

  // Back navigation handler - only allow going back before recording starts
  const canGoBack = !isRecording && !isStopping;

  const handleGoBack = useCallback(() => {
    if (!canGoBack) return;

    // Mark navigating away FIRST to prevent blur handler from calling stop()
    isNavigatingAwayRef.current = true;
    setIsTabLocked(false);

    // Navigate - the native willMove(toSuperview:nil) will handle cleanup
    navigation.goBack();

    // Clear task after navigation has started
    setTimeout(() => {
      clearTask();
    }, 200);
  }, [canGoBack, navigation, setIsTabLocked, clearTask]);

  useEffect(() => {
    console.log('🚀 TaskRecordingScreen mounted');
    mountedRef.current = true;
    isNavigatingAwayRef.current = false;

    return () => {
      console.log('👋 TaskRecordingScreen unmounting');
      mountedRef.current = false;
      isNavigatingAwayRef.current = true;
      // DON'T set isActive=false here - the native willMove(toSuperview:nil) handles cleanup
      // Setting it here causes double-stop which crashes with FigCaptureSourceRemote errors
      setIsTabLocked(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [setIsTabLocked]);

  // Cleanup waveform listener if screen unmounts mid-recording
  useEffect(() => {
    return () => {
      try {
        Sound.removeRecordBackListener();
      } catch {}
    };
  }, []);

  const parseDurationSeconds = (duration?: string): number | null => {
    if (!duration) return null;
    const s = duration.trim().toLowerCase();
    const minMatch = s.match(/(\d+)\s*(min|mins|minute|minutes)\b/);
    if (minMatch) return Number(minMatch[1]) * 60;
    const secMatch = s.match(/(\d+)\s*(sec|secs|second|seconds)\b/);
    if (secMatch) return Number(secMatch[1]);
    const numOnly = s.match(/^(\d+)$/);
    if (numOnly) return Number(numOnly[1]) * 60;
    return null;
  };

  const taskDurationSeconds = parseDurationSeconds(currentTask?.duration);

  const startRecording = useCallback(async () => {
    console.log('📹 startRecording called, isVoiceTask:', isVoiceTask, 'isRecording:', isRecording);

    // Voice-only path
    if (isVoiceTask) {
      if (isRecording) return;
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setStatus('Microphone permission denied');
            return;
          }
        }
        const meteringEnabled = Boolean(currentTask?.showWaveform);
        const uri = await Sound.startRecorder(
          undefined,
          undefined,
          meteringEnabled,
        );
        setVoiceFilePath(uri);
        if (meteringEnabled) {
          Sound.addRecordBackListener(e => {
            const metering =
              typeof e?.currentMetering === 'number' ? e.currentMetering : null;
            if (metering == null) return;
            const clamped = Math.max(-60, Math.min(0, metering));
            const normalized = (clamped + 60) / 60;
            setVoiceMeterBars(prev => {
              const next = [...prev, normalized];
              return next.length > 32 ? next.slice(next.length - 32) : next;
            });
          });
        }
        setIsRecording(true);
        setGlobalRecording(true);
        setIsPaused(false);
        setRecordingTime(0);
        setIsStopping(false);
        setStatus('Recording...');
      } catch (e: any) {
        console.warn('Voice start error', e);
        setStatus('Error starting voice recording');
      }
      return;
    }

    // Video / Role-Play path
    console.log('📹 Video path - cameraRef.current:', cameraRef.current ? 'exists' : 'NULL');
    if (cameraRef.current) {
      console.log('📹 Calling cameraRef.current.startRecording()');
      cameraRef.current.startRecording();
      setIsRecording(true);
      setGlobalRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setIsStopping(false);
    } else {
      console.error('❌ cameraRef.current is null, cannot start recording!');
    }
  }, [isRecording, isVoiceTask, setGlobalRecording, currentTask?.showWaveform]);

  const resumeRecording = useCallback(() => {
    if (isVoiceTask) return;
    if (cameraRef.current) {
      console.log('▶️ Resuming recording...');
      cameraRef.current.resumeRecording();
      setIsPaused(false);
    }
  }, [isVoiceTask]);

  const stopRecording = useCallback(async () => {
    if (isStopping) return;
    setIsStopping(true);

    // Voice stop
    if (isVoiceTask) {
      isNavigatingAwayRef.current = true;
      setIsCompleting(true); // Prevent any restart of listeners
      try {
        const resultPath = await Sound.stopRecorder();
        Sound.removeRecordBackListener();
        const finalPath = resultPath || voiceFilePath;
        setVoiceFilePath(finalPath ?? null);
      } catch (e: any) {
        console.warn('Voice stop error', e);
      }
      setVoiceMeterBars([]);
      setIsRecording(false);
      setGlobalRecording(false);
      setIsPaused(false);
      setIsTabLocked(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsStopping(false);
      setStatus('Recording saved');
      setCameraReady(false);
      setIsActive(false);

      // Navigate back - voice tasks don't have native camera view issues
      setTimeout(() => {
        if (!mountedRef.current) return;
        navigation.goBack();
        setTimeout(() => {
          clearTask();
        }, 200);
      }, 100);
      return;
    }

    // Video stop
    if (cameraRef.current) {
      console.log('⏹️ Stopping recording...');
      cameraRef.current.stopRecording();
      setIsRecording(false);
      setGlobalRecording(false);
      setIsTabLocked(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsStopping(false);
    }
  }, [
    isVoiceTask,
    voiceFilePath,
    navigation,
    clearTask,
    isStopping,
    setGlobalRecording,
    setIsTabLocked,
  ]);

  // Activate camera when focused and there's a task
  useEffect(() => {
    if (isFocused) {
      // CRITICAL: Don't navigate back or do anything if we're in the process of completing recording
      // The completion handler will handle navigation with proper delays
      if (isCompleting || isNavigatingAwayRef.current) {
        return;
      }

      // No task selected - go back (only if not completing)
      if (!currentTask) {
        console.log('📱 No task selected, going back');
        navigation.goBack();
        return;
      }

      // Voice task: no camera needed
      if (currentTask.taskType === 'voice') {
        setIsActive(false);
        setCameraReady(true);
        setStatus('Voice task ready');
        return;
      }

      console.log(
        '📱 Screen focused with task, waiting for navigation to settle...',
      );

      const task = InteractionManager.runAfterInteractions(() => {
        const timer = setTimeout(() => {
          if (
            mountedRef.current &&
            isFocused &&
            currentTask &&
            (isVideoTask || isRolePlayTask)
          ) {
            console.log('✅ Navigation settled, activating camera');
            setIsActive(true);
            setStatus('Starting camera...');
          }
        }, 500);

        return () => clearTimeout(timer);
      });

      return () => {
        task.cancel();
      };
    } else {
      // Screen is blurred - but don't stop camera if we're navigating away
      // The willMove(toSuperview:nil) will handle cleanup during unmount
      if (!isNavigatingAwayRef.current) {
        console.log('📴 Screen blurred, deactivating camera');
        setIsActive(false);
        setCameraReady(false);
        setStatus('Camera paused');
        if (isRecording) {
          stopRecording();
        }
      } else {
        console.log(
          '📴 Screen blurred during navigation - letting willMove handle cleanup',
        );
      }
    }
  }, [
    isFocused,
    currentTask,
    isRecording,
    stopRecording,
    isVideoTask,
    isRolePlayTask,
    navigation,
    isCompleting,
  ]);

  // Recording timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Role-Play cue scheduler
  useEffect(() => {
    if (!isRolePlayTask || !isRecording || isPaused) return;
    const cues = currentTask?.rolePlayCues ?? [];
    if (!cues.length) return;

    for (const cue of cues) {
      const cueId = cue.id ?? `${cue.atSeconds}:${cue.text}`;
      if (firedRolePlayCueIdsRef.current.has(cueId)) continue;
      if (recordingTime >= cue.atSeconds) {
        firedRolePlayCueIdsRef.current.add(cueId);
        try {
          cameraRef.current?.speakCue?.(cue.text);
        } catch {}
      }
    }
  }, [
    currentTask?.rolePlayCues,
    isPaused,
    isRecording,
    isRolePlayTask,
    recordingTime,
  ]);

  // Reset fired cues when recording stops
  useEffect(() => {
    if (!isRecording) {
      firedRolePlayCueIdsRef.current = new Set();
    }
  }, [isRecording]);

  // Countdown warning when hands are out of frame
  useEffect(() => {
    if (!isRecording || isPaused) {
      outOfFrameSinceRef.current = null;
      setShowHandsCountdown(null);
      return;
    }

    if (handInFrame) {
      outOfFrameSinceRef.current = null;
      setShowHandsCountdown(null);
      return;
    }

    if (outOfFrameSinceRef.current == null) {
      outOfFrameSinceRef.current = Date.now();
    }

    const interval = setInterval(() => {
      const since = outOfFrameSinceRef.current;
      if (since == null) return;
      const elapsedSec = (Date.now() - since) / 1000;
      const remaining = Math.max(0, Math.ceil(30 - elapsedSec));
      setShowHandsCountdown(remaining);

      if (remaining === 0 && !isPaused) {
        console.log('⏸️ Hands out of frame for 30s, pausing recording');
        cameraRef.current?.pauseRecording();
        setIsPaused(true);
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, handInFrame]);

  // Auto-stop at task duration
  useEffect(() => {
    if (!taskDurationSeconds) return;
    if (!isRecording) return;
    if (isPaused) return;
    if (recordingTime >= taskDurationSeconds) {
      console.log('⏱️ Task duration reached, stopping recording');
      stopRecording();
    }
  }, [
    taskDurationSeconds,
    isRecording,
    isPaused,
    recordingTime,
    stopRecording,
  ]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const handleRecordingCompleted = (event: RecordingCompletedEvent) => {
    const { filePath, duration, imuDataPath } = event.nativeEvent;

    console.log('✅ Recording completed:', { filePath, duration, imuDataPath });

    // Mark that we're navigating away to prevent late callbacks
    isNavigatingAwayRef.current = true;

    // Update React state but DON'T set isActive=false yet
    // Setting isActive=false triggers stop() call, but we want willMove(toSuperview:nil)
    // to handle the cleanup - calling stop() twice causes FigCaptureSourceRemote crashes
    setIsRecording(false);
    setGlobalRecording(false);
    setIsPaused(false);
    if (filePath) setRecordedFilePath(filePath);
    setIsStopping(false);
    setIsCompleting(true); // Prevents clap restart

    setStatus(`Recording saved!`);
    setCameraReady(false);
    setIsTabLocked(false);

    // Navigate back - let React Navigation unmount the screen naturally
    // The native willMove(toSuperview:nil) will handle camera cleanup ONCE
    // DON'T set isActive=false before this - it causes double-stop crash
    setTimeout(() => {
      if (!mountedRef.current) return;
      console.log('🚀 Navigating back...');
      navigation.goBack();

      // Clear task AFTER navigation has started
      setTimeout(() => {
        clearTask();
      }, 200);
    }, 100);
  };

  return (
    <View style={styles.container}>
      {/* Back button - only visible when not recording */}
      {canGoBack && (
        <Pressable
          style={[
            styles.backButton,
            { top: Math.max(insets.top, 44) + spacing.sm },
          ]}
          onPress={handleGoBack}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Icon name="x" size={24} color="#fff" />
        </Pressable>
      )}

      {/* Video/Role-Play task: show camera */}
      {/* Keep camera rendered even when completing - let React Navigation handle unmount */}
      {currentTask && (isVideoTask || isRolePlayTask) ? (
        <HandCameraView
          key="camera-view"
          ref={cameraRef}
          style={styles.camera}
          isActive={isActive}
          enableClapStart={Boolean(
            (isVideoTask || isRolePlayTask) &&
              cameraReady &&
              !isRecording &&
              !isCompleting,
          )}
          onReady={() => {
            if (
              mountedRef.current &&
              isFocused &&
              !isNavigatingAwayRef.current
            ) {
              console.log('✅ Camera ready!');
              setCameraReady(true);
              setStatus('Camera ready');
            }
          }}
          onHandStatusChange={(event: any) => {
            if (
              !mountedRef.current ||
              !isFocused ||
              isNavigatingAwayRef.current
            )
              return;
            const data = event?.nativeEvent;
            if (data) {
              setHandInFrame(Boolean(data.handInFrame));
              setStatus(
                `Hands: ${data.handCount || 0}, Valid: ${
                  data.valid ? 'Yes' : 'No'
                }`,
              );
            }
          }}
          onError={(event: any) => {
            if (!mountedRef.current || isNavigatingAwayRef.current) return;
            const message = event?.nativeEvent?.message || 'Unknown error';
            console.warn('❌ Camera error:', message);
            setStatus(`Error: ${message}`);
            if (isRecording) {
              setIsRecording(false);
              setGlobalRecording(false);
              setIsTabLocked(false);
              setIsPaused(false);
              setIsStopping(false);
            }
          }}
          onRecordingStarted={() => {
            if (!mountedRef.current || isNavigatingAwayRef.current) return;
            console.log('✅ Recording started');
            setIsRecording(true);
            setGlobalRecording(true);
            setIsPaused(false);
          }}
          onRecordingPaused={() => {
            if (!mountedRef.current || isNavigatingAwayRef.current) return;
            console.log('⏸️ Recording paused');
            setIsPaused(true);
          }}
          onRecordingResumed={() => {
            if (!mountedRef.current || isNavigatingAwayRef.current) return;
            console.log('▶️ Recording resumed');
            setIsPaused(false);
          }}
          onRecordingCompleted={handleRecordingCompleted}
          onClapDetected={(event: ClapDetectedEvent) => {
            if (!mountedRef.current || isNavigatingAwayRef.current) return;
            const { accepted } = event.nativeEvent;
            if (accepted && !isRecording) {
              console.log('👏 Clap detected, starting recording');
              setStatus('👏 Clap detected!');
              startRecording();
            }
          }}
        />
      ) : currentTask && currentTask.taskType === 'voice' ? (
        <View style={styles.voiceContainer}>
          <View style={styles.voiceMicCircle}>
            <Icon name="mic" size={48} color="#fff" />
          </View>
          <Text style={styles.timer}>{formatTime(recordingTime)}</Text>
          {currentTask?.showWaveform ? (
            <View style={styles.waveformRow}>
              {voiceMeterBars.length ? (
                voiceMeterBars.map((v, idx) => (
                  <View
                    key={idx}
                    style={[styles.waveBar, { height: 6 + Math.round(v * 34) }]}
                  />
                ))
              ) : (
                <Text style={styles.waveformHint}>
                  {isRecording ? 'Listening…' : 'Tap Start to begin'}
                </Text>
              )}
            </View>
          ) : null}
          {currentTask?.description ? (
            <Text style={styles.voiceInstructions}>
              {currentTask.description}
            </Text>
          ) : null}
          <Pressable
            style={[styles.startButton, isRecording && styles.stopButton]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.startButtonText}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Recording UI Overlay */}
      {isRecording && (isVideoTask || isRolePlayTask) && (
        <View
          style={[styles.recordingOverlay, { top: insets.top + spacing.md }]}
        >
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
          <Text style={styles.timer}>{formatTime(recordingTime)}</Text>
          {isPaused && (
            <Pressable style={styles.playButton} onPress={resumeRecording}>
              <Icon name="play" size={24} color={colors.text} />
            </Pressable>
          )}
        </View>
      )}

      {/* Warning when hands are not visible */}
      {(isVideoTask || isRolePlayTask) &&
      isRecording &&
      !isPaused &&
      !handInFrame &&
      showHandsCountdown != null ? (
        <View style={[styles.warningBanner, { top: insets.top + 80 }]}>
          <Text style={styles.warningText}>
            Show your hands — recording will pause in {showHandsCountdown}s
          </Text>
        </View>
      ) : null}

      {/* Status overlay when not recording */}
      {currentTask && !isRecording && !cameraReady && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{status}</Text>
        </View>
      )}

      {/* Start button overlay - clap instruction */}
      {currentTask &&
        !isRecording &&
        cameraReady &&
        (isVideoTask || isRolePlayTask) && (
          <View style={styles.overlay}>
            <Text style={styles.clapHintText}>👏 Clap to start recording</Text>
            <Text style={styles.clapSubtext}>or tap the button below</Text>
            <Pressable style={styles.startButton} onPress={startRecording}>
              <Text style={styles.startButtonText}>Start Recording</Text>
            </Pressable>
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
    width: width,
    minHeight: height - 150,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    pointerEvents: 'box-none',
  },
  overlayText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: spacing.xl,
  },
  voiceMicCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  voiceInstructions: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  waveformRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  waveformHint: {
    color: colors.subduedText,
    fontSize: 13,
  },
  stopButton: {
    backgroundColor: '#c0392b',
  },
  recordingOverlay: {
    position: 'absolute',
    top: spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,0,0.8)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 4,
    marginBottom: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: spacing.xs,
  },
  recordingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  timer: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  playButton: {
    marginTop: spacing.md,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 165, 0, 0.9)',
  },
  warningText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  clapHintText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  clapSubtext: {
    color: colors.subduedText,
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
});
