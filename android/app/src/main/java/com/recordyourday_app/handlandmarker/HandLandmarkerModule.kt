package com.recordyourday_app.handlandmarker

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class HandLandmarkerModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {
    
    companion object {
        private const val TAG = "HandLandmarkerModule"
        private const val REQUEST_CODE_RECORDING = 1001
    }
    
    private var recordingPromise: Promise? = null
    
    init {
        reactContext.addActivityEventListener(this)
    }
    
    override fun getName(): String {
        return "HandLandmarkerModule"
    }
    
    @ReactMethod
    fun startRecording(durationSeconds: Int, promise: Promise) {
        val activity = reactContext.currentActivity
        
        if (activity == null) {
            promise.reject("ERROR", "Activity is null")
            return
        }
        
        if (recordingPromise != null) {
            promise.reject("ERROR", "Recording already in progress")
            return
        }
        
        try {
            recordingPromise = promise
            
            val intent = Intent(activity, HandLandmarkerActivity::class.java)
            intent.putExtra(HandLandmarkerActivity.EXTRA_DURATION, durationSeconds * 1000L)
            
            activity.startActivityForResult(intent, REQUEST_CODE_RECORDING)
            Log.i(TAG, "Started HandLandmarkerActivity with duration: ${durationSeconds}s")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting recording", e)
            recordingPromise = null
            promise.reject("ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun checkCameraAvailability(promise: Promise) {
        try {
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking camera availability", e)
            promise.reject("ERROR", e.message)
        }
    }
    
    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode == REQUEST_CODE_RECORDING) {
            val promise = recordingPromise
            recordingPromise = null
            
            if (promise == null) {
                Log.w(TAG, "No promise found for recording result")
                return
            }
            
            when (resultCode) {
                Activity.RESULT_OK -> {
                    val videoPath = data?.getStringExtra(HandLandmarkerActivity.RESULT_VIDEO_PATH)
                    val duration = data?.getLongExtra(HandLandmarkerActivity.RESULT_DURATION, 0L) ?: 0L
                    
                    if (videoPath != null) {
                        val result = Arguments.createMap()
                        result.putString("filePath", videoPath)
                        result.putDouble("duration", duration / 1000.0) // Convert to seconds
                        promise.resolve(result)
                        Log.i(TAG, "Recording completed: $videoPath (${duration}ms)")
                    } else {
                        promise.reject("ERROR", "No video path returned")
                    }
                }
                Activity.RESULT_CANCELED -> {
                    val error = data?.getStringExtra("error") ?: "Recording cancelled"
                    promise.reject("CANCELLED", error)
                    Log.w(TAG, "Recording cancelled: $error")
                }
                else -> {
                    promise.reject("ERROR", "Unknown result code: $resultCode")
                }
            }
        }
    }
    
    override fun onNewIntent(intent: Intent) {
        // Not used
    }
}
