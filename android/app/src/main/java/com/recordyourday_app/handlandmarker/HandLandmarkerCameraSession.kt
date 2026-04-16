package com.recordyourday_app.handlandmarker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.AspectRatio
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ExecutorService

/**
 * Simplified CameraSession inspired by react-native-vision-camera
 * This class manages the camera lifecycle independently from the View
 */
class HandLandmarkerCameraSession(
    private val context: Context,
    private val backgroundExecutor: ExecutorService
) : LifecycleOwner {
    
    companion object {
        private const val TAG = "HandLandmarkerCameraSession"
    }
    
    // Lifecycle
    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry
    
    // Camera state
    private val mutex = Mutex()
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    
    // Configuration
    var isActive = false
        private set
    var surfaceProvider: Preview.SurfaceProvider? = null
        private set
    var imageAnalyzerCallback: ((ImageProxy) -> Unit)? = null
        private set
    
    init {
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        Log.i(TAG, "CameraSession created")
    }
    
    suspend fun configure(
        isActive: Boolean,
        surfaceProvider: Preview.SurfaceProvider?,
        imageAnalyzer: ((ImageProxy) -> Unit)?
    ) {
        Log.i(TAG, "configure: isActive=$isActive")
        
        mutex.withLock {
            val wasActive = this.isActive
            val hadSurfaceProvider = this.surfaceProvider != null
            
            this.isActive = isActive
            this.surfaceProvider = surfaceProvider
            this.imageAnalyzerCallback = imageAnalyzer
            
            // Get camera provider if not already initialized
            if (cameraProvider == null) {
                cameraProvider = try {
                    val future = ProcessCameraProvider.getInstance(context)
                    future.get()
                } catch (error: Throwable) {
                    Log.e(TAG, "Failed to get CameraProvider", error)
                    throw error
                }
            }
            
            val provider = cameraProvider!!
            
            // Determine what changed
            val needsRebind = hadSurfaceProvider != (surfaceProvider != null) || camera == null
            val needsLifecycleUpdate = wasActive != isActive
            
            if (needsRebind) {
                // Full reconfiguration needed
                Log.i(TAG, "Full reconfiguration (rebind needed)")
                
                // Create outputs if they don't exist
                if (preview == null || imageAnalyzer == null) {
                    configureOutputs()
                }
                
                // Only bind if isActive=true
                if (isActive) {
                    // Set lifecycle to RESUMED before binding
                    lifecycleRegistry.currentState = Lifecycle.State.STARTED
                    lifecycleRegistry.currentState = Lifecycle.State.RESUMED
                    bindCamera(provider)
                } else {
                    // Just keep lifecycle at CREATED
                    Log.i(TAG, "isActive=false, not binding yet")
                    lifecycleRegistry.currentState = Lifecycle.State.CREATED
                }
            } else if (needsLifecycleUpdate) {
                // Lifecycle changed
                Log.i(TAG, "Lifecycle update: wasActive=$wasActive, isActive=$isActive")
                
                if (isActive && camera == null) {
                    // Need to bind now
                    Log.i(TAG, "Activating: binding camera")
                    lifecycleRegistry.currentState = Lifecycle.State.STARTED
                    lifecycleRegistry.currentState = Lifecycle.State.RESUMED
                    bindCamera(provider)
                } else if (isActive) {
                    // Just update lifecycle
                    Log.i(TAG, "Activating: updating lifecycle only")
                    lifecycleRegistry.currentState = Lifecycle.State.STARTED
                    lifecycleRegistry.currentState = Lifecycle.State.RESUMED
                } else {
                    // Deactivate
                    Log.i(TAG, "Deactivating camera")
                    lifecycleRegistry.currentState = Lifecycle.State.STARTED
                    lifecycleRegistry.currentState = Lifecycle.State.CREATED
                }
            } else {
                Log.i(TAG, "No changes needed")
            }
        }
    }
    
    private fun configureOutputs() {
        Log.i(TAG, "Configuring outputs...")
        
        // Create ImageAnalysis
        imageAnalyzer = ImageAnalysis.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()
            .also { analyzer ->
                analyzer.setAnalyzer(backgroundExecutor) { image ->
                    Log.d(TAG, "ImageAnalysis: Frame received ${image.width}x${image.height}")
                    imageAnalyzerCallback?.invoke(image) ?: image.close()
                }
            }
        
        // Create Preview - DON'T set surface provider yet
        preview = Preview.Builder()
            .setTargetAspectRatio(AspectRatio.RATIO_4_3)
            .build()
        
        Log.i(TAG, "Use cases created (surface provider will be set after binding)")
    }
    
    private fun bindCamera(provider: ProcessCameraProvider) {
        Log.i(TAG, "Binding camera...")
        
        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
            .build()
        
        val useCases = listOfNotNull(preview, imageAnalyzer)
        
        // Unbind all first
        provider.unbindAll()
        
        try {
            // Bind to our lifecycle
            camera = provider.bindToLifecycle(
                this, // Our own LifecycleOwner
                cameraSelector,
                *useCases.toTypedArray()
            )
            
            Log.i(TAG, "Camera bound successfully!")
            
            // CRITICAL: Set surface provider AFTER binding - like MediaPipe example
            surfaceProvider?.let { provider ->
                preview?.setSurfaceProvider(provider)
                Log.i(TAG, "Surface provider set AFTER binding")
            }
            
            // Observe camera state
            camera?.cameraInfo?.cameraState?.observe(this) { state ->
                Log.i(TAG, "Camera State: ${state.type} (error: ${state.error})")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind camera", e)
            throw e
        }
    }
    
    fun destroy() {
        Log.i(TAG, "Destroying camera session...")
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        cameraProvider?.unbindAll()
        camera = null
        preview = null
        imageAnalyzer = null
    }
    
    fun checkCameraPermission() {
        val status = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        if (status != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("Camera permission not granted")
        }
    }
}
