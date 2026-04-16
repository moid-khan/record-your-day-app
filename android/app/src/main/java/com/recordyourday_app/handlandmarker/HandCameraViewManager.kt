package com.recordyourday_app.handlandmarker

import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * ViewManager for HandCameraView - embeds camera in React Native screen
 * Matches iOS HandCameraView behavior
 */
class HandCameraViewManager(private val reactContext: ReactApplicationContext) : 
    SimpleViewManager<HandCameraViewNative>() {
    
    companion object {
        const val REACT_CLASS = "HandCameraView"
        
        // Commands
        const val COMMAND_START_RECORDING = 1
        const val COMMAND_STOP_RECORDING = 2
        const val COMMAND_PAUSE_RECORDING = 3
        const val COMMAND_RESUME_RECORDING = 4
    }
    
    override fun getName(): String = REACT_CLASS
    
    override fun createViewInstance(reactContext: ThemedReactContext): HandCameraViewNative {
        return HandCameraViewNative(reactContext)
    }
    
    @ReactProp(name = "isActive")
    fun setIsActive(view: HandCameraViewNative, isActive: Boolean) {
        view.setActive(isActive)
    }
    
    @ReactProp(name = "enableVoiceStart")
    fun setEnableVoiceStart(view: HandCameraViewNative, enable: Boolean) {
        view.setEnableVoiceStart(enable)
    }
    
    @ReactProp(name = "requireHandsForVoiceStart")
    fun setRequireHandsForVoiceStart(view: HandCameraViewNative, require: Boolean) {
        view.setRequireHandsForVoiceStart(require)
    }

    @ReactProp(name = "enableClapStart")
    fun setEnableClapStart(view: HandCameraViewNative, enable: Boolean) {
        view.setEnableClapStart(enable)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onReady", MapBuilder.of("registrationName", "onReady"))
            .put("onHandStatusChange", MapBuilder.of("registrationName", "onHandStatusChange"))
            .put("onError", MapBuilder.of("registrationName", "onError"))
            .put("onRecordingStarted", MapBuilder.of("registrationName", "onRecordingStarted"))
            .put("onRecordingPaused", MapBuilder.of("registrationName", "onRecordingPaused"))
            .put("onRecordingResumed", MapBuilder.of("registrationName", "onRecordingResumed"))
            .put("onRecordingCompleted", MapBuilder.of("registrationName", "onRecordingCompleted"))
            .put("onClapDetected", MapBuilder.of("registrationName", "onClapDetected"))
            .build()
    }
    
    override fun getCommandsMap(): Map<String, Int> {
        return MapBuilder.of(
            "startRecording", COMMAND_START_RECORDING,
            "stopRecording", COMMAND_STOP_RECORDING,
            "pauseRecording", COMMAND_PAUSE_RECORDING,
            "resumeRecording", COMMAND_RESUME_RECORDING
        )
    }
    
    override fun receiveCommand(view: HandCameraViewNative, commandId: Int, args: ReadableArray?) {
        when (commandId) {
            COMMAND_START_RECORDING -> {
                android.util.Log.i("HandCameraViewManager", "📹 Received START_RECORDING command")
                view.startRecording()
            }
            COMMAND_STOP_RECORDING -> {
                android.util.Log.i("HandCameraViewManager", "⏹️ Received STOP_RECORDING command")
                view.stopRecording()
            }
            COMMAND_PAUSE_RECORDING -> {
                android.util.Log.i("HandCameraViewManager", "⏸️ Received PAUSE_RECORDING command")
                view.pauseRecording()
            }
            COMMAND_RESUME_RECORDING -> {
                android.util.Log.i("HandCameraViewManager", "▶️ Received RESUME_RECORDING command")
                view.resumeRecording()
            }
        }
    }
    
    override fun onDropViewInstance(view: HandCameraViewNative) {
        super.onDropViewInstance(view)
        view.cleanup()
    }
}
