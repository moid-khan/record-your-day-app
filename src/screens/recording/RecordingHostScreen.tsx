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
import { useIsFocused, useNavigation, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import {
  HandCameraView,
  type HandCameraViewRef,
} from '../../components/HandCameraView';
import { useTaskStore } from '../../state/useTaskStore';
import { useRecordingStore } from '../../state/useRecordingStore';
import { colors, spacing } from '../../theme';
import type { TabParamList } from '../../navigation/AppNavigator';
import Sound from 'react-native-nitro-sound';

const { width, height } = Dimensions.get('window');

export function RecordingHostScreen() {
  const navigation = useNavigation<any>();
  const [status, setStatus] = useState('Initializing...');
  const [cameraReady, setCameraReady] = useState(false);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const mountedRef = useRef(true);
  const cameraRef = useRef<HandCameraViewRef>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // Elapsed time in seconds
  const [_recordedFilePath, setRecordedFilePath] = useState<string | null>(
    null,
  );
  const [handInFrame, setHandInFrame] = useState(true);
  const [showHandsCountdown, setShowHandsCountdown] = useState<number | null>(
    null,
  );
  const outOfFrameSinceRef = useRef<number | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [voiceFilePath, setVoiceFilePath] = useState<string | null>(null);
  const [voiceMeterBars, setVoiceMeterBars] = useState<number[]>([]);
  const firedRolePlayCueIdsRef = useRef<Set<string>>(new Set());

  // Task from store
  const { currentTask, autoStart, setAutoStart, clearTask } = useTaskStore();
  const { setIsRecording: setGlobalRecording, setIsTabLocked } =
    useRecordingStore();
  const isVideoTask = currentTask?.taskType === 'video';
  const isVoiceTask = currentTask?.taskType === 'voice';
  const isRolePlayTask = currentTask?.taskType === 'rolePlay';

  // Control camera with isActive prop
  const [isActive, setIsActive] = useState(false);

  // Timer for recording elapsed time
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    console.log('🚀 RecordingHostScreen mounted');
    mountedRef.current = true;

    return () => {
      console.log('👋 RecordingHostScreen unmounting');
      mountedRef.current = false;
      setIsActive(false);
      // If user leaves the recording screen, unlock tabs.
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
    if (numOnly) return Number(numOnly[1]) * 60; // assume minutes
    return null;
  };

  const taskDurationSeconds = parseDurationSeconds(currentTask?.duration);

  const startRecording = useCallback(async () => {
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
        // nitro-sound's documented defaults:
        // - iOS: {cacheDir}/sound.m4a
        // - Android: {cacheDir}/sound.mp4
        // We'll use defaults for stability; you can change later if backend requires.
        const meteringEnabled = Boolean(currentTask?.showWaveform);
        const uri = await Sound.startRecorder(
          undefined,
          undefined,
          meteringEnabled,
        );
        setVoiceFilePath(uri);
        if (meteringEnabled) {
          // Drive waveform off metering (currentMetering) while recording.
          Sound.addRecordBackListener(e => {
            const metering =
              typeof e?.currentMetering === 'number' ? e.currentMetering : null;
            if (metering == null) return;
            // iOS metering commonly comes as negative dBFS (e.g. -160..0).
            const clamped = Math.max(-60, Math.min(0, metering));
            const normalized = (clamped + 60) / 60; // 0..1
            setVoiceMeterBars(prev => {
              const next = [...prev, normalized];
              // keep last 32 samples
              return next.length > 32 ? next.slice(next.length - 32) : next;
            });
          });
        }
        setIsRecording(true);
        setGlobalRecording(true); // Lock tabs
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

    // Video / Role-Play path (both iOS and Android now use HandCameraView)
    if (cameraRef.current) {
      console.log('📹 Starting recording...');
      cameraRef.current.startRecording();
      setIsRecording(true);
      setGlobalRecording(true); // Lock tabs
      setIsPaused(false);
      setRecordingTime(0);
      setIsStopping(false);
    }
  }, [
    isRecording,
    isVoiceTask,
    taskDurationSeconds,
    setGlobalRecording,
    currentTask?.showWaveform,
  ]);

  const resumeRecording = useCallback(() => {
    if (isVoiceTask) return; // no pause/resume for voice path
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
      // Navigate back to Bounties and clear task
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          clearTask();
          setCameraReady(false);
          setIsActive(false);
          setAutoStart(false);
          setIsTabLocked(false);
          
          // Navigate to Bounties tab using CommonActions for reliable tab navigation
          try {
            navigation.dispatch(
              CommonActions.navigate({
                name: 'Bounties',
              })
            );
            console.log('✅ Navigated to Bounties tab using CommonActions (voice)');
          } catch (error) {
            console.warn('Failed to navigate with CommonActions:', error);
            // Fallback: try direct navigation
            try {
              navigation.navigate('Bounties' as keyof TabParamList);
              console.log('✅ Navigated to Bounties tab via direct navigation (voice)');
            } catch (e) {
              console.error('Navigation failed completely:', e);
            }
          }
        }, 300);
      });
      return;
    }

    // Video stop (works on both iOS and Android)
    if (cameraRef.current) {
      console.log('⏹️ Stopping recording...');
      cameraRef.current.stopRecording();
      setIsRecording(false);
      setGlobalRecording(false); // Unlock tabs
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
    setAutoStart,
    setIsTabLocked,
  ]);

  // Activate camera ONLY when focused AND there's a task AND after navigation settled (video only)
  useEffect(() => {
    if (isFocused) {
      // If no task, show "No active task" message
      if (!currentTask) {
        console.log('📱 No task selected, showing message');
        setIsActive(false);
        setCameraReady(false);
        setStatus('No active task');
        setRecordedFilePath(null);
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
        '📱 Tab focused with task, waiting for navigation to settle...',
      );

      // Wait for all navigation animations to complete
      const task = InteractionManager.runAfterInteractions(() => {
        // Additional delay to ensure navigation stack is stable
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
      console.log('📴 Tab blurred, deactivating camera');
      setIsActive(false);
      setCameraReady(false);
      setStatus('Camera paused');
      // Stop recording if active
      if (isRecording) {
        stopRecording();
      }
    }
  }, [
    isFocused,
    currentTask,
    isRecording,
    stopRecording,
    isVideoTask,
    isRolePlayTask,
  ]);

  // Intentionally NO auto-start.
  // Video recording should start only via:
  // - Start button
  // - Voice command ("start")

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

  // Role-Play cue scheduler (dummy data): fire cues at timestamps during active recording time.
  // - pauses automatically because recordingTime stops incrementing when paused
  // - no duplicates due to firedRolePlayCueIdsRef
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

  // Reset fired cues when recording stops / resets
  useEffect(() => {
    if (!isRecording) {
      firedRolePlayCueIdsRef.current = new Set();
    }
  }, [isRecording]);

  // Countdown warning when recording is active but no hands are in frame.
  // Auto-pause after 30s continuous out-of-frame and show warning during that window.
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

    // Hands just went out of frame - play beep sound
    if (outOfFrameSinceRef.current == null) {
      outOfFrameSinceRef.current = Date.now();
      // Play beep sound (matching iOS behavior)
      try {
        // Use system beep sound - platform will handle the actual sound
        if (Platform.OS === 'android') {
          // Android: Use ToneGenerator for beep sound
          const { NativeModules } = require('react-native');
          NativeModules.HandCameraViewManager?.playBeepSound?.();
        } else {
          // iOS: Already handled natively in BeepSoundService
          // But we can trigger it from JS if needed
          console.log('🔊 Beep sound (iOS handles natively)');
        }
      } catch (e) {
        console.warn('Failed to play beep sound:', e);
      }
    }

    const interval = setInterval(() => {
      const since = outOfFrameSinceRef.current;
      if (since == null) return;
      const elapsedSec = (Date.now() - since) / 1000;
      const remaining = Math.max(0, Math.ceil(30 - elapsedSec));
      setShowHandsCountdown(remaining);

      // Auto-pause when countdown reaches 0
      if (remaining === 0 && !isPaused) {
        console.log('⏸️ Hands out of frame for 30s, pausing recording');
        cameraRef.current?.pauseRecording();
        setIsPaused(true);
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, handInFrame]);

  // Auto-stop at task duration (counts ACTIVE recording time only)
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

  const handleRecordingCompleted = (event: any) => {
    // This handler is for video (native) recordings only.
    const filePath = event?.nativeEvent?.filePath;
    const duration = event?.nativeEvent?.duration;

    console.log('✅ Recording completed:', { filePath, duration });

    // Stop recording state
    setIsRecording(false);
    setGlobalRecording(false); // Unlock tabs
    setIsPaused(false);
    if (filePath) setRecordedFilePath(filePath);
    setIsStopping(false);

    // TODO: Upload to server using filePath
    // Example: await uploadVideo(filePath, currentTask?.id);

    // For now, just show success message
    setStatus(`Recording saved: ${filePath}`);

    // Task completed: clear current task and navigate back to Bounties
    // Use InteractionManager to ensure navigation happens after all state updates
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        clearTask();
        setRecordedFilePath(null);
        setCameraReady(false);
        setIsActive(false);
        setAutoStart(false);
        setIsTabLocked(false);
        
        // Navigate to Bounties tab using CommonActions for reliable tab navigation
        try {
          navigation.dispatch(
            CommonActions.navigate({
              name: 'Bounties',
            })
          );
          console.log('✅ Navigated to Bounties tab using CommonActions');
        } catch (error) {
          console.warn('Failed to navigate with CommonActions:', error);
          // Fallback: try direct navigation
          try {
            navigation.navigate('Bounties' as keyof TabParamList);
            console.log('✅ Navigated to Bounties tab via direct navigation');
          } catch (e) {
            console.error('Navigation failed completely:', e);
          }
        }
      }, 300);
    });
  };

  return (
    <View style={styles.container}>
      {/* Video/Role-Play task: show camera; Voice task: show mic UI; No task: placeholder */}
      {currentTask && (isVideoTask || isRolePlayTask) ? (
        <HandCameraView
          key="camera-view"
          ref={cameraRef}
          style={styles.camera}
          isActive={isActive}
          enableVoiceStart={Boolean(
            (isVideoTask || isRolePlayTask) && cameraReady && !isRecording,
          )}
          requireHandsForVoiceStart={true}
          onReady={() => {
            if (mountedRef.current && isFocused) {
              console.log('✅ Camera ready!');
              setCameraReady(true);
              setStatus('Camera ready');
            }
          }}
          onHandStatusChange={(event: any) => {
            if (!mountedRef.current || !isFocused) return;
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
            if (!mountedRef.current) return;
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
            console.log('✅ Recording started');
            setIsRecording(true);
            setGlobalRecording(true); // Lock tabs
            setIsPaused(false);
          }}
          onRecordingPaused={() => {
            console.log('⏸️ Recording paused');
            setIsPaused(true);
          }}
          onRecordingResumed={() => {
            console.log('▶️ Recording resumed');
            setIsPaused(false);
          }}
          onRecordingCompleted={handleRecordingCompleted}
          onVoiceCommand={(event: any) => {
            const data = event?.nativeEvent;
            if (!data) return;
            if (data.command === 'start' && data.accepted === true) {
              console.log('🎤 Voice start accepted, locking tabs');
              setStatus('✅ Voice start accepted');
              // IMPORTANT: Lock tabs IMMEDIATELY when voice command is accepted
              // This prevents the tab bar from showing during the recording start
              setIsTabLocked(true);
              setGlobalRecording(true);
            }
            if (data.command === 'start' && data.accepted === false) {
              if (data.reason === 'hands_not_in_frame') {
                setStatus('Show your hands, then say "start"');
              }
            }
          }}
        />
      ) : currentTask && currentTask.taskType === 'voice' ? (
        <View style={styles.voiceContainer}>
          <View style={styles.voiceMicCircle}>
            <Icon name="mic" size={48} color="#fff" />
          </View>
          <Text style={styles.timer}>{formatTime(recordingTime)}</Text>
          {/* Optional waveform preview */}
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
          {/* Optional on-screen script / instructions */}
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
      ) : (
        // Show placeholder when no task
        <View style={styles.noTaskContainer}>
          <Text style={styles.noTaskText}>No active task</Text>
          <Text style={styles.noTaskSubtext}>
            Select a task from the Bounties tab to start recording
          </Text>
        </View>
      )}

      {/* Recording UI Overlay */}
      {isRecording && (isVideoTask || isRolePlayTask) && (
        <View
          style={[styles.recordingOverlay, { top: insets.top + spacing.md }]}
        >
          {/* Recording Indicator */}
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>

          {/* Timer */}
          <Text style={styles.timer}>{formatTime(recordingTime)}</Text>

          {/* Play/Pause Button (only show when paused) */}
          {isPaused && (
            <Pressable style={styles.playButton} onPress={resumeRecording}>
              <Icon name="play" size={24} color={colors.text} />
            </Pressable>
          )}
        </View>
      )}

      {/* Warning when hands are not visible while recording */}
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

      {/* Status overlay when not recording - only show if there's a task and camera not ready */}
      {currentTask && !isRecording && !cameraReady && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{status}</Text>
        </View>
      )}

      {/* Start button overlay - only show for video tasks when camera is ready */}
      {currentTask &&
        !isRecording &&
        cameraReady &&
        (isVideoTask || isRolePlayTask) &&
        !autoStart && (
          <View style={styles.overlay}>
            <Text style={styles.voiceHintText}>
              Show your hands and say “start”
            </Text>
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
  camera: {
    flex: 1,
    width: width,
    minHeight: height - 150,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', // Less opaque so camera is visible
    pointerEvents: 'box-none', // Allow touches to pass through to camera
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
  noTaskContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: spacing.xl,
  },
  noTaskText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  noTaskSubtext: {
    color: colors.subduedText,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  recordingPathText: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  voiceHintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  // Android native camera styles
  androidCameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  taskInfoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl * 2,
  },
  taskTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  taskDescription: {
    color: colors.subduedText,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  taskDuration: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '600',
  },
  androidStartButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl * 2,
    paddingVertical: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 200,
  },
  androidStartButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  androidHint: {
    color: colors.subduedText,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
