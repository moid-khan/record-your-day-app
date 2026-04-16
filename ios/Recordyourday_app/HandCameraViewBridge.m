// Paper bridge for HandCameraView
// Works with Fabric through React Native's interop layer

#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>

@interface RCT_EXTERN_MODULE(HandCameraViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(onHandStatusChange, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onReady, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRecordingStarted, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRecordingPaused, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRecordingResumed, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRecordingCompleted, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onVoiceCommand, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onClapDetected, RCTDirectEventBlock)

RCT_EXPORT_VIEW_PROPERTY(enableVoiceStart, BOOL)
RCT_EXPORT_VIEW_PROPERTY(requireHandsForVoiceStart, BOOL)
RCT_EXPORT_VIEW_PROPERTY(enableClapStart, BOOL)

RCT_EXTERN_METHOD(start:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(stop:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(startRecording:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(pauseRecording:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(resumeRecording:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(stopRecording:(nonnull NSNumber *)node)
RCT_EXTERN_METHOD(speakCue:(nonnull NSNumber *)node text:(NSString *)text)
RCT_EXTERN_METHOD(testBeep:(nonnull NSNumber *)node)

@end
