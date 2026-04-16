package com.recordyourday_app.handlandmarker

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import android.view.Gravity
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.AspectRatio
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Android implementation of HandCameraView matching iOS functionality
 * Uses MediaPipe's proven camera setup approach
 */
class HandCameraView(
    private val reactContext: ReactContext
) : FrameLayout(reactContext), HandLandmarkerHelper.LandmarkerListener, LifecycleOwner {

    companion object {
        private const val TAG = "HandCameraView"
    }

    // Lifecycle
    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    // Views
    private lateinit var previewView: PreviewView
    private lateinit var overlay: HandLandmarkerOverlayView

    // Camera
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private val cameraFacing = CameraSelector.LENS_FACING_FRONT

    // MediaPipe
    private lateinit var backgroundExecutor: ExecutorService
    private var handLandmarkerHelper: HandLandmarkerHelper? = null

    // State
    private var isStarted = false

    init {
        Log.d(TAG, "HandCameraView created")
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        setupViews()
    }

    private fun setupViews() {
        // Create PreviewView
        previewView = PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
            layoutParams = LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        }
        addView(previewView)

        // Create Overlay
        overlay = HandLandmarkerOverlayView(context, null).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(overlay)

        // Initialize executor
        backgroundExecutor = Executors.newSingleThreadExecutor()

        // Initialize MediaPipe
        initializeHandLandmarker()
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

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.i(TAG, "HandCameraView attached to window")
        
        // Wait for view to be laid out before setting up camera
        post {
            emitReady()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.i(TAG, "HandCameraView detached from window")
        stop()
    }

    /**
     * Start camera - called from React Native
     * Uses MediaPipe's exact approach
     */
    fun start() {
        if (isStarted) {
            Log.d(TAG, "start: already started")
            return
        }

        Log.i(TAG, "start: Setting up camera...")
        
        // Check permission
        if (!hasCameraPermission()) {
            Log.e(TAG, "start: Camera permission not granted")
            emitError("Camera permission required")
            return
        }

        // Set up camera using MediaPipe's approach
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener(
            {
                try {
                    cameraProvider = cameraProviderFuture.get()
                    bindCameraUseCases()
                    isStarted = true
                    
                    // Start MediaPipe
                    backgroundExecutor.execute {
                        if (handLandmarkerHelper?.isClose() == true) {
                            handLandmarkerHelper?.setupHandLandmarker()
                        }
                    }
                    
                    Log.i(TAG, "start: Camera started successfully")
                } catch (e: Exception) {
                    Log.e(TAG, "start: Failed to start camera", e)
                    emitError("Failed to start camera: ${e.message}")
                }
            },
            ContextCompat.getMainExecutor(context)
        )
    }

    /**
     * Bind camera use cases - EXACT copy of MediaPipe's approach
     */
    @SuppressLint("UnsafeOptInUsageError")
    private fun bindCameraUseCases() {
        val cameraProvider = cameraProvider
            ?: throw IllegalStateException("Camera initialization failed.")

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(cameraFacing)
            .build()

        // Preview - using 4:3 ratio like MediaPipe
        preview = Preview.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(previewView.display.rotation)
            .build()

        // ImageAnalysis - using RGBA 8888 like MediaPipe
        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(previewView.display.rotation)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also {
                it.setAnalyzer(backgroundExecutor) { image ->
                    detectHand(image)
                }
            }

        // Must unbind the use-cases before rebinding them
        cameraProvider.unbindAll()

        try {
            // Update lifecycle to RESUMED before binding
            lifecycleRegistry.currentState = Lifecycle.State.STARTED
            lifecycleRegistry.currentState = Lifecycle.State.RESUMED

            // Bind to lifecycle
            val camera = cameraProvider.bindToLifecycle(
                this, // LifecycleOwner
                cameraSelector,
                preview,
                imageAnalyzer
            )

            // CRITICAL: Attach surface provider AFTER binding (like MediaPipe)
            preview?.setSurfaceProvider(previewView.surfaceProvider)
            
            Log.i(TAG, "bindCameraUseCases: Successfully bound camera")

        } catch (exc: Exception) {
            Log.e(TAG, "bindCameraUseCases: Use case binding failed", exc)
            emitError("Camera binding failed: ${exc.message}")
        }
    }

    /**
     * Stop camera - called from React Native
     */
    fun stop() {
        if (!isStarted) {
            return
        }

        Log.i(TAG, "stop: Stopping camera...")
        
        // Stop MediaPipe
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }

        // Unbind camera
        cameraProvider?.unbindAll()
        
        // Update lifecycle
        lifecycleRegistry.currentState = Lifecycle.State.STARTED
        lifecycleRegistry.currentState = Lifecycle.State.CREATED

        overlay.clear()
        isStarted = false
        
        Log.i(TAG, "stop: Camera stopped")
    }

    private fun detectHand(imageProxy: ImageProxy) {
        handLandmarkerHelper?.detectLiveStream(
            imageProxy = imageProxy,
            isFrontCamera = cameraFacing == CameraSelector.LENS_FACING_FRONT
        )
    }

    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        post {
            val result = resultBundle.results.firstOrNull() ?: return@post
            
            // Update overlay
            overlay.setResults(
                result,
                resultBundle.inputImageHeight,
                resultBundle.inputImageWidth,
                RunningMode.LIVE_STREAM
            )
            
            // Emit hand status to React Native
            val handCount = result.landmarks().size
            emitHandStatusChange(handCount)
        }
    }

    override fun onError(error: String, errorCode: Int) {
        emitError(error)
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun emitReady() {
        val event = Arguments.createMap()
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onReady", event)
    }

    private fun emitHandStatusChange(handCount: Int) {
        val event = Arguments.createMap().apply {
            putInt("handCount", handCount)
            putBoolean("valid", handCount > 0)
            putBoolean("handInFrame", handCount > 0)
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onHandStatusChange", event)
    }

    private fun emitError(message: String) {
        val event = Arguments.createMap().apply {
            putString("message", message)
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onError", event)
    }

    fun cleanup() {
        stop()
        backgroundExecutor.shutdown()
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
    }
}
