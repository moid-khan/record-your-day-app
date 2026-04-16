package com.recordyourday_app.handlandmarker

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import android.view.Gravity
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class HandLandmarkerDirectView(
    private val reactContext: ReactContext
) : FrameLayout(reactContext), HandLandmarkerHelper.LandmarkerListener {

    // React properties
    private var _isActive = false
    
    // Private properties
    private var previewView: PreviewView? = null
    private lateinit var overlay: HandLandmarkerOverlayView
    private lateinit var backgroundExecutor: ExecutorService
    private val mainCoroutineScope = CoroutineScope(Dispatchers.Main)

    private var handLandmarkerHelper: HandLandmarkerHelper? = null
    private val cameraFacing = CameraSelector.LENS_FACING_FRONT
    
    // Camera session - like vision-camera architecture
    private lateinit var cameraSession: HandLandmarkerCameraSession
    
    private var isMounted = false
    private var currentConfigureCall: Long = 0 // Track latest configure call

    init {
        Log.d(TAG, "HandLandmarkerDirectView created")
        setupViews()
    }

    private fun setupViews() {
        // Create Overlay
        overlay = HandLandmarkerOverlayView(context, null).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(overlay)

        backgroundExecutor = Executors.newSingleThreadExecutor()
        
        // Create camera session - like vision-camera
        cameraSession = HandLandmarkerCameraSession(context, backgroundExecutor)
        
        initializeHandLandmarker()
        
        // Create PreviewView
        updatePreview()
    }

    private fun updatePreview() {
        if (previewView == null) {
            // Create PreviewView
            previewView = createPreviewView()
            addView(previewView, 0) // Add at index 0 so overlay is on top
        }
    }

    private fun createPreviewView(): PreviewView =
        PreviewView(context).also {
            it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            it.scaleType = PreviewView.ScaleType.FILL_CENTER
            it.layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
            var lastIsPreviewing = false
            // CRITICAL: Observe using CameraSession's lifecycle, not View's lifecycle
            it.previewStreamState.observe(cameraSession) { state ->
                Log.i(TAG, "PreviewView Stream State changed to $state")
                val isPreviewing = state == PreviewView.StreamState.STREAMING
                if (isPreviewing != lastIsPreviewing) {
                    if (isPreviewing) {
                        Log.i(TAG, "Preview started streaming!")
                    } else {
                        Log.i(TAG, "Preview stopped streaming")
                    }
                    lastIsPreviewing = isPreviewing
                }
            }
        }

    override fun onAttachedToWindow() {
        Log.i(TAG, "CameraView attached to window!")
        super.onAttachedToWindow()
        if (!isMounted) {
            isMounted = true
            emitReady()
        }
    }

    override fun onDetachedFromWindow() {
        Log.i(TAG, "CameraView detached from window!")
        super.onDetachedFromWindow()
        destroy()
    }

    private fun destroy() {
        cameraSession.destroy()
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }
        backgroundExecutor.shutdown()
    }

    // Called by ViewManager after all props are set - like vision-camera
    fun update() {
        Log.i(TAG, "update() called - isActive: $_isActive")
        val now = System.currentTimeMillis()
        currentConfigureCall = now
        
        mainCoroutineScope.launch {
            try {
                if (!hasCameraPermission()) {
                    Log.d(TAG, "update: missing camera permission")
                    emitError("Camera permission required")
                    return@launch
                }
                
                // Check if a newer configure call happened while we were waiting
                if (currentConfigureCall != now) {
                    Log.i(TAG, "update: A newer configure call arrived, aborting this one...")
                    return@launch
                }
                
                // Configure camera session
                cameraSession.checkCameraPermission()
                
                val surfaceProvider = previewView?.surfaceProvider
                val imageAnalyzer: (ImageProxy) -> Unit = { image ->
                    detectHand(image)
                }
                
                Log.i(TAG, "update: Calling cameraSession.configure...")
                // Configure the camera session - like vision-camera
                cameraSession.configure(
                    isActive = _isActive,
                    surfaceProvider = surfaceProvider,
                    imageAnalyzer = imageAnalyzer
                )
                
                // Update hand landmarker state
                if (_isActive) {
                    backgroundExecutor.execute {
                        if (handLandmarkerHelper?.isClose() == true) {
                            handLandmarkerHelper?.setupHandLandmarker()
                        }
                    }
                } else {
                    backgroundExecutor.execute { 
                        handLandmarkerHelper?.clearHandLandmarker() 
                    }
                    overlay.clear()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to configure camera", e)
                emitError("Camera configuration failed: ${e.message}")
            }
        }
    }

    fun setActive(active: Boolean) {
        Log.d(TAG, "setActive: $active")
        _isActive = active
        // Don't call update() here - it will be called by onAfterUpdateTransaction
    }

    fun updateConfidenceThresholds(
        handDetection: Float,
        handTracking: Float,
        handPresence: Float
    ) {
        backgroundExecutor.execute {
            handLandmarkerHelper?.let {
                it.minHandDetectionConfidence = handDetection
                it.minHandTrackingConfidence = handTracking
                it.minHandPresenceConfidence = handPresence
                it.clearHandLandmarker()
                it.setupHandLandmarker()
            }
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun initializeHandLandmarker() {
        backgroundExecutor.execute {
            handLandmarkerHelper = HandLandmarkerHelper(
                context = context,
                runningMode = RunningMode.LIVE_STREAM,
                handLandmarkerHelperListener = this
            )
        }
    }

    private fun detectHand(imageProxy: ImageProxy) {
        if (_isActive && handLandmarkerHelper != null) {
            Log.d(TAG, "detectHand: Processing frame ${imageProxy.width}x${imageProxy.height}")
            handLandmarkerHelper?.detectLiveStream(
                imageProxy = imageProxy,
                isFrontCamera = cameraFacing == CameraSelector.LENS_FACING_FRONT
            )
        } else {
            imageProxy.close()
        }
    }

    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        post {
            val result = resultBundle.results.firstOrNull() ?: return@post
            overlay.setResults(
                result,
                resultBundle.inputImageHeight,
                resultBundle.inputImageWidth,
                RunningMode.LIVE_STREAM
            )
            emitHandsDetected(result.landmarks().size)
        }
    }

    override fun onError(error: String, errorCode: Int) {
        emitError(error)
    }

    private fun emitReady() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onReady", event)
    }

    private fun emitHandsDetected(count: Int) {
        val event = Arguments.createMap().apply {
            putInt("handsDetected", count)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onHandsDetected", event)
    }

    private fun emitError(message: String) {
        val event = Arguments.createMap().apply {
            putString("error", message)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onError", event)
    }

    companion object {
        private const val TAG = "HandLandmarkerDirectView"
    }
}
