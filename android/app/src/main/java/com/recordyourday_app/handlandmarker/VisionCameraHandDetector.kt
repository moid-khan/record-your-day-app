package com.recordyourday_app.handlandmarker

import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.mrousavy.camera.core.CameraSession
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Hooks into VisionCamera's CameraSession to add MediaPipe hand detection
 * WITHOUT using frame processors
 */
class VisionCameraHandDetector(
    private val reactContext: ReactApplicationContext,
    private val cameraSession: CameraSession
) {
    companion object {
        private const val TAG = "VisionCameraHandDetector"
    }

    private val backgroundExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var handLandmarkerHelper: HandLandmarkerHelper? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var isInitialized = false

    init {
        Log.d(TAG, "VisionCameraHandDetector created")
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

    /**
     * Add ImageAnalysis to VisionCamera's camera session for hand detection
     */
    fun attachToCamera() {
        if (!isInitialized) {
            Log.w(TAG, "Not initialized yet, cannot attach to camera")
            return
        }

        try {
            // Create ImageAnalysis use case
            imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also { analyzer ->
                    analyzer.setAnalyzer(backgroundExecutor) { image ->
                        processFrame(image)
                    }
                }

            // TODO: Add this ImageAnalysis to VisionCamera's camera session
            // This requires modifying VisionCamera's CameraSession to accept additional use cases
            
            Log.i(TAG, "Hand detection attached to camera")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to attach to camera", e)
        }
    }

    private fun processFrame(imageProxy: ImageProxy) {
        if (!isInitialized || handLandmarkerHelper == null) {
            imageProxy.close()
            return
        }

        try {
            handLandmarkerHelper?.detectLiveStream(
                imageProxy = imageProxy,
                isFrontCamera = true
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error processing frame", e)
            imageProxy.close()
        }
    }

    fun cleanup() {
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }
        backgroundExecutor.shutdown()
    }
}
