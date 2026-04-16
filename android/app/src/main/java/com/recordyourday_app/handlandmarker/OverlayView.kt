package com.recordyourday_app.handlandmarker

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.util.Log
import android.view.View
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import kotlin.math.max
import kotlin.math.min

/**
 * Overlay view for drawing hand landmarks on top of camera preview.
 * Uses the same transform as TextureView for accurate overlay alignment.
 */
class OverlayView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {

    companion object {
        private const val TAG = "OverlayView"
    }

    private var results: HandLandmarkerResult? = null
    private var pointPaint = Paint()
    private var linePaint = Paint()

    private var scaleFactor: Float = 1f
    private var imageWidth: Int = 1
    private var imageHeight: Int = 1

    // Simple mapping: just use view dimensions directly
    private var drawWidth: Float = 1f
    private var drawHeight: Float = 1f
    
    init {
        initPaints()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            drawWidth = w.toFloat()
            drawHeight = h.toFloat()
            Log.i(TAG, "onSizeChanged: ${w}x${h}")
        }
    }

    fun clear() {
        results = null
        pointPaint.reset()
        linePaint.reset()
        initPaints()
        invalidate()
    }
    
    private fun initPaints() {
        linePaint.color = Color.parseColor("#00FF00") // Green
        linePaint.strokeWidth = 8f
        linePaint.style = Paint.Style.STROKE
        
        pointPaint.color = Color.parseColor("#FF0000") // Red
        pointPaint.strokeWidth = 16f
        pointPaint.style = Paint.Style.FILL
    }
    
    override fun draw(canvas: Canvas) {
        super.draw(canvas)

        results?.let { handLandmarkerResult ->
            // Simple direct mapping: normalized coords (0-1) map to view dimensions
            // Both the preview and the rotated analysis image share the same coordinate space

            for (landmark in handLandmarkerResult.landmarks()) {
                // Draw connections first
                HandLandmarker.HAND_CONNECTIONS.forEach {
                    val startX = landmark.get(it!!.start()).x() * drawWidth
                    val startY = landmark.get(it.start()).y() * drawHeight
                    val endX = landmark.get(it.end()).x() * drawWidth
                    val endY = landmark.get(it.end()).y() * drawHeight

                    canvas.drawLine(startX, startY, endX, endY, linePaint)
                }

                // Draw landmarks
                for (normalizedLandmark in landmark) {
                    val x = normalizedLandmark.x() * drawWidth
                    val y = normalizedLandmark.y() * drawHeight
                    canvas.drawPoint(x, y, pointPaint)
                }
            }
        }
    }

    /**
     * Set simple direct mapping using view dimensions.
     * Normalized coordinates (0-1) will map directly to (0-viewWidth) and (0-viewHeight).
     */
    fun setSimpleMapping(viewWidth: Float, viewHeight: Float) {
        this.drawWidth = viewWidth
        this.drawHeight = viewHeight
        Log.i(TAG, "setSimpleMapping: ${viewWidth}x${viewHeight}")
    }

    /**
     * Legacy method for compatibility - redirects to simple mapping.
     */
    fun setPreviewTransform(
        bufferWidth: Int,
        bufferHeight: Int,
        viewWidth: Int,
        viewHeight: Int,
        scale: Float,
        offsetX: Float,
        offsetY: Float
    ) {
        // Use simple mapping instead
        setSimpleMapping(viewWidth.toFloat(), viewHeight.toFloat())
    }
    
    fun setResults(
        handLandmarkerResults: HandLandmarkerResult,
        imageHeight: Int,
        imageWidth: Int,
        runningMode: RunningMode = RunningMode.LIVE_STREAM
    ) {
        results = handLandmarkerResults
        
        this.imageHeight = imageHeight
        this.imageWidth = imageWidth
        
        scaleFactor = when (runningMode) {
            RunningMode.IMAGE,
            RunningMode.VIDEO -> {
                min(width * 1f / imageWidth, height * 1f / imageHeight)
            }
            RunningMode.LIVE_STREAM -> {
                // ImageView is in CENTER_CROP mode. So we need to scale up the
                // landmarks to match with the size that the captured images will be
                // displayed.
                max(width * 1f / imageWidth, height * 1f / imageHeight)
            }
        }
        invalidate()
    }
}
