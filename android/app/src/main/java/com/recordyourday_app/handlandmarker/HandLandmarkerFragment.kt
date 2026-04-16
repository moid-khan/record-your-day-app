package com.recordyourday_app.handlandmarker

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.AspectRatio
import androidx.camera.video.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import com.recordyourday_app.R
import com.google.mediapipe.tasks.vision.core.RunningMode
import android.speech.SpeechRecognizer
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.content.Intent
import android.media.MediaRecorder
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.text.SimpleDateFormat
import java.util.*

class HandLandmarkerFragment : Fragment(), HandLandmarkerHelper.LandmarkerListener {

    interface Listener {
        fun onReady()
        fun onHandsDetected(count: Int)
        fun onError(message: String)
    }
    
    // Extended listener interface for recording and voice commands
    interface ExtendedListener : Listener {
        fun onRecordingStarted()
        fun onRecordingPaused()
        fun onRecordingResumed()
        fun onRecordingCompleted(filePath: String, duration: Double)
        fun onVoiceCommand(command: String, accepted: Boolean, reason: String? = null)
    }

    private var listener: Listener? = null
    private lateinit var viewFinder: PreviewView
    private lateinit var overlay: HandLandmarkerOverlayView
    private lateinit var backgroundExecutor: ExecutorService

    private var handLandmarkerHelper: HandLandmarkerHelper? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var videoCapture: androidx.camera.video.VideoCapture<Recorder>? = null
    private var recorder: Recorder? = null
    private var camera: Camera? = null
    private var cameraFacing = CameraSelector.LENS_FACING_FRONT
    @Volatile private var isActive = false
    private var isCameraStarted = false

    private var readyEmitted = false
    
    // Recording state
    private var isRecording = false
    private var isPaused = false
    private var recordingStartTime: Long = 0
    private var pausedDuration: Long = 0
    private var lastPauseTime: Long = 0
    private var currentRecordingFile: File? = null
    private var activeRecording: androidx.camera.video.Recording? = null
    
    // Voice command state
    private var speechRecognizer: SpeechRecognizer? = null
    private var enableVoiceStart = false
    private var requireHandsForVoiceStart = true
    private var handsFullyInFrame = false
    private var lastVoiceStartTime: Long = 0
    private val voiceStartCooldownMs: Long = 2000 // 2 seconds like iOS

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startCameraIfNeeded("permission")
            } else {
                listener?.onError("Camera permission is required")
            }
        }

    fun setListener(listener: Listener?) {
        this.listener = listener
    }

    fun setActive(active: Boolean) {
        Log.d(TAG, "setActive called: $active (was: $isActive)")
        isActive = active
        if (!active) {
            Log.d(TAG, "Deactivating: clearing hand landmarker")
            backgroundExecutor.execute { handLandmarkerHelper?.clearHandLandmarker() }
            overlay.clear()
        } else {
            Log.d(TAG, "Activating: setting up hand landmarker if needed")
            backgroundExecutor.execute {
                if (handLandmarkerHelper?.isClose() == true) {
                    Log.d(TAG, "HandLandmarker is closed, setting up...")
                    handLandmarkerHelper?.setupHandLandmarker()
                } else {
                    Log.d(TAG, "HandLandmarker is already set up")
                }
            }
        }
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

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_hand_landmarker, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        Log.d(TAG, "HandLandmarkerFragment onViewCreated")
        Log.d(TAG, "Fragment view dimensions: ${view.width}x${view.height}")
        
        viewFinder = view.findViewById(R.id.view_finder)
        overlay = view.findViewById(R.id.overlay)
        
        Log.d(TAG, "ViewFinder found: ${viewFinder != null}, Overlay found: ${overlay != null}")
        Log.d(TAG, "ViewFinder initial dimensions: ${viewFinder.width}x${viewFinder.height}")
        
        viewFinder.scaleType = PreviewView.ScaleType.FILL_CENTER
        // Use PERFORMANCE mode for better camera initialization
        viewFinder.implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        backgroundExecutor = Executors.newSingleThreadExecutor()
        
        // Initialize beep service early to ensure it's ready
        try {
            val beepService = BeepSoundService.getInstance(requireContext())
            Log.d(TAG, "BeepSoundService initialized in onViewCreated: ${beepService != null}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize BeepSoundService in onViewCreated", e)
        }
        
        initializeHandLandmarker()

        // Force layout pass
        view.requestLayout()
        viewFinder.requestLayout()

        // Add layout change listener to wait for proper dimensions
        viewFinder.addOnLayoutChangeListener { v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            val width = right - left
            val height = bottom - top
            Log.d(TAG, "ViewFinder layout changed: ${width}x${height} (was ${oldRight-oldLeft}x${oldBottom-oldTop})")
            
            if (width > 0 && height > 0 && hasCameraPermission()) {
                Log.d(TAG, "ViewFinder has valid dimensions, starting camera")
                startCameraIfNeeded("layout-change")
            }
        }

        // Try multiple times with increasing delays
        viewFinder.post {
            Log.d(TAG, "ViewFinder post(1) - dimensions: ${viewFinder.width}x${viewFinder.height}")
            if (viewFinder.width > 0 && viewFinder.height > 0 && hasCameraPermission()) {
                startCameraIfNeeded("post-1")
            }
        }
        
        viewFinder.postDelayed({
            Log.d(TAG, "ViewFinder postDelayed(100) - dimensions: ${viewFinder.width}x${viewFinder.height}")
            if (viewFinder.width > 0 && viewFinder.height > 0 && hasCameraPermission()) {
                startCameraIfNeeded("post-delayed-100")
            }
        }, 100)
        
        viewFinder.postDelayed({
            Log.d(TAG, "ViewFinder postDelayed(300) - dimensions: ${viewFinder.width}x${viewFinder.height}")
            if (viewFinder.width > 0 && viewFinder.height > 0 && hasCameraPermission()) {
                startCameraIfNeeded("post-delayed-300")
            } else if (!hasCameraPermission()) {
                Log.d(TAG, "Requesting camera permission")
                requestPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }, 300)
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume: starting camera if needed")
        startCameraIfNeeded("onResume")
        backgroundExecutor.execute {
            if (handLandmarkerHelper?.isClose() == true) {
                handLandmarkerHelper?.setupHandLandmarker()
            }
        }
        handleFragmentResume()
    }

    override fun onPause() {
        super.onPause()
        handleFragmentPause()
        isCameraStarted = false
        cameraProvider?.unbindAll()
        camera = null
        preview = null
        imageAnalyzer = null
        backgroundExecutor.execute {
            handLandmarkerHelper?.clearHandLandmarker()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        // Stop beeping when view is destroyed
        BeepSoundService.getInstance(requireContext()).stopContinuousBeep()
        isCameraStarted = false
        cameraProvider?.unbindAll()
        camera = null
        preview = null
        imageAnalyzer = null
        backgroundExecutor.shutdown()
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            requireContext(),
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun initializeHandLandmarker() {
        backgroundExecutor.execute {
            handLandmarkerHelper = HandLandmarkerHelper(
                context = requireContext(),
                runningMode = RunningMode.LIVE_STREAM,
                handLandmarkerHelperListener = this
            )
        }
    }

    private fun setUpCamera() {
        Log.d(TAG, "setUpCamera: initializing camera provider")
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener(
            {
                cameraProvider = cameraProviderFuture.get()
                bindCameraUseCases()
            },
            ContextCompat.getMainExecutor(requireContext())
        )
    }

    private fun startCameraIfNeeded(source: String) {
        if (isCameraStarted) {
            Log.d(TAG, "startCameraIfNeeded($source): already started")
            return
        }
        if (!hasCameraPermission()) {
            Log.d(TAG, "startCameraIfNeeded($source): missing permission")
            return
        }
        if (viewFinder.width == 0 || viewFinder.height == 0) {
            Log.d(TAG, "startCameraIfNeeded($source): waiting for layout")
            return
        }
        val isStarted =
            viewLifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        Log.d(
            TAG,
            "startCameraIfNeeded($source): started=$isStarted size=${viewFinder.width}x${viewFinder.height}"
        )
        if (!isStarted) {
            return
        }
        isCameraStarted = true
        viewFinder.post { setUpCamera() }
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun bindCameraUseCases() {
        val provider = cameraProvider ?: run {
            Log.e(TAG, "bindCameraUseCases: Camera provider is null!")
            listener?.onError("Camera provider unavailable")
            return
        }
        Log.d(TAG, "bindCameraUseCases: binding use cases")
        Log.d(TAG, "bindCameraUseCases: ViewFinder dimensions: ${viewFinder.width}x${viewFinder.height}")
        Log.d(TAG, "bindCameraUseCases: isActive=$isActive")

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(cameraFacing)
            .build()

        preview = Preview.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(viewFinder.display.rotation)
            .build()

        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setTargetRotation(viewFinder.display.rotation)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also {
                it.setAnalyzer(backgroundExecutor) { image ->
                    Log.d(TAG, "ImageAnalyzer callback: isActive=$isActive")
                    if (isActive) {
                        detectHand(image)
                    } else {
                        Log.d(TAG, "ImageAnalyzer: isActive=false, closing image")
                        image.close()
                    }
                }
            }

        provider.unbindAll()
        Log.d(TAG, "bindCameraUseCases: Unbound all previous use cases")

        try {
            Log.d(TAG, "bindCameraUseCases: Binding to lifecycle...")
            // IMPORTANT: Bind to lifecycle FIRST, then set surface provider
            camera = provider.bindToLifecycle(
                this,
                cameraSelector,
                preview,
                imageAnalyzer
            )
            Log.d(TAG, "bindCameraUseCases: Successfully bound to lifecycle")
            
            // Set surface provider AFTER binding to lifecycle
            Log.d(TAG, "bindCameraUseCases: Setting surface provider...")
            preview?.setSurfaceProvider(viewFinder.surfaceProvider)
            Log.d(TAG, "bindCameraUseCases: Surface provider set")
            
            observeCameraState()
            if (!readyEmitted) {
                readyEmitted = true
                Log.d(TAG, "bindCameraUseCases: Emitting onReady event")
                listener?.onReady()
            }
            Log.d(TAG, "bindCameraUseCases: Camera setup complete!")
        } catch (e: Exception) {
            Log.e(TAG, "Use case binding failed", e)
            e.printStackTrace()
            listener?.onError("Use case binding failed: ${e.message}")
            isCameraStarted = false
        }
    }

    private fun detectHand(imageProxy: ImageProxy) {
        Log.d(TAG, "detectHand called - handLandmarkerHelper=${handLandmarkerHelper != null}")
        handLandmarkerHelper?.detectLiveStream(
            imageProxy = imageProxy,
            isFrontCamera = cameraFacing == CameraSelector.LENS_FACING_FRONT
        ) ?: run {
            Log.w(TAG, "handLandmarkerHelper is null, closing image")
            imageProxy.close()
        }
    }

    private fun observeCameraState() {
        val cameraInfo = camera?.cameraInfo ?: return
        cameraInfo.cameraState.removeObservers(viewLifecycleOwner)
        cameraInfo.cameraState.observe(viewLifecycleOwner) { state ->
            val error = state.error
            if (error != null) {
                listener?.onError("Camera error: ${error.code}")
            }
        }
    }

    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        Log.d(TAG, "onResults called - results count: ${resultBundle.results.size}")
        activity?.runOnUiThread {
            val result = resultBundle.results.firstOrNull() ?: run {
                Log.d(TAG, "No hand results in bundle")
                return@runOnUiThread
            }
            Log.d(TAG, "Processing hand result - landmarks count: ${result.landmarks().size}")
            overlay.setResults(
                result,
                resultBundle.inputImageHeight,
                resultBundle.inputImageWidth,
                RunningMode.LIVE_STREAM
            )
            
            val handCount = result.landmarks().size
            val allValid = handCount > 0 && result.landmarks().all { it.size >= 21 }
            
            // Check if hands are fully in frame (with 5% margin, like iOS)
            val handsInFrame = checkHandsInFrame(result, resultBundle.inputImageWidth, resultBundle.inputImageHeight)
            val handsFullyInFrame = handsInFrame && handCount > 0
            
            // Check if any hand is partially out of frame (for beep logic)
            // Beep continuously when: hand is detected but NOT fully in frame
            // Stop beeping when: no hands OR at least one hand is fully in frame
            val hasPartialHand = handCount > 0 && !handsInFrame
            
            // Detailed logging for debugging
            Log.d(TAG, "Hand detection: count=$handCount, valid=$allValid, inFrame=$handsInFrame, partial=$hasPartialHand, imageSize=${resultBundle.inputImageWidth}x${resultBundle.inputImageHeight}")
            
            // Beep logic: beep continuously when hand is partially visible (like iOS)
            // Ensure we're on the main thread and context is valid
            try {
                val context = requireContext()
                val beepService = BeepSoundService.getInstance(context)
                Log.d(TAG, "BeepService instance obtained: ${beepService != null}")
                
                if (hasPartialHand) {
                    // Start continuous beep if not already beeping
                    Log.d(TAG, "🔔 PARTIAL HAND DETECTED - Starting continuous beep (handCount=$handCount, handsInFrame=$handsInFrame)")
                    beepService.startContinuousBeep()
                } else {
                    // Stop beeping when hand is fully in frame or no hands detected
                    if (handCount == 0) {
                        Log.d(TAG, "🔕 NO HANDS - Stopping beep")
                    } else {
                        Log.d(TAG, "✅ HAND FULLY IN FRAME - Stopping beep (handCount=$handCount, handsInFrame=$handsInFrame)")
                    }
                    beepService.stopContinuousBeep()
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error with beep service", e)
                e.printStackTrace()
            }
            
            // Emit hand status with detailed info (like iOS)
            (listener as? HandLandmarkerFragmentView)?.onHandStatusChange(
                handCount = handCount,
                valid = allValid,
                handInFrame = handsInFrame && allValid,
                handsFullyInFrame = handsFullyInFrame
            )
            
            listener?.onHandsDetected(handCount)
        }
    }
    
    private fun checkHandsInFrame(result: com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult, imageWidth: Int, imageHeight: Int): Boolean {
        if (imageWidth <= 0 || imageHeight <= 0) {
            Log.w(TAG, "Invalid image dimensions: ${imageWidth}x${imageHeight}")
            return false
        }
        
        val margin = 0.05f // 5% margin like iOS
        val minX = imageWidth * margin
        val maxX = imageWidth * (1 - margin)
        val minY = imageHeight * margin
        val maxY = imageHeight * (1 - margin)
        
        Log.d(TAG, "Checking hands in frame: imageSize=${imageWidth}x${imageHeight}, bounds=[$minX-$maxX, $minY-$maxY]")
        
        var allHandsInFrame = true
        for ((handIndex, handLandmarks) in result.landmarks().withIndex()) {
            var handInFrame = true
            var outOfBoundsCount = 0
            var totalLandmarks = 0
            
            for ((landmarkIndex, landmark) in handLandmarks.withIndex()) {
                totalLandmarks++
                // MediaPipe landmarks are normalized (0.0 to 1.0)
                val x = landmark.x() * imageWidth
                val y = landmark.y() * imageHeight
                
                if (x < minX || x > maxX || y < minY || y > maxY) {
                    outOfBoundsCount++
                    if (landmarkIndex < 5) { // Log first few out-of-bounds landmarks
                        Log.d(TAG, "Hand $handIndex landmark $landmarkIndex out of bounds: x=$x (bounds: $minX-$maxX), y=$y (bounds: $minY-$maxY)")
                    }
                    handInFrame = false
                }
            }
            
            if (!handInFrame) {
                Log.d(TAG, "Hand $handIndex is partially out of frame: $outOfBoundsCount/$totalLandmarks landmarks out of bounds")
                allHandsInFrame = false
            }
        }
        
        Log.d(TAG, "Hands in frame check result: $allHandsInFrame")
        return allHandsInFrame
    }

    override fun onError(error: String, errorCode: Int) {
        listener?.onError(error)
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        imageAnalyzer?.targetRotation = viewFinder.display.rotation
    }

    // Recording methods
    fun startRecording() {
        if (isRecording) {
            Log.w(TAG, "Already recording")
            return
        }
        
        try {
            // Create output file
            val outputDir = requireContext().cacheDir
            val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            currentRecordingFile = File(outputDir, "recording_${timestamp}.mp4")
            
            // Setup recorder if not already set up
            if (recorder == null) {
                val qualitySelector = QualitySelector.fromOrderedList(
                    listOf(Quality.HIGHEST, Quality.HD, Quality.SD),
                    FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
                )
                recorder = Recorder.Builder()
                    .setQualitySelector(qualitySelector)
                    .setExecutor(backgroundExecutor)
                    .build()
            }
            
            // Create VideoCapture
            if (videoCapture == null) {
                videoCapture = androidx.camera.video.VideoCapture.Builder(recorder!!)
                    .build()
                
                // Rebind with video capture
                val provider = cameraProvider ?: return
                val cameraSelector = CameraSelector.Builder()
                    .requireLensFacing(cameraFacing)
                    .build()
                
                provider.unbindAll()
                camera = provider.bindToLifecycle(
                    this,
                    cameraSelector,
                    preview,
                    imageAnalyzer,
                    videoCapture
                )
            }
            
            // Start recording using the correct CameraX API
            val outputFileOptions = FileOutputOptions.Builder(currentRecordingFile!!).build()
            activeRecording = videoCapture!!.output
                .prepareRecording(requireContext(), outputFileOptions)
                .withAudioEnabled()
                .start(ContextCompat.getMainExecutor(requireContext())) { event ->
                    when (event) {
                        is VideoRecordEvent.Start -> {
                            isRecording = true
                            isPaused = false
                            recordingStartTime = System.currentTimeMillis()
                            pausedDuration = 0
                            lastPauseTime = 0
                            Log.d(TAG, "Recording started: ${currentRecordingFile?.absolutePath}")
                            (listener as? ExtendedListener)?.onRecordingStarted()
                        }
                        is VideoRecordEvent.Finalize -> {
                            if (!event.hasError()) {
                                isRecording = false
                                val duration = if (recordingStartTime > 0) {
                                    (System.currentTimeMillis() - recordingStartTime - pausedDuration) / 1000.0
                                } else {
                                    0.0
                                }
                                val filePath = currentRecordingFile?.absolutePath ?: ""
                                Log.d(TAG, "Recording stopped: $filePath, duration: $duration")
                                (listener as? ExtendedListener)?.onRecordingCompleted(filePath, duration)
                            } else {
                                Log.e(TAG, "Recording error: ${event.cause}")
                                listener?.onError("Recording failed: ${event.cause?.message}")
                            }
                            currentRecordingFile = null
                            activeRecording = null
                        }
                        is VideoRecordEvent.Pause -> {
                            isPaused = true
                            lastPauseTime = System.currentTimeMillis()
                            (listener as? ExtendedListener)?.onRecordingPaused()
                        }
                        is VideoRecordEvent.Resume -> {
                            if (lastPauseTime > 0) {
                                pausedDuration += System.currentTimeMillis() - lastPauseTime
                            }
                            isPaused = false
                            lastPauseTime = 0
                            (listener as? ExtendedListener)?.onRecordingResumed()
                        }
                        else -> {
                            // Handle other events if needed
                        }
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            listener?.onError("Failed to start recording: ${e.message}")
        }
    }
    
    fun stopRecording() {
        if (!isRecording) {
            Log.w(TAG, "Not recording")
            return
        }
        activeRecording?.stop()
    }
    
    fun pauseRecording() {
        if (!isRecording || isPaused) {
            return
        }
        isPaused = true
        lastPauseTime = System.currentTimeMillis()
        // Pause is handled via the Recording object - the event will be fired
        activeRecording?.pause()
        // Note: onRecordingPaused() will be called via VideoRecordEvent.Pause
    }
    
    fun resumeRecording() {
        if (!isRecording || !isPaused) {
            return
        }
        if (lastPauseTime > 0) {
            pausedDuration += System.currentTimeMillis() - lastPauseTime
        }
        isPaused = false
        lastPauseTime = 0
        // Resume is handled via the Recording object - the event will be fired
        activeRecording?.resume()
        // Note: onRecordingResumed() will be called via VideoRecordEvent.Resume
    }
    
    // Voice command methods
    fun setEnableVoiceStart(enable: Boolean) {
        enableVoiceStart = enable
        if (enable && !isRecording) {
            startVoiceListener()
        } else {
            stopVoiceListener()
        }
    }
    
    fun setRequireHandsForVoiceStart(require: Boolean) {
        requireHandsForVoiceStart = require
    }
    
    private fun startVoiceListener() {
        if (speechRecognizer != null) {
            return // Already listening
        }
        
        if (!SpeechRecognizer.isRecognitionAvailable(requireContext())) {
            Log.w(TAG, "Speech recognition not available")
            return
        }
        
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(requireContext())
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "Voice listener ready")
            }
            
            override fun onBeginningOfSpeech() {}
            
            override fun onRmsChanged(rmsdB: Float) {}
            
            override fun onBufferReceived(buffer: ByteArray?) {}
            
            override fun onEndOfSpeech() {}
            
            override fun onError(error: Int) {
                Log.w(TAG, "Speech recognition error: $error")
                // Restart listener if not recording
                if (!isRecording) {
                    view?.postDelayed({ startVoiceListener() }, 1000)
                }
            }
            
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val transcript = matches?.firstOrNull()?.lowercase() ?: return
                
                Log.d(TAG, "Speech transcript: $transcript")
                
                if (transcript.contains("start")) {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastVoiceStartTime < voiceStartCooldownMs) {
                        return // Still in cooldown
                    }
                    
                    lastVoiceStartTime = currentTime
                    
                    // Require hands-in-frame if configured
                    if (requireHandsForVoiceStart && !handsFullyInFrame) {
                        (listener as? ExtendedListener)?.onVoiceCommand("start", false, "hands_not_in_frame")
                        return
                    }
                    
                    (listener as? ExtendedListener)?.onVoiceCommand("start", true)
                    stopVoiceListener()
                    startRecording()
                }
                
                // Restart listener if not recording
                if (!isRecording) {
                    startVoiceListener()
                }
            }
            
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val transcript = matches?.firstOrNull()?.lowercase() ?: return
                
                // Check partial results for faster response
                if (transcript.contains("start")) {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastVoiceStartTime < voiceStartCooldownMs) {
                        return
                    }
                    
                    lastVoiceStartTime = currentTime
                    
                    if (requireHandsForVoiceStart && !handsFullyInFrame) {
                        (listener as? ExtendedListener)?.onVoiceCommand("start", false, "hands_not_in_frame")
                        return
                    }
                    
                    (listener as? ExtendedListener)?.onVoiceCommand("start", true)
                    stopVoiceListener()
                    startRecording()
                }
            }
            
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        
        speechRecognizer?.startListening(intent)
    }
    
    private fun stopVoiceListener() {
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null
    }
    
    // Note: We can't override onPause/onResume here as they conflict with Fragment lifecycle
    // These are handled by the existing Fragment lifecycle methods
    private fun handleFragmentPause() {
        stopVoiceListener()
        if (isRecording) {
            pauseRecording()
        }
    }
    
    private fun handleFragmentResume() {
        if (enableVoiceStart && !isRecording) {
            startVoiceListener()
        }
    }

    companion object {
        private const val TAG = "HandLandmarkerFragment"
    }
}
