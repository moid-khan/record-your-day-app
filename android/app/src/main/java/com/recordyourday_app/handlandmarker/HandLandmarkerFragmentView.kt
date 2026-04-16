package com.recordyourday_app.handlandmarker

import android.util.Log
import android.view.View
import android.widget.FrameLayout
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

class HandLandmarkerFragmentView(
    private val reactContext: ReactContext
) : FrameLayout(reactContext), HandLandmarkerFragment.ExtendedListener {

    private var fragmentTag: String = ""
    private var isActive = false
    private var handDetectionThreshold = 0.5f
    private var handTrackingThreshold = 0.5f
    private var handPresenceThreshold = 0.5f
    private var attachAttempts = 0
    private val maxAttachAttempts = 10

    init {
        id = View.generateViewId()
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        Log.d(TAG, "Created HandLandmarkerFragmentView (id=$id)")
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.d(TAG, "onAttachedToWindow - dimensions: ${width}x${height}")
        attachAttempts = 0
        post { attachFragment() }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        val w = right - left
        val h = bottom - top
        Log.d(TAG, "onLayout - dimensions: ${w}x${h}, changed=$changed")
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        removeFragment()
        attachAttempts = 0
    }

    fun setActive(active: Boolean) {
        Log.d(TAG, "HandLandmarkerFragmentView.setActive called: $active (was: $isActive)")
        isActive = active
        val fragment = getFragment()
        if (fragment != null) {
            Log.d(TAG, "Fragment found, calling setActive on fragment")
            fragment.setActive(active)
        } else {
            Log.w(TAG, "Fragment is null, cannot set active state")
        }
    }
    
    // Recording methods
    fun startRecording() {
        getFragment()?.startRecording()
    }
    
    fun stopRecording() {
        getFragment()?.stopRecording()
    }
    
    fun pauseRecording() {
        getFragment()?.pauseRecording()
    }
    
    fun resumeRecording() {
        getFragment()?.resumeRecording()
    }
    
    // Voice command methods
    fun setEnableVoiceStart(enable: Boolean) {
        getFragment()?.setEnableVoiceStart(enable)
    }
    
    fun setRequireHandsForVoiceStart(require: Boolean) {
        getFragment()?.setRequireHandsForVoiceStart(require)
    }

    fun updateConfidenceThresholds(
        handDetection: Float,
        handTracking: Float,
        handPresence: Float
    ) {
        handDetectionThreshold = handDetection
        handTrackingThreshold = handTracking
        handPresenceThreshold = handPresence
        getFragment()?.updateConfidenceThresholds(
            handDetectionThreshold,
            handTrackingThreshold,
            handPresenceThreshold
        )
    }

    private fun attachFragment() {
        if (width == 0 || height == 0) {
            if (attachAttempts < maxAttachAttempts) {
                attachAttempts += 1
                Log.d(TAG, "FragmentView has no size (w=$width h=$height), attempt $attachAttempts/$maxAttachAttempts")
                postDelayed({ attachFragment() }, 100)
            } else {
                Log.e(TAG, "FragmentView has no size after $maxAttachAttempts attempts (w=$width h=$height)")
            }
            return
        }
        
        Log.d(TAG, "FragmentView has size: ${width}x${height}, attaching fragment")
        
        val activity = reactContext.currentActivity as? FragmentActivity ?: run {
            if (attachAttempts < maxAttachAttempts) {
                attachAttempts += 1
                Log.d(TAG, "Activity not ready, attempt $attachAttempts/$maxAttachAttempts")
                postDelayed({ attachFragment() }, 100)
            } else {
                Log.e(TAG, "Current activity is not FragmentActivity after $maxAttachAttempts attempts")
            }
            return
        }
        fragmentTag = "HandLandmarkerFragment_$id"
        val fm = activity.supportFragmentManager
        var fragment = fm.findFragmentByTag(fragmentTag) as? HandLandmarkerFragment
        if (fragment == null) {
            fragment = HandLandmarkerFragment()
            // Use commit() instead of commitNowAllowingStateLoss() to allow proper layout
            fm.beginTransaction()
                .replace(id, fragment, fragmentTag)
                .commitAllowingStateLoss()
            
            // Wait for fragment transaction to complete
            fm.executePendingTransactions()
        }
        fragment.setListener(this)
        fragment.setActive(isActive)
        fragment.updateConfidenceThresholds(
            handDetectionThreshold,
            handTrackingThreshold,
            handPresenceThreshold
        )
        Log.d(TAG, "HandLandmarkerFragment attached (tag=$fragmentTag)")
    }

    private fun removeFragment() {
        val activity = reactContext.currentActivity as? FragmentActivity ?: return
        val fm = activity.supportFragmentManager
        val fragment = fm.findFragmentByTag(fragmentTag)
        fragment?.let {
            fm.beginTransaction()
                .remove(it)
                .commitNowAllowingStateLoss()
        }
    }

    private fun getFragment(): HandLandmarkerFragment? {
        val activity = reactContext.currentActivity as? FragmentActivity ?: return null
        val fm = activity.supportFragmentManager
        return fm.findFragmentByTag(fragmentTag) as? HandLandmarkerFragment
    }

    override fun onReady() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onReady", event)
    }

    override fun onHandsDetected(count: Int) {
        val event = Arguments.createMap().apply {
            putInt("handsDetected", count)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onHandsDetected", event)
    }

    override fun onError(message: String) {
        val event = Arguments.createMap().apply {
            putString("error", message)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onError", event)
    }
    
    // New method for detailed hand status (like iOS)
    fun onHandStatusChange(
        handCount: Int,
        valid: Boolean,
        handInFrame: Boolean,
        handsFullyInFrame: Boolean
    ) {
        val event = Arguments.createMap().apply {
            putInt("handCount", handCount)
            putBoolean("valid", valid)
            putBoolean("handInFrame", handInFrame)
            putBoolean("handsFullyInFrame", handsFullyInFrame)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onHandStatusChange", event)
    }
    
    // Recording event handlers
    override fun onRecordingStarted() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onRecordingStarted", event)
    }
    
    override fun onRecordingPaused() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onRecordingPaused", event)
    }
    
    override fun onRecordingResumed() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onRecordingResumed", event)
    }
    
    override fun onRecordingCompleted(filePath: String, duration: Double) {
        val event = Arguments.createMap().apply {
            putString("filePath", filePath)
            putDouble("duration", duration)
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onRecordingCompleted", event)
    }
    
    override fun onVoiceCommand(command: String, accepted: Boolean, reason: String?) {
        val event = Arguments.createMap().apply {
            putString("command", command)
            putBoolean("accepted", accepted)
            if (reason != null) {
                putString("reason", reason)
            }
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onVoiceCommand", event)
    }

    companion object {
        private const val TAG = "HandLandmarkerFragmentView"
    }
}
