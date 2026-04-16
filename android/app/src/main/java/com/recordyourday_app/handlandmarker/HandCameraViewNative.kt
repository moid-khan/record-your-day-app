package com.recordyourday_app.handlandmarker

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.widget.FrameLayout
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import com.recordyourday_app.imusensor.IMUSensorHelper
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Native Android View that embeds camera with hand detection and voice commands.
 * Matches iOS HandCameraView behavior.
 */
class HandCameraViewNative(context: Context) :
    FrameLayout(context),
    HandLandmarkerHelper.LandmarkerListener,
    TextureView.SurfaceTextureListener {
    
    companion object {
        private const val TAG = "HandCameraViewNative"
    }
    
    private val lifecycleOwner = object : LifecycleOwner {
        private val lifecycleRegistry = LifecycleRegistry(this)
        override val lifecycle: Lifecycle get() = lifecycleRegistry
        
        fun setCurrentState(state: Lifecycle.State) {
            lifecycleRegistry.currentState = state
        }
    }
    
    private val reactContext = context as ReactContext
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Camera components
    private var textureView: TextureView
    private var overlayView: OverlayView
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var frameCount = 0  // Debug frame counter
    private var surfaceTexture: SurfaceTexture? = null
    private var isSurfaceReady = false
    private var pendingCameraStart = false  // Track if we need to start camera when surface is ready
    private var previewWidth: Int = 0
    private var previewHeight: Int = 0
    
    // MediaPipe
    private lateinit var handLandmarkerHelper: HandLandmarkerHelper
    private lateinit var backgroundExecutor: ExecutorService
    
    // Clap detection
    private var enableClapStart = false
    private var audioRecord: AudioRecord? = null
    private var clapDetectionThread: Thread? = null
    private var isClapDetectionRunning = false
    private var lastClapTime = 0L
    private val CLAP_THRESHOLD = 5000 // Amplitude threshold for clap detection (lowered for better sensitivity)
    private val CLAP_COOLDOWN_MS = 1000L // Minimum time between claps
    private val SAMPLE_RATE = 44100
    private val BUFFER_SIZE = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
    )

    // State
    private var isActive = false
    private var isRecording = false
    private var isPaused = false
    private var isCameraStarting = false  // Guard against multiple start attempts
    private var isCameraStarted = false
    private var recordingStartTime = 0L
    private var outputFile: File? = null
    private var handInFrame = false
    private var handsFullyInFrame = false
    private var handDetectionStableCount = 0 // Counter for stable detection
    private var beepSoundService: BeepSoundService? = null

    // IMU sensor
    private var imuSensorHelper: IMUSensorHelper? = null
    private var imuDataPath: String? = null
    
    init {
        lifecycleOwner.setCurrentState(Lifecycle.State.CREATED)

        // Set background color to help debug
        setBackgroundColor(android.graphics.Color.BLACK)

        // Create TextureView for camera preview (more reliable in React Native than PreviewView)
        textureView = TextureView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            surfaceTextureListener = this@HandCameraViewNative
        }
        addView(textureView)

        // Create overlay view (on top)
        overlayView = OverlayView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            // Make overlay transparent so camera shows through
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }
        addView(overlayView)

        // Initialize MediaPipe
        backgroundExecutor = Executors.newSingleThreadExecutor()
        initializeHandLandmarker()

        // Initialize beep sound service for continuous beeping
        beepSoundService = BeepSoundService.getInstance(context)

        // Initialize IMU sensor helper
        imuSensorHelper = IMUSensorHelper(context)
        if (imuSensorHelper?.isSensorAvailable == true) {
            Log.i(TAG, "📊 IMU sensors available")
        } else {
            Log.w(TAG, "⚠️ IMU sensors not available on this device")
        }

        Log.i(TAG, "HandCameraViewNative created - Using TextureView for preview")
    }

    // TextureView.SurfaceTextureListener implementation
    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        Log.i(TAG, "📺 onSurfaceTextureAvailable: ${width}x${height}")
        surfaceTexture = surface
        isSurfaceReady = true

        // If we were waiting to start camera, do it now
        if (pendingCameraStart) {
            pendingCameraStart = false
            startCamera()
        }
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        Log.i(TAG, "📺 onSurfaceTextureSizeChanged: ${width}x${height}")
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        Log.i(TAG, "📺 onSurfaceTextureDestroyed")
        surfaceTexture = null
        isSurfaceReady = false
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
        // Called when the SurfaceTexture is updated through updateTexImage()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        Log.i(TAG, "📐 View size changed: ${w}x${h} (was ${oldw}x${oldh})")
        // Ensure child views have the right size
        if (w > 0 && h > 0) {
            Log.i(TAG, "📐 textureView size: ${textureView.width}x${textureView.height}")
            Log.i(TAG, "📐 overlayView size: ${overlayView.width}x${overlayView.height}")
            // Re-apply transform if preview resolution is known
            if (previewWidth > 0 && previewHeight > 0) {
                updateTextureViewTransform(previewWidth, previewHeight)
            }
        }
    }

    /**
     * Configure the overlay to match the TextureView display.
     * CameraX handles rotation internally for the preview.
     * The analysis image is rotated in HandLandmarkerHelper to match.
     * So normalized coordinates should map directly to view dimensions.
     */
    private fun updateTextureViewTransform(bufferWidth: Int, bufferHeight: Int) {
        val viewWidth = textureView.width.toFloat()
        val viewHeight = textureView.height.toFloat()

        if (viewWidth == 0f || viewHeight == 0f) {
            Log.w(TAG, "📐 Cannot update - invalid view dimensions")
            return
        }

        Log.i(TAG, "📐 Preview config: buffer=${bufferWidth}x${bufferHeight}, view=${viewWidth}x${viewHeight}")

        // Don't apply custom transform - let CameraX handle the preview scaling
        // Just tell overlay to use simple direct mapping
        overlayView.setSimpleMapping(viewWidth, viewHeight)
    }

    fun setActive(active: Boolean) {
        if (isActive == active) return
        isActive = active

        if (active) {
            // Set lifecycle to STARTED then RESUMED (like Vision Camera does)
            lifecycleOwner.setCurrentState(Lifecycle.State.STARTED)
            lifecycleOwner.setCurrentState(Lifecycle.State.RESUMED)

            // Wait for view to be fully ready before starting camera
            startCameraWhenReady()

            // Start clap detection if enabled
            if (enableClapStart && !isRecording) {
                startClapDetection()
            }
        } else {
            stopClapDetection()
            stopCamera()
            // Set back to STARTED then CREATED when deactivated
            lifecycleOwner.setCurrentState(Lifecycle.State.STARTED)
            lifecycleOwner.setCurrentState(Lifecycle.State.CREATED)
        }
    }

    private fun startCameraWhenReady() {
        Log.i(TAG, "📷 startCameraWhenReady() - isAttached=${isAttachedToWindow}, surfaceReady=$isSurfaceReady, starting=$isCameraStarting, started=$isCameraStarted")

        // Skip if already starting or started
        if (isCameraStarting || isCameraStarted) {
            Log.i(TAG, "📷 Camera already starting/started, skipping")
            return
        }

        // If surface is ready, start camera immediately
        if (isSurfaceReady && surfaceTexture != null) {
            Log.i(TAG, "📷 Surface is ready, starting camera immediately")
            startCamera()
            return
        }

        // Surface not ready yet, mark that we want to start when it's ready
        Log.i(TAG, "📷 Surface not ready, will start camera when surface becomes available")
        pendingCameraStart = true
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Log.i(TAG, "📷 onAttachedToWindow - isActive=$isActive")

        if (isActive) {
            // View just got attached, try to start camera
            startCameraWhenReady()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        Log.i(TAG, "📷 onDetachedFromWindow")
    }
    
    fun setEnableVoiceStart(enable: Boolean) {
        // Voice start not supported on Android - use clap detection instead
        Log.d(TAG, "Voice start not supported on Android, ignoring enableVoiceStart=$enable")
    }

    fun setRequireHandsForVoiceStart(require: Boolean) {
        // Voice start not supported on Android
        Log.d(TAG, "Voice start not supported on Android, ignoring requireHandsForVoiceStart=$require")
    }

    fun setEnableClapStart(enable: Boolean) {
        Log.d(TAG, "setEnableClapStart: $enable")
        enableClapStart = enable
        if (enable && isActive && !isRecording) {
            startClapDetection()
        } else if (!enable) {
            stopClapDetection()
        }
    }

    @SuppressLint("MissingPermission")
    private fun startClapDetection() {
        if (isClapDetectionRunning) {
            Log.d(TAG, "Clap detection already running")
            return
        }

        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Audio permission not granted for clap detection")
            return
        }

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                BUFFER_SIZE
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "Failed to initialize AudioRecord")
                audioRecord?.release()
                audioRecord = null
                return
            }

            isClapDetectionRunning = true
            audioRecord?.startRecording()

            clapDetectionThread = Thread {
                val buffer = ShortArray(BUFFER_SIZE / 2)
                Log.i(TAG, "👏 Clap detection started with threshold=$CLAP_THRESHOLD")
                var frameCount = 0

                while (isClapDetectionRunning && !Thread.interrupted()) {
                    try {
                        val readResult = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                        if (readResult > 0) {
                            // Calculate max amplitude
                            var maxAmplitude = 0
                            for (i in 0 until readResult) {
                                val amplitude = abs(buffer[i].toInt())
                                if (amplitude > maxAmplitude) {
                                    maxAmplitude = amplitude
                                }
                            }

                            // Log amplitude periodically for debugging
                            frameCount++
                            if (frameCount % 50 == 0) {
                                Log.d(TAG, "👏 Audio amplitude: $maxAmplitude (threshold: $CLAP_THRESHOLD)")
                            }

                            // Check for clap
                            val now = System.currentTimeMillis()
                            if (maxAmplitude > CLAP_THRESHOLD && (now - lastClapTime) > CLAP_COOLDOWN_MS) {
                                lastClapTime = now
                                Log.i(TAG, "👏 CLAP DETECTED! Amplitude: $maxAmplitude (threshold: $CLAP_THRESHOLD)")
                                mainHandler.post {
                                    handleClapDetected()
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in clap detection loop", e)
                        break
                    }
                }
                Log.i(TAG, "👏 Clap detection thread ended")
            }
            clapDetectionThread?.start()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start clap detection", e)
            isClapDetectionRunning = false
        }
    }

    private fun stopClapDetection() {
        Log.i(TAG, "Stopping clap detection")
        isClapDetectionRunning = false

        try {
            clapDetectionThread?.interrupt()
            clapDetectionThread = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping clap detection thread", e)
        }

        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing AudioRecord", e)
        }
    }

    private fun handleClapDetected() {
        Log.i(TAG, "👏 handleClapDetected: enableClapStart=$enableClapStart, isRecording=$isRecording")

        if (!enableClapStart) {
            Log.d(TAG, "Clap ignored: enableClapStart is false")
            sendClapDetectedEvent(false)
            return
        }

        if (isRecording) {
            Log.d(TAG, "Clap ignored: already recording")
            sendClapDetectedEvent(false)
            return
        }

        // Accept clap regardless of hand position - user can start recording by clapping
        // even before putting hands in frame
        Log.i(TAG, "👏 Clap accepted! Sending event to React Native...")
        sendClapDetectedEvent(true)
        stopClapDetection()
        // React Native will handle starting the recording via the onClapDetected callback
    }

    private fun sendClapDetectedEvent(accepted: Boolean) {
        val params = Arguments.createMap().apply {
            putBoolean("accepted", accepted)
        }
        sendEvent("onClapDetected", params)
    }

    private fun initializeHandLandmarker() {
        backgroundExecutor.execute {
            try {
                handLandmarkerHelper = HandLandmarkerHelper(
                    context = context,
                    runningMode = RunningMode.LIVE_STREAM,
                    minHandDetectionConfidence = 0.5f,
                    minHandTrackingConfidence = 0.5f,
                    minHandPresenceConfidence = 0.5f,
                    maxNumHands = 2,
                    currentDelegate = HandLandmarkerHelper.DELEGATE_CPU,
                    handLandmarkerHelperListener = this
                )
                Log.i(TAG, "HandLandmarkerHelper initialized")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize HandLandmarkerHelper", e)
                sendErrorEvent("Failed to initialize hand detection: ${e.message}")
            }
        }
    }
    
    @SuppressLint("MissingPermission")
    private fun startCamera() {
        Log.i(TAG, "📷 startCamera() called, isCameraStarting=$isCameraStarting, isCameraStarted=$isCameraStarted")

        // Guard against multiple starts
        if (isCameraStarting || isCameraStarted) {
            Log.i(TAG, "📷 Camera already starting or started, skipping")
            return
        }

        isCameraStarting = true
        frameCount = 0  // Reset frame counter for fresh debug logs

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                Log.i(TAG, "📷 CameraProvider obtained")

                // Double-check we should still start
                if (!isActive) {
                    Log.i(TAG, "📷 View became inactive while getting provider, aborting")
                    isCameraStarting = false
                    return@addListener
                }

                // Back camera with ultra-wide (0.5x) if available
                val cameraSelector = CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                    .build()
                Log.i(TAG, "📷 CameraSelector created for BACK camera")

                // Unbind all use cases before creating new ones (important for clean state)
                cameraProvider.unbindAll()
                Log.i(TAG, "📷 Unbound all previous use cases")

                // Check that surface is still available
                val currentSurfaceTexture = surfaceTexture
                if (currentSurfaceTexture == null || !isSurfaceReady) {
                    Log.e(TAG, "📷 Surface not available, cannot start camera")
                    isCameraStarting = false
                    return@addListener
                }

                // Preview - create and set custom surface provider using our TextureView
                preview = Preview.Builder()
                    .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                    .build()

                Log.i(TAG, "📷 Preview created, setting custom surface provider...")

                // Create custom SurfaceProvider that uses our TextureView's SurfaceTexture
                preview?.setSurfaceProvider { request ->
                    val resolution = request.resolution
                    Log.i(TAG, "📺 SurfaceProvider requested resolution: ${resolution.width}x${resolution.height}")

                    // Save preview resolution for overlay alignment
                    previewWidth = resolution.width
                    previewHeight = resolution.height

                    // Set the default buffer size to match the requested resolution
                    currentSurfaceTexture.setDefaultBufferSize(resolution.width, resolution.height)

                    // Apply transform to scale preview to fill TextureView
                    updateTextureViewTransform(resolution.width, resolution.height)

                    // Create a Surface from the SurfaceTexture
                    val surface = Surface(currentSurfaceTexture)
                    Log.i(TAG, "📺 Providing surface to CameraX")

                    // Provide the surface to CameraX
                    request.provideSurface(surface, ContextCompat.getMainExecutor(context)) { result ->
                        Log.i(TAG, "📺 Surface result code: ${result.resultCode}")
                        // Don't release the surface here - let TextureView manage it
                    }
                }
                Log.i(TAG, "📷 Custom surface provider set")

                // Image analysis for hand detection - use same aspect ratio as preview
                val analysisExecutor = Executors.newSingleThreadExecutor()
                imageAnalyzer = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setTargetAspectRatio(AspectRatio.RATIO_4_3)  // Match preview aspect ratio
                    .build()
                    .also { analyzer ->
                        Log.i(TAG, "📷 Setting up ImageAnalysis analyzer with dedicated executor")
                        analyzer.setAnalyzer(analysisExecutor) { image ->
                            try {
                                detectHand(image)
                            } catch (e: Exception) {
                                Log.e(TAG, "Exception in detectHand analyzer", e)
                                image.close()
                            }
                        }
                    }

                // Video capture
                val recorder = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.HD))
                    .build()
                videoCapture = VideoCapture.withOutput(recorder)

                Log.i(TAG, "📷 About to bind use cases, TextureView: ${textureView.width}x${textureView.height}")

                // Bind use cases to lifecycle
                camera = cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    cameraSelector,
                    preview,
                    imageAnalyzer,
                    videoCapture
                )

                isCameraStarted = true
                isCameraStarting = false
                Log.i(TAG, "📷 Camera bound successfully!")

                // Set zoom level (user requested 0.5x, but 1.0x works better for hand detection)
                camera?.cameraControl?.let { control ->
                    val cameraInfo = camera?.cameraInfo
                    val zoomState = cameraInfo?.zoomState?.value
                    if (zoomState != null) {
                        val minZoom = zoomState.minZoomRatio
                        Log.i(TAG, "📷 Zoom range: ${minZoom} - ${zoomState.maxZoomRatio}")
                        // Use minimum zoom (ultra-wide) as requested by user
                        control.setZoomRatio(minZoom)
                        Log.i(TAG, "📷 Set zoom to ${minZoom}x (ultra-wide)")
                    }
                }

                Log.i(TAG, "Camera started successfully - Preview should be visible")
                Log.i(TAG, "TextureView visibility: ${textureView.visibility}")
                Log.i(TAG, "TextureView size: ${textureView.width}x${textureView.height}")

                sendReadyEvent()

            } catch (e: Exception) {
                Log.e(TAG, "Camera binding failed", e)
                isCameraStarting = false
                isCameraStarted = false
                sendErrorEvent("Camera failed: ${e.message}")
            }

        }, ContextCompat.getMainExecutor(context))
    }
    
    private fun stopCamera() {
        try {
            val cameraProvider = ProcessCameraProvider.getInstance(context).get()
            cameraProvider.unbindAll()
            camera = null
            preview = null
            imageAnalyzer = null
            isCameraStarted = false
            isCameraStarting = false
            Log.i(TAG, "Camera stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera", e)
        }
    }
    
    private fun detectHand(imageProxy: ImageProxy) {
        frameCount++

        // Log every 30th frame to verify analyzer is running
        if (frameCount == 1 || frameCount % 30 == 0) {
            Log.i(TAG, "🎥 detectHand called, frame #$frameCount, imageSize=${imageProxy.width}x${imageProxy.height}")
        }

        // Log first frame for debugging
        if (frameCount == 1) {
            Log.i(TAG, "📷 First frame received! format=${imageProxy.format}, rotation=${imageProxy.imageInfo.rotationDegrees}")
        }

        // Run hand detection if helper is initialized
        if (::handLandmarkerHelper.isInitialized) {
            handLandmarkerHelper.detectLiveStream(
                imageProxy = imageProxy,
                isFrontCamera = false
            )
        } else {
            // Close image proxy if hand detection not ready
            Log.w(TAG, "⚠️ HandLandmarkerHelper not initialized, closing frame")
            imageProxy.close()
        }
    }
    
    // HandLandmarkerHelper.LandmarkerListener implementation
    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        mainHandler.post {
            val result = resultBundle.results.firstOrNull() ?: return@post
            val handCount = result.landmarks().size

            // Always log hand detection results for debugging
            Log.d(TAG, "onResults called: handCount=$handCount, isRecording=$isRecording")

            // Check if hands are in frame (immediate, not debounced)
            val currentHandsInFrame = checkHandsInFrame(result, resultBundle.inputImageWidth, resultBundle.inputImageHeight)
            val allValid = handCount > 0 && result.landmarks().all { it.size >= 21 }
            val currentHandInFrame = currentHandsInFrame && allValid
            
            // Store previous debounced state for comparison
            val previousHandsFullyInFrame = handsFullyInFrame
            val previousHandInFrame = handInFrame
            
            // Debounce: require 3 consecutive frames with hands to start voice recognition
            if (currentHandInFrame) {
                handDetectionStableCount++
            } else {
                handDetectionStableCount = 0
            }
            
            // Update debounced state only after stable detection
            if (handDetectionStableCount >= 3) {
                handsFullyInFrame = true
                handInFrame = true
            } else if (handDetectionStableCount == 0) {
                handsFullyInFrame = false
                handInFrame = false
            }
            
            // Play continuous beep ONLY when hands are partially visible during recording
            // When hands are completely gone, stop the beep (user has removed hands intentionally)
            val hasPartialHand = handCount > 0 && !currentHandsInFrame
            val handsCompletelyGone = handCount == 0

            Log.d(TAG, "🔍 Hand detection: isRecording=$isRecording, handCount=$handCount, currentHandsInFrame=$currentHandsInFrame, hasPartialHand=$hasPartialHand")

            if (isRecording && !isPaused && hasPartialHand) {
                // Only beep when hands are partially visible (detected but not fully in frame)
                // Don't beep when recording is paused
                val service = beepSoundService
                if (service != null && !service.isBeeping()) {
                    Log.i(TAG, "🔔 Partial hand detected during recording, starting continuous beep")
                    service.startContinuousBeep()
                }
            } else if (isRecording && !isPaused) {
                // Stop beep when hands are fully in frame OR when hands are completely gone
                val service = beepSoundService
                if (service != null && service.isBeeping()) {
                    if (currentHandsInFrame && handCount > 0) {
                        Log.i(TAG, "✅ Hands fully in frame, stopping beep")
                    } else if (handsCompletelyGone) {
                        Log.i(TAG, "👋 Hands removed from camera, stopping beep")
                    }
                    service.stopContinuousBeep()
                }
            }
            
            // Clear overlay if no hands detected
            if (handCount == 0 || !handInFrame) {
                overlayView.clear()
            } else {
                // Update overlay only when hands are detected
                overlayView.setResults(
                    result,
                    resultBundle.inputImageHeight,
                    resultBundle.inputImageWidth,
                    RunningMode.LIVE_STREAM
                )
                overlayView.invalidate()
            }

            // Send status to React Native
            sendHandStatusEvent(handCount, allValid, handInFrame, handsFullyInFrame)
        }
    }
    
    override fun onError(error: String, errorCode: Int) {
        Log.e(TAG, "Hand detection error: $error (code: $errorCode)")
    }
    
    private fun checkHandsInFrame(result: HandLandmarkerResult, imageWidth: Int, imageHeight: Int): Boolean {
        if (imageWidth <= 0 || imageHeight <= 0) return false
        
        val margin = 0.05f // 5% margin
        val minX = imageWidth * margin
        val maxX = imageWidth * (1 - margin)
        val minY = imageHeight * margin
        val maxY = imageHeight * (1 - margin)
        
        for (handLandmarks in result.landmarks()) {
            for (landmark in handLandmarks) {
                val x = landmark.x() * imageWidth
                val y = landmark.y() * imageHeight
                
                if (x < minX || x > maxX || y < minY || y > maxY) {
                    return false
                }
            }
        }
        
        return true
    }

    // Recording methods
    @SuppressLint("MissingPermission")
    fun startRecording() {
        Log.i(TAG, "startRecording() called, isRecording=$isRecording")
        
        if (isRecording) {
            Log.w(TAG, "Already recording, ignoring")
            return
        }
        
        val videoCapture = videoCapture ?: run {
            Log.e(TAG, "VideoCapture is null")
            sendErrorEvent("Video capture not initialized")
            return
        }
        
        Log.i(TAG, "Creating output file...")

        // Ensure cache directory exists
        val cacheDir = context.cacheDir
        if (!cacheDir.exists()) {
            cacheDir.mkdirs()
            Log.i(TAG, "Created cache directory: ${cacheDir.absolutePath}")
        }

        outputFile = File(cacheDir, "recording_${System.currentTimeMillis()}.mp4")
        Log.i(TAG, "Output file: ${outputFile?.absolutePath}")

        // Create the file first so CameraX can check storage space
        try {
            if (!outputFile!!.exists()) {
                outputFile!!.createNewFile()
                Log.i(TAG, "Created empty output file")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create output file", e)
            sendErrorEvent("Failed to create output file: ${e.message}")
            return
        }

        val fileOutputOptions = FileOutputOptions.Builder(outputFile!!)
            .build()
        
        recording = videoCapture.output
            .prepareRecording(context, fileOutputOptions)
            .withAudioEnabled()
            .start(ContextCompat.getMainExecutor(context)) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        isRecording = true
                        isPaused = false
                        recordingStartTime = System.currentTimeMillis()

                        // Stop clap detection during recording (audio conflicts)
                        stopClapDetection()

                        // Start IMU sensor collection synchronized with recording
                        imuDataPath = null
                        val referenceTimeNanos = SystemClock.elapsedRealtimeNanos()
                        imuSensorHelper?.let { helper ->
                            if (helper.startCollection(referenceTimeNanos)) {
                                Log.i(TAG, "📊 IMU collection started at reference time: $referenceTimeNanos")
                            } else {
                                Log.w(TAG, "⚠️ Failed to start IMU collection")
                            }
                        }

                        // Play recording start sound (like native camera apps)
                        playRecordingStartSound()

                        sendRecordingStartedEvent()
                        Log.i(TAG, "🎬 Recording started - isRecording=$isRecording, beepService=${beepSoundService != null}")
                    }
                    is VideoRecordEvent.Finalize -> {
                        isRecording = false

                        // Stop IMU collection and save data
                        val videoPath = outputFile?.absolutePath
                        if (videoPath != null) {
                            imuDataPath = imuSensorHelper?.stopAndSave(videoPath)
                            Log.i(TAG, "📊 IMU data saved to: $imuDataPath")
                        } else {
                            // Just stop without saving if no video path
                            imuSensorHelper?.stopCollection()
                            Log.w(TAG, "⚠️ No video path - IMU data discarded")
                        }

                        if (!event.hasError()) {
                            val duration = (System.currentTimeMillis() - recordingStartTime) / 1000.0
                            sendRecordingCompletedEvent(videoPath!!, duration, imuDataPath ?: "")
                            Log.i(TAG, "Recording completed: $videoPath")
                        } else {
                            // Clean up failed recording file
                            outputFile?.let { file ->
                                if (file.exists()) {
                                    file.delete()
                                    Log.i(TAG, "Cleaned up failed recording file")
                                }
                            }
                            sendErrorEvent("Recording failed: ${event.cause?.message}")
                            Log.e(TAG, "Recording error: ${event.error}")
                        }

                        // Restart clap detection if enabled and still active
                        if (enableClapStart && isActive) {
                            Log.i(TAG, "👏 Restarting clap detection after recording completed")
                            startClapDetection()
                        }
                    }
                }
            }
    }
    
    fun stopRecording() {
        if (!isRecording) return
        recording?.stop()
        recording = null
    }
    
    fun pauseRecording() {
        Log.i(TAG, "⏸️ pauseRecording() called, isRecording=$isRecording")
        if (!isRecording) {
            Log.w(TAG, "Not recording, cannot pause")
            return
        }
        recording?.pause()
        isPaused = true
        // Stop beep when paused
        beepSoundService?.stopContinuousBeep()
        sendRecordingPausedEvent()
        Log.i(TAG, "Recording paused")
    }
    
    fun resumeRecording() {
        Log.i(TAG, "▶️ resumeRecording() called, isRecording=$isRecording")
        if (!isRecording) {
            Log.w(TAG, "Not recording, cannot resume")
            return
        }
        recording?.resume()
        isPaused = false
        sendRecordingResumedEvent()
        Log.i(TAG, "Recording resumed")
    }
    
    // Event sending
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, eventName, params)
    }
    
    private fun sendReadyEvent() {
        sendEvent("onReady", Arguments.createMap())
    }
    
    private fun sendHandStatusEvent(handCount: Int, valid: Boolean, handInFrame: Boolean, handsFullyInFrame: Boolean) {
        val params = Arguments.createMap().apply {
            putInt("handCount", handCount)
            putBoolean("valid", valid)
            putBoolean("handInFrame", handInFrame)
            putBoolean("handsFullyInFrame", handsFullyInFrame)
        }
        sendEvent("onHandStatusChange", params)
    }
    
    private fun sendErrorEvent(message: String) {
        val params = Arguments.createMap().apply {
            putString("message", message)
        }
        sendEvent("onError", params)
    }
    
    private fun sendRecordingStartedEvent() {
        sendEvent("onRecordingStarted", Arguments.createMap())
    }
    
    private fun sendRecordingPausedEvent() {
        sendEvent("onRecordingPaused", Arguments.createMap())
    }
    
    private fun sendRecordingResumedEvent() {
        sendEvent("onRecordingResumed", Arguments.createMap())
    }
    
    private fun sendRecordingCompletedEvent(filePath: String, duration: Double, imuDataPath: String) {
        val params = Arguments.createMap().apply {
            putString("filePath", filePath)
            putDouble("duration", duration)
            putString("imuDataPath", imuDataPath)
        }
        sendEvent("onRecordingCompleted", params)
    }

    private fun playRecordingStartSound() {
        // Run on background thread to avoid blocking main thread
        Thread {
            try {
                // Play a short beep to indicate recording started (similar to native camera apps)
                // Use STREAM_MUSIC for better audibility and 100% volume
                val toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
                // Play a clear, noticeable tone
                toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 200)
                Thread.sleep(250)
                toneGenerator.release()
                Log.i(TAG, "🔊 Recording start sound played")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to play recording start sound: ${e.message}")
            }
        }.start()
    }

    fun cleanup() {
        stopClapDetection()
        stopRecording()
        stopCamera()
        beepSoundService?.stopContinuousBeep()
        beepSoundService?.release()
        beepSoundService = null
        imuSensorHelper?.cleanup()
        imuSensorHelper = null
        backgroundExecutor.execute {
            handLandmarkerHelper.clearHandLandmarker()
        }
        backgroundExecutor.shutdown()
        lifecycleOwner.setCurrentState(Lifecycle.State.DESTROYED)
    }
}
