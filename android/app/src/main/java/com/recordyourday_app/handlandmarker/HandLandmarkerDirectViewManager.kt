package com.recordyourday_app.handlandmarker

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class HandLandmarkerDirectViewManager : SimpleViewManager<HandLandmarkerDirectView>() {

    override fun getName(): String {
        return "HandLandmarkerDirectView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): HandLandmarkerDirectView {
        return HandLandmarkerDirectView(reactContext)
    }
    
    // Called after all props are set - like vision-camera
    override fun onAfterUpdateTransaction(view: HandLandmarkerDirectView) {
        super.onAfterUpdateTransaction(view)
        view.update()
    }

    @ReactProp(name = "isActive", defaultBoolean = false)
    fun setIsActive(view: HandLandmarkerDirectView, isActive: Boolean) {
        android.util.Log.d("HandLandmarkerDirectViewManager", "setIsActive called: $isActive")
        view.setActive(isActive)
    }

    @ReactProp(name = "confidenceThresholds")
    fun setConfidenceThresholds(view: HandLandmarkerDirectView, thresholds: ReadableArray?) {
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

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return mapOf(
            "onHandsDetected" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onHandsDetected")),
            "onError" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onError")),
            "onReady" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onReady"))
        )
    }
}
