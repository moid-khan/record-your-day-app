package com.recordyourday_app.handlandmarker

import android.util.Log
import androidx.camera.core.ImageProxy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Vision Camera Frame Processor Plugin for Hand Detection
 * Uses MediaPipe to detect hands in frames from react-native-vision-camera
 */
class VisionCameraHandPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "VisionCameraHandPlugin"
    }

    private val reactContext: ReactApplicationContext = proxy.context
    private val backgroundExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var handLandmarkerHelper: HandLandmarkerHelper? = null
    private var isInitialized = false
    private var frameCount = 0

    init {
        Log.d(TAG, "VisionCameraHandPlugin created")
        initializeHandLandmarker()
    }

    private fun initializeHandLandmarker() {
        backgroundExecutor.execute {
            try {
                handLandmarkerHelper = HandLandmarkerHelper(
                    context = reactContext,
                    runningMode = RunningMode.LIVE_STREAM,
                    handLandmarkerHelperListener = object : HandLandmarkerHelper.LandmarkerListener {
                        override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
                            val result = resultBundle.results.firstOrNull()
                            val handCount = result?.landmarks()?.size ?: 0
                            
                            // Send event to React Native
                            val event = Arguments.createMap().apply {
                                putInt("handCount", handCount)
                                putBoolean("handInFrame", handCount > 0)
                                putDouble("timestamp", System.currentTimeMillis().toDouble())
                            }
                            
                            reactContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onHandDetected", event)
                        }

                        override fun onError(error: String, errorCode: Int) {
                            Log.e(TAG, "Hand detection error: $error")
                        }
                    }
                )
                isInitialized = true
                Log.i(TAG, "HandLandmarkerHelper initialized successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize HandLandmarkerHelper", e)
            }
        }
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        if (!isInitialized || handLandmarkerHelper == null) {
            return null
        }

        frameCount++
        if (frameCount % 3 != 0) {
            // Process every 3rd frame to reduce load
            return null
        }

        try {
            // Get ImageProxy from Frame
            val imageProxy = frame.image as? ImageProxy
            if (imageProxy != null) {
                // Process with MediaPipe using LIVE_STREAM mode
                handLandmarkerHelper?.detectLiveStream(
                    imageProxy = imageProxy,
                    isFrontCamera = true // TODO: Get from camera config
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
        }

        return null
    }

    fun cleanup() {
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }
        backgroundExecutor.shutdown()
    }
}
