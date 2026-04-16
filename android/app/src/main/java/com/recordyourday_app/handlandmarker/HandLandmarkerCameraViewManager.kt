package com.recordyourday_app.handlandmarker

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class HandLandmarkerCameraViewManager : SimpleViewManager<HandLandmarkerFragmentView>() {

    override fun getName(): String {
        return "HandLandmarkerCameraView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): HandLandmarkerFragmentView {
        return HandLandmarkerFragmentView(reactContext)
    }

    @ReactProp(name = "isActive", defaultBoolean = false)
    fun setIsActive(view: HandLandmarkerFragmentView, isActive: Boolean) {
        android.util.Log.d("HandLandmarkerCameraViewManager", "🔵 setIsActive prop called: $isActive")
        view.setActive(isActive)
    }

    @ReactProp(name = "confidenceThresholds")
    fun setConfidenceThresholds(view: HandLandmarkerFragmentView, thresholds: ReadableArray?) {
        thresholds?.let {
            if (it.size() >= 3) {
                view.updateConfidenceThresholds(
                    it.getDouble(0).toFloat(),
                    it.getDouble(1).toFloat(),
                    it.getDouble(2).toFloat()
                )
            }
        }
    }

    @ReactProp(name = "enableVoiceStart", defaultBoolean = false)
    fun setEnableVoiceStart(view: HandLandmarkerFragmentView, enable: Boolean) {
        view.setEnableVoiceStart(enable)
    }
    
    @ReactProp(name = "requireHandsForVoiceStart", defaultBoolean = true)
    fun setRequireHandsForVoiceStart(view: HandLandmarkerFragmentView, require: Boolean) {
        view.setRequireHandsForVoiceStart(require)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return mapOf(
            "onHandsDetected" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onHandsDetected")),
            "onError" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onError")),
            "onReady" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onReady")),
            "onHandStatusChange" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onHandStatusChange")),
            "onRecordingStarted" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onRecordingStarted")),
            "onRecordingPaused" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onRecordingPaused")),
            "onRecordingResumed" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onRecordingResumed")),
            "onRecordingCompleted" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onRecordingCompleted")),
            "onVoiceCommand" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onVoiceCommand"))
        )
    }
}
