package com.recordyourday_app.handlandmarker

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import com.recordyourday_app.R
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Native Android Activity for camera recording with MediaPipe hand detection.
 * This matches the iOS implementation pattern - a full-screen native camera view.
 * 
 * Launch from React Native with:
 * ```
 * const HandLandmarkerModule = NativeModules.HandLandmarkerModule;
 * HandLandmarkerModule.startRecording(duration);
 * ```
 */
class HandLandmarkerActivity : AppCompatActivity(), HandLandmarkerHelper.LandmarkerListener {
    
    companion object {
        private const val TAG = "HandLandmarkerActivity"
        const val EXTRA_DURATION = "duration"
        const val RESULT_VIDEO_PATH = "videoPath"
        const val RESULT_DURATION = "duration"
    }
    
    // UI
    private lateinit var previewView: PreviewView
    private lateinit var overlayView: OverlayView
    private lateinit var statusText: TextView
    
    // Camera
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    
    // MediaPipe
    private lateinit var handLandmarkerHelper: HandLandmarkerHelper
    private lateinit var backgroundExecutor: ExecutorService
    
    // Recording state
    private var isRecording = false
    private var recordingStartTime: Long = 0
    private var maxDuration: Long = 0 // in milliseconds
    private var outputFile: File? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Hand detection state
    private var handInFrame = false
    private var outOfFrameSince: Long = 0
    private val autoPauseThreshold = 10000L // 10 seconds
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Get duration from intent
        maxDuration = intent.getLongExtra(EXTRA_DURATION, 60000L) // default 60 seconds
        
        setupUI()
        setupCamera()
        setupHandLandmarker()
    }
    
    private fun setupUI() {
        // Create layout programmatically
        val rootLayout = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        
        // Preview view
        previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        }
        rootLayout.addView(previewView)
        
        // Overlay view for hand landmarks
        overlayView = OverlayView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        rootLayout.addView(overlayView)
        
        // Status text
        statusText = TextView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = 100
                leftMargin = 40
            }
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            text = "Initializing camera..."
        }
        rootLayout.addView(statusText)
        
        setContentView(rootLayout)
        
        // Hide system UI for full-screen experience
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )
    }
    
    @SuppressLint("MissingPermission")
    private fun setupCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            
            // Front camera
            val cameraSelector = CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
                .build()
            
            // Preview
            preview = Preview.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
            
            // Image analysis for hand detection
            imageAnalyzer = ImageAnalysis.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also {
                    it.setAnalyzer(backgroundExecutor) { image ->
                        detectHand(image)
                    }
                }
            
            // Video capture
            val recorder = Recorder.Builder()
                .setQualitySelector(QualitySelector.from(Quality.HD))
                .build()
            videoCapture = VideoCapture.withOutput(recorder)
            
            // Unbind all use cases before rebinding
            cameraProvider.unbindAll()
            
            try {
                // Bind use cases to lifecycle
                camera = cameraProvider.bindToLifecycle(
                    this,
                    cameraSelector,
                    preview,
                    imageAnalyzer,
                    videoCapture
                )
                
                Log.i(TAG, "Camera bound successfully")
                updateStatus("Camera ready - Starting recording...")
                
                // Auto-start recording after camera is ready
                mainHandler.postDelayed({
                    startRecording()
                }, 500)
                
            } catch (e: Exception) {
                Log.e(TAG, "Camera binding failed", e)
                updateStatus("Camera error: ${e.message}")
                finishWithError("Camera binding failed: ${e.message}")
            }
            
        }, ContextCompat.getMainExecutor(this))
    }
    
    private fun setupHandLandmarker() {
        backgroundExecutor = Executors.newSingleThreadExecutor()
        
        backgroundExecutor.execute {
            try {
                handLandmarkerHelper = HandLandmarkerHelper(
                    context = this,
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
                runOnUiThread {
                    updateStatus("Hand detection error: ${e.message}")
                }
            }
        }
    }
    
    private fun detectHand(imageProxy: ImageProxy) {
        if (::handLandmarkerHelper.isInitialized) {
            handLandmarkerHelper.detectLiveStream(
                imageProxy = imageProxy,
                isFrontCamera = true
            )
        } else {
            imageProxy.close()
        }
    }
    
    @SuppressLint("MissingPermission")
    private fun startRecording() {
        if (isRecording) return
        
        val videoCapture = videoCapture ?: run {
            Log.e(TAG, "VideoCapture is null")
            finishWithError("Video capture not initialized")
            return
        }
        
        // Create output file
        outputFile = File(cacheDir, "recording_${System.currentTimeMillis()}.mp4")
        
        val fileOutputOptions = FileOutputOptions.Builder(outputFile!!)
            .build()
        
        recording = videoCapture.output
            .prepareRecording(this, fileOutputOptions)
            .withAudioEnabled()
            .start(ContextCompat.getMainExecutor(this)) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        isRecording = true
                        recordingStartTime = System.currentTimeMillis()
                        updateStatus("Recording...")
                        Log.i(TAG, "Recording started")
                        
                        // Schedule auto-stop based on duration
                        mainHandler.postDelayed({
                            if (isRecording) {
                                stopRecording()
                            }
                        }, maxDuration)
                    }
                    is VideoRecordEvent.Finalize -> {
                        if (!event.hasError()) {
                            val duration = System.currentTimeMillis() - recordingStartTime
                            Log.i(TAG, "Recording completed: ${outputFile?.absolutePath}")
                            finishWithSuccess(outputFile!!.absolutePath, duration)
                        } else {
                            Log.e(TAG, "Recording error: ${event.error}")
                            finishWithError("Recording failed: ${event.cause?.message}")
                        }
                    }
                }
            }
    }
    
    private fun stopRecording() {
        if (!isRecording) return
        
        recording?.stop()
        recording = null
        isRecording = false
        updateStatus("Finishing recording...")
    }
    
    private fun updateStatus(message: String) {
        runOnUiThread {
            statusText.text = message
        }
    }
    
    private fun finishWithSuccess(videoPath: String, duration: Long) {
        val resultIntent = Intent().apply {
            putExtra(RESULT_VIDEO_PATH, videoPath)
            putExtra(RESULT_DURATION, duration)
        }
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }
    
    private fun finishWithError(error: String) {
        val resultIntent = Intent().apply {
            putExtra("error", error)
        }
        setResult(Activity.RESULT_CANCELED, resultIntent)
        finish()
    }
    
    // HandLandmarkerHelper.LandmarkerListener implementation
    override fun onResults(resultBundle: HandLandmarkerHelper.ResultBundle) {
        runOnUiThread {
            val result = resultBundle.results.firstOrNull() ?: return@runOnUiThread
            val handCount = result.landmarks().size
            
            // Check if hands are in frame
            val handsInFrame = checkHandsInFrame(result, resultBundle.inputImageWidth, resultBundle.inputImageHeight)
            val previousHandInFrame = handInFrame
            handInFrame = handsInFrame && handCount > 0
            
            // Auto-pause logic (optional - can be removed if not needed)
            if (isRecording) {
                if (handInFrame) {
                    outOfFrameSince = 0
                } else {
                    if (outOfFrameSince == 0L) {
                        outOfFrameSince = System.currentTimeMillis()
                    } else {
                        val outDuration = System.currentTimeMillis() - outOfFrameSince
                        if (outDuration >= autoPauseThreshold) {
                            // Could implement pause/resume here if needed
                            Log.w(TAG, "Hand out of frame for ${autoPauseThreshold}ms")
                        }
                    }
                }
            }
            
            // Update overlay
            overlayView.setResults(
                result,
                resultBundle.inputImageHeight,
                resultBundle.inputImageWidth,
                RunningMode.LIVE_STREAM
            )
            overlayView.invalidate()
            
            // Update status
            val elapsed = if (isRecording) {
                (System.currentTimeMillis() - recordingStartTime) / 1000
            } else {
                0
            }
            updateStatus("Recording... ${elapsed}s | Hands: $handCount | In frame: $handInFrame")
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
    
    override fun onDestroy() {
        super.onDestroy()
        
        // Cleanup
        recording?.stop()
        backgroundExecutor.execute {
            handLandmarkerHelper.clearHandLandmarker()
        }
        backgroundExecutor.shutdown()
        mainHandler.removeCallbacksAndMessages(null)
    }
}
