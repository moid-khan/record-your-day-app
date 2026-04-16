package com.recordyourday_app.handlandmarker

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.util.AttributeSet
import android.util.Log
import android.view.SurfaceView
import android.widget.FrameLayout
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import androidx.camera.core.AspectRatio
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mediapipe.tasks.vision.core.RunningMode
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class HandLandmarkerCameraView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr), HandLandmarkerHelper.LandmarkerListener {

    private val previewView: PreviewView
    private val overlayView: HandLandmarkerOverlayView
    private var handLandmarkerHelper: HandLandmarkerHelper? = null
    
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var camera: Camera? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var cameraFacing = CameraSelector.LENS_FACING_FRONT
    
    private lateinit var backgroundExecutor: ExecutorService
    
    private var isActive = false
    private var desiredIsActive = false // Store desired state until camera is ready
    private var isCameraReady = false // Track if camera is set up and bound
    private var isBinding = false // Guard to prevent multiple simultaneous bind attempts
    private var isSettingUp = false // Guard to prevent multiple setup attempts
    private var permissionListener: PermissionListener? = null
    private var lifecycleOwner: LifecycleOwner? = null
    private var lifecycleObserver: LifecycleEventObserver? = null
    private var cameraErrorRetries = 0
    private var bindRetryRunnable: Runnable? = null

    init {
        Log.d(TAG, "Initializing HandLandmarkerCameraView")
        
        // Create PreviewView
        previewView = PreviewView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            // TextureView is more reliable inside React Native view hierarchies.
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            // Ensure view is visible
            visibility = VISIBLE
            // Match the sample's fill behavior.
            scaleType = PreviewView.ScaleType.FILL_START
        }
        addView(previewView)
        previewView.bringToFront()
        clipChildren = false
        clipToPadding = false
        previewView.post {
            val child = previewView.getChildAt(0)
            if (child is SurfaceView) {
                child.setZOrderOnTop(true)
                child.setZOrderMediaOverlay(true)
            }
        }
        Log.d(TAG, "PreviewView created and added (width=${previewView.width}, height=${previewView.height})")
        
        // Create OverlayView
        overlayView = HandLandmarkerOverlayView(context, null).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(overlayView)
        
        // Initialize background executor
        backgroundExecutor = Executors.newSingleThreadExecutor()
        
        // Don't set up camera here - wait for onAttachedToWindow()
        // This ensures the view is properly attached and laid out
    }

    private fun hasPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun handlePermissionsAndSetup() {
        if (hasPermissions()) {
            Log.d(TAG, "Camera permission already granted, setting up camera")
            setupCameraAndLandmarker()
        } else {
            Log.d(TAG, "Requesting camera permission")
            requestCameraPermission()
        }
    }

    private fun findActivity(): Activity? {
        if (context is ReactContext) {
            (context as ReactContext).currentActivity?.let { return it }
        }

        var ctx = context
        while (true) {
            if (ctx is Activity) {
                return ctx
            }
            if (ctx is android.content.ContextWrapper) {
                ctx = ctx.baseContext
            } else {
                break
            }
        }
        return null
    }

    private fun requestCameraPermission() {
        val activity = findActivity()
        if (activity == null) {
            Log.e(TAG, "No activity found to request permission")
            emitErrorEvent("Unable to request camera permission")
            return
        }

        if (activity is PermissionAwareActivity) {
            Log.d(TAG, "Requesting camera permission via PermissionAwareActivity")
            permissionListener = PermissionListener { requestCode, _, grantResults ->
                if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
                    val granted = grantResults.isNotEmpty() &&
                        grantResults[0] == PackageManager.PERMISSION_GRANTED
                    onPermissionResult(granted)
                    true
                } else {
                    false
                }
            }
            activity.requestPermissions(
                arrayOf(Manifest.permission.CAMERA),
                CAMERA_PERMISSION_REQUEST_CODE,
                permissionListener
            )
            return
        }

        Log.d(TAG, "Requesting camera permission from activity")
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(Manifest.permission.CAMERA),
            CAMERA_PERMISSION_REQUEST_CODE
        )

        // Set up a delayed check to see if permission was granted
        postDelayed({
            if (hasPermissions()) {
                Log.d(TAG, "Camera permission granted after request")
                setupCameraAndLandmarker()
            } else {
                Log.e(TAG, "Camera permission denied")
                emitErrorEvent("Camera permission is required for hand detection")
            }
        }, 2000) // Wait 2 seconds for user to respond to permission dialog
    }

    private fun setupCameraAndLandmarker() {
        if (isSettingUp) {
            Log.w(TAG, "Camera setup already in progress, skipping")
            return
        }
        
        isSettingUp = true
        Log.d(TAG, "setupCameraAndLandmarker called")
        // Wait for the views to be properly laid out (exactly like working project at line 133)
        // The working project uses: fragmentCameraBinding.viewFinder.post { setUpCamera() }
        // For React Native, we need to ensure PreviewView is fully ready
        previewView.post {
            previewView.post {
                // Double post ensures layout is complete
                Log.d(TAG, "PreviewView post callback, setting up camera (width=${previewView.width}, height=${previewView.height})")
                if (previewView.width > 0 && previewView.height > 0 && previewView.isAttachedToWindow) {
                    setupCamera()
                    isSettingUp = false
                } else {
                    Log.w(TAG, "PreviewView not ready yet, retrying...")
                    postDelayed({
                        if (previewView.width > 0 && previewView.height > 0 && previewView.isAttachedToWindow) {
                            setupCamera()
                            isSettingUp = false
                        } else {
                            Log.e(TAG, "PreviewView still not ready after delay")
                            emitErrorEvent("PreviewView not properly laid out")
                            isSettingUp = false
                        }
                    }, 200)
                }
            }
        }
        
        // Initialize HandLandmarker in parallel (exactly like working project at line 139)
        initializeHandLandmarker()
    }

    private fun emitHandsDetectedEvent(handsCount: Int) {
        val event = Arguments.createMap().apply {
            putInt("handsDetected", handsCount)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        val reactContext = context as ReactContext
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onHandsDetected", event)
    }

    private fun emitErrorEvent(error: String) {
        val event = Arguments.createMap().apply {
            putString("error", error)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        val reactContext = context as ReactContext
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onError", event)
    }
    
    private fun emitReadyEvent() {
        val reactContext = context as ReactContext
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onReady", Arguments.createMap())
    }

    private fun initializeHandLandmarker() {
        Log.d(TAG, "Initializing HandLandmarker")
        backgroundExecutor.execute {
            try {
                handLandmarkerHelper = HandLandmarkerHelper(
                    context = context,
                    runningMode = RunningMode.LIVE_STREAM,
                    handLandmarkerHelperListener = this@HandLandmarkerCameraView
                )
                Log.d(TAG, "HandLandmarker initialized successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize HandLandmarker", e)
                post { emitErrorEvent("Failed to initialize HandLandmarker: ${e.message}") }
            }
        }
    }

    private fun setupCamera() {
        Log.d(TAG, "Setting up camera (isActive=$isActive, previewView: ${previewView.width}x${previewView.height}, attached=${previewView.isAttachedToWindow})")
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                Log.d(TAG, "Camera provider obtained successfully, binding use cases...")
                // Always bind camera (preview should always be visible)
                // Detection is controlled by isActive flag
                bindCameraUseCases()
            } catch (e: Exception) {
                Log.e(TAG, "Camera initialization failed", e)
                e.printStackTrace()
                emitErrorEvent("Camera initialization failed: ${e.message}")
                isSettingUp = false
            }
        }, ContextCompat.getMainExecutor(context))
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun bindCameraUseCases() {
        // Prevent multiple simultaneous bind attempts
        if (isBinding) {
            Log.w(TAG, "Camera binding already in progress, skipping")
            return
        }
        
        val cameraProvider = cameraProvider ?: run {
            Log.e(TAG, "Camera provider is null")
            emitErrorEvent("Camera initialization failed: provider is null")
            return
        }
        
        isBinding = true
        Log.d(TAG, "Binding camera use cases (isActive=$isActive)")
        
        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(cameraFacing)
            .build()

        // Preview - use a conservative resolution to avoid session config timeouts
        preview = Preview.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(previewView.display.rotation)
            .build()

        // ImageAnalysis - use YUV and convert to RGBA for MediaPipe on the CPU.
        // Always bind analysis; gate processing via isActive to avoid rebind loops.
        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(previewView.display.rotation)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also {
                it.setAnalyzer(backgroundExecutor) { image ->
                    if (isActive) {
                        detectHand(image)
                    } else {
                        image.close()
                    }
                }
            }

        // Must unbind the use-cases before rebinding them (like the sample).
        Log.d(TAG, "Unbinding existing camera use cases")
        cameraProvider.unbindAll()
        camera = null

        try {
            val activity = findActivity()
            val lifecycleOwner = activity as? LifecycleOwner

            if (activity != null) {
                Log.d(TAG, "Found Activity: ${activity::class.simpleName}")
            }

            if (lifecycleOwner != null) {
                // A variable number of use-cases can be passed here -
                // camera provides access to CameraControl & CameraInfo
                // EXACTLY like working project
                Log.d(TAG, "Binding camera to lifecycle...")

                // Bind to lifecycle FIRST (exactly like working project at line 347)
                camera = cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    cameraSelector,
                    preview,
                    imageAnalyzer
                )

                // Attach the viewfinder's surface provider to preview use case
                // Set AFTER binding (exactly like working project at line 352)
                // Set immediately - no delay needed
                Log.d(TAG, "Setting surface provider on preview use case...")
                preview?.setSurfaceProvider(previewView.surfaceProvider)
                Log.d(TAG, "Surface provider set successfully")

                Log.d(TAG, "Camera use cases bound successfully - preview should be visible now")
                Log.d(TAG, "PreviewView state: width=${previewView.width}, height=${previewView.height}, visible=${previewView.visibility == VISIBLE}")
                observeCameraState(lifecycleOwner)
                isCameraReady = true
                isSettingUp = false

                // Emit onReady event for React Native (with small delay to ensure camera is fully ready)
                postDelayed({
                    Log.d(TAG, "Emitting onReady event to React Native")
                    emitReadyEvent()

                    // Apply desired isActive state now that camera is ready
                    if (desiredIsActive && !isActive) {
                        Log.d(TAG, "Applying desired isActive=true now that camera is ready")
                        startDetection()
                    } else if (!desiredIsActive && isActive) {
                        Log.d(TAG, "Applying desired isActive=false now that camera is ready")
                        stopDetection()
                    } else if (desiredIsActive && isActive) {
                        Log.d(TAG, "isActive=true, detection enabled")
                    }
                }, 200)
            } else {
                Log.e(TAG, "No LifecycleOwner found for camera binding")
                emitErrorEvent("Camera binding failed: No LifecycleOwner found")
            }
        } catch (exc: Exception) {
            Log.e(TAG, "Use case binding failed", exc)
            exc.printStackTrace()
            val errorMsg = exc.message ?: "Unknown error"
            Log.e(TAG, "Error details: $errorMsg")
            emitErrorEvent("Camera binding failed: $errorMsg")
            isSettingUp = false
        } finally {
            isBinding = false
        }
    }

    private fun detectHand(imageProxy: ImageProxy) {
        val helper = handLandmarkerHelper
        if (helper == null) {
            imageProxy.close()
            return
        }
        helper.detectLiveStream(
            imageProxy = imageProxy,
            isFrontCamera = cameraFacing == CameraSelector.LENS_FACING_FRONT
        )
    }

    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        post {
            // Update overlay with results
            if (resultBundle.results.isNotEmpty()) {
                overlayView.setResults(
                    resultBundle.results.first(),
                    resultBundle.inputImageHeight,
                    resultBundle.inputImageWidth,
                    RunningMode.LIVE_STREAM
                )
                // Force a redraw
                overlayView.invalidate()
            }
            
            // Notify about hands detected
            val handsCount = resultBundle.results.firstOrNull()?.landmarks()?.size ?: 0
            emitHandsDetectedEvent(handsCount)
        }
    }

    override fun onError(error: String, errorCode: Int) {
        post {
            Log.e(TAG, "HandLandmarker error: $error")
            emitErrorEvent(error)
        }
    }

    fun startDetection() {
        Log.d(TAG, "startDetection() called (isActive was: $isActive, cameraReady: $isCameraReady)")
        desiredIsActive = true
        
        // If camera is not ready yet, just store the desired state
        // It will be applied once camera is ready
        if (!isCameraReady) {
            Log.d(TAG, "Camera not ready yet, will start detection once camera is ready")
            return
        }
        
        // Camera is ready, start detection now
        isActive = true
        
        backgroundExecutor.execute {
            handLandmarkerHelper?.let {
                if (it.isClose()) {
                    Log.d(TAG, "HandLandmarker is closed, setting up...")
                    it.setupHandLandmarker()
                } else {
                    Log.d(TAG, "HandLandmarker is already set up")
                }
            } ?: run {
                Log.w(TAG, "HandLandmarkerHelper is null, initializing...")
                initializeHandLandmarker()
            }
        }
    }

    fun stopDetection() {
        Log.d(TAG, "stopDetection() called (isActive was: $isActive, cameraReady: $isCameraReady)")
        desiredIsActive = false
        
        // If camera is not ready yet, just store the desired state
        if (!isCameraReady) {
            Log.d(TAG, "Camera not ready yet, will stop detection once camera is ready")
            return
        }
        
        // Camera is ready, stop detection now
        isActive = false
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }
        overlayView.clear()
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

    fun onPermissionResult(granted: Boolean) {
        if (granted) {
            Log.d(TAG, "Permission granted via callback")
            setupCameraAndLandmarker()
        } else {
            Log.e(TAG, "Permission denied via callback")
            emitErrorEvent("Camera permission is required for hand detection")
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.d(TAG, "View attached to window (width=$width, height=$height)")
        Log.d(TAG, "PreviewView state: width=${previewView.width}, height=${previewView.height}, attached=${previewView.isAttachedToWindow}, visible=${previewView.visibility}")

        val owner = findActivity() as? LifecycleOwner
        if (owner != null && lifecycleOwner != owner) {
            lifecycleObserver?.let { lifecycleOwner?.lifecycle?.removeObserver(it) }
            lifecycleOwner = owner
            lifecycleObserver = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> {
                        if (!isCameraReady && !isSettingUp) {
                            Log.d(TAG, "Lifecycle resumed, retrying camera setup")
                            handlePermissionsAndSetup()
                        }
                    }
                    Lifecycle.Event.ON_PAUSE -> {
                        Log.d(TAG, "Lifecycle paused, unbinding camera use cases")
                        cameraProvider?.unbindAll()
                        camera = null
                        preview = null
                        imageAnalyzer = null
                        isCameraReady = false
                    }
                    else -> {}
                }
            }
            owner.lifecycle.addObserver(lifecycleObserver!!)
        }
        
        // Wait for the view to be properly laid out (like in working Android project)
        // Use post to ensure layout is complete before setting up camera
        post {
            post {
                Log.d(TAG, "View layout check (width=$width, height=$height, preview: ${previewView.width}x${previewView.height}, attached=${previewView.isAttachedToWindow})")

                val owner = lifecycleOwner
                val isStarted = owner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) == true
                Log.d(TAG, "Lifecycle state at attach: ${owner?.lifecycle?.currentState}")

                // Only start camera once lifecycle is started/resumed to avoid early bind failures.
                if (previewView.isAttachedToWindow && isStarted) {
                    Log.d(TAG, "PreviewView attached and lifecycle started, proceeding with camera setup")
                    handlePermissionsAndSetup()
                } else if (previewView.isAttachedToWindow) {
                    Log.w(TAG, "PreviewView attached but lifecycle not started; waiting for resume")
                } else {
                    Log.w(TAG, "PreviewView not attached yet, waiting...")
                    postDelayed({
                        val delayedOwner = lifecycleOwner
                        val delayedStarted = delayedOwner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) == true
                        if (previewView.isAttachedToWindow && delayedStarted) {
                            Log.d(TAG, "PreviewView now attached and lifecycle started, setting up camera")
                            handlePermissionsAndSetup()
                        } else if (!previewView.isAttachedToWindow) {
                            Log.e(TAG, "PreviewView still not attached after delay")
                            emitErrorEvent("PreviewView not properly attached")
                        }
                    }, 200)
                }
            }
        }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        if (changed) {
            val width = right - left
            val height = bottom - top
            Log.d(TAG, "onLayout: width=$width, height=$height, preview: ${previewView.width}x${previewView.height}")
            // Ensure PreviewView fills the parent
            previewView.layout(0, 0, width, height)
            overlayView.layout(0, 0, width, height)
        }
    }
    
    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.d(TAG, "View detached, cleaning up")
        stopDetection()
        isCameraReady = false
        permissionListener = null
        lifecycleObserver?.let { lifecycleOwner?.lifecycle?.removeObserver(it) }
        lifecycleObserver = null
        lifecycleOwner = null
        bindRetryRunnable?.let { removeCallbacks(it) }
        bindRetryRunnable = null
        cameraProvider?.unbindAll()
        camera = null
        preview = null
        imageAnalyzer = null
        // Don't shutdown executor here - it might be needed if view is reattached
        // backgroundExecutor.shutdown()
    }

    private fun observeCameraState(owner: LifecycleOwner) {
        val cameraInfo = camera?.cameraInfo ?: return
        cameraInfo.cameraState.removeObservers(owner)
        cameraInfo.cameraState.observe(owner, Observer { state ->
            val error = state.error
            if (error != null) {
                Log.e(TAG, "Camera state error: ${error.code}", error.cause)
                if (cameraErrorRetries < MAX_CAMERA_RETRIES && bindRetryRunnable == null) {
                    cameraErrorRetries += 1
                    Log.w(TAG, "Retrying camera bind (attempt $cameraErrorRetries)")
                    val retry = Runnable {
                        bindRetryRunnable = null
                        if (previewView.isAttachedToWindow) {
                            bindCameraUseCases()
                        }
                    }
                    bindRetryRunnable = retry
                    postDelayed(retry, 400)
                }
            } else if (state.type == CameraState.Type.OPEN) {
                cameraErrorRetries = 0
                bindRetryRunnable?.let { removeCallbacks(it) }
                bindRetryRunnable = null
            }
        })
    }

    companion object {
        private const val TAG = "HandLandmarkerCameraView"
        private const val CAMERA_PERMISSION_REQUEST_CODE = 1001
        private const val MAX_CAMERA_RETRIES = 2
    }
}
